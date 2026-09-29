// Synthetic unit-test inputs only; these are never served as financial data.
import assert from "node:assert/strict";
import test from "node:test";
import { ConditionSchema, NaturalLanguageIntentSchema, ScreeningResultSchema, SensitivityResultSchema, StockMetricSchema } from "../src/domain/schemas";
import { INITIAL_PRESETS } from "../src/domain/presets";
import { parseProviderNumber } from "../src/lib/finance/numeric";
import { calculateVolatility60d } from "../src/lib/finance/volatility";

const condition = INITIAL_PRESETS[3]!;
const stock = { thscode: "600000.SH", ticker: "600000", name: "单元测试虚构样本" };
const evidence = {
  ...stock, metric: "pe_ttm", value: 20, unit: "multiple", source: "hithink-finance/fuyao",
  endpoint: "/api/a-share/valuations/snapshot", as_of: "2026-09-28T08:00:00Z",
  as_of_semantics: "upstream_batch_max", retrieved_at: "2026-09-28T09:00:00Z", report_period: null,
  calculation_method: "单元测试，不代表真实估值", raw_fields: { pe_ttm: 20 },
  raw_references: [{ path: "data/verification/test/values.json", sha256: "a".repeat(64), field: "item[0].pe_ttm" }],
  quality: "ok", issues: [], adjustment: "not_applicable", observation_count: null, window_start: null, window_end: null,
};

test("conditions reject invented fields, unknown metrics and unit mismatches", () => {
  assert.equal(ConditionSchema.safeParse({ ...condition, forecast_return: 12 }).success, false);
  assert.equal(ConditionSchema.safeParse({ ...condition, metric: "future_gain" }).success, false);
  assert.equal(ConditionSchema.safeParse({ ...condition, unit: "percent" }).success, false);
  assert.equal(ConditionSchema.safeParse({ ...condition, threshold: NaN }).success, false);
  assert.equal(ConditionSchema.safeParse({ ...condition, threshold: "30" }).success, false);
});

test("unsupported intent cannot be silently marked executable", () => {
  assert.equal(NaturalLanguageIntentSchema.safeParse({
    original_query: "找明天一定涨停的股票", universe: "CSI300", combination: "AND", conditions: [], assumptions: [],
    unsupported_requests: [{ phrase: "明天一定涨停", reason: "compliance_boundary", explanation: "不能预测确定性涨跌" }],
    conflicts: [], needs_clarification: false,
  }).success, false);
});

test("financial number parsing preserves negative and null; blanks never become zero", () => {
  assert.equal(parseProviderNumber("10.0000"), 10);
  assert.equal(parseProviderNumber("-1.50"), -1.5);
  for (const invalid of [null, undefined, "", " ", "NaN", "Infinity", "10%", false, Infinity]) assert.equal(parseProviderNumber(invalid), null);
});

test("valid data needs evidence and missing data cannot contain a fabricated numeric value", () => {
  assert.equal(StockMetricSchema.safeParse(evidence).success, true);
  assert.equal(StockMetricSchema.safeParse({ ...evidence, raw_references: [] }).success, false);
  assert.equal(StockMetricSchema.safeParse({ ...evidence, quality: "missing", issues: ["未披露"] }).success, false);
  assert.equal(StockMetricSchema.safeParse({ ...evidence, as_of: null }).success, false);
});

test("unknown evidence cannot masquerade as PASS and summary counts must agree", () => {
  const missing = { ...evidence, value: null, quality: "missing", issues: ["未披露"] };
  const result = { stock, status: "UNKNOWN", passed: null, failed_condition_count: 0, unknown_condition_count: 1,
    condition_results: [{ condition, status: "UNKNOWN", actual_value: null, evidence: missing, reason: "数据不足" }] };
  assert.equal(ScreeningResultSchema.safeParse(result).success, true);
  assert.equal(ScreeningResultSchema.safeParse({ ...result, passed: true }).success, false);
  assert.equal(ScreeningResultSchema.safeParse({ ...result, unknown_condition_count: 0 }).success, false);
});

test("sensitivity count identity and disjoint sets are enforced", () => {
  const delta = { snapshot_id: "test", before_run_id: "a", after_run_id: "b", before_count: 1, after_count: 2,
    newly_included: ["600000.SH"], newly_excluded: [], unknown_before_count: 0, unknown_after_count: 0 };
  assert.equal(SensitivityResultSchema.safeParse(delta).success, true);
  assert.equal(SensitivityResultSchema.safeParse({ ...delta, after_count: 3 }).success, false);
  assert.equal(SensitivityResultSchema.safeParse({ ...delta, newly_excluded: ["600000.SH"] }).success, false);
});

const dates = Array.from({ length: 61 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
test("volatility uses 60 returns, ddof=1, sqrt(252) and percentage-point output", () => {
  let close = 100;
  const bars = dates.map((date, i) => {
    if (i > 0) close *= i % 2 ? 1.01 : 0.99;
    return { date, close };
  });
  const result = calculateVolatility60d(bars, dates);
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    const independentExpected = 0.01 * Math.sqrt(60 / 59) * Math.sqrt(252) * 100;
    assert.ok(Math.abs(result.value - independentExpected) < 1e-10);
    assert.equal(result.observation_count, 60);
  }
});

test("volatility rejects gaps, duplicate dates, insufficient bars and invalid close", () => {
  const bars = dates.map(date => ({ date, close: 100 }));
  assert.equal(calculateVolatility60d(bars.slice(1), dates).status, "missing");
  assert.equal(calculateVolatility60d([...bars, bars[0]!], dates).status, "conflict");
  assert.equal(calculateVolatility60d(bars, dates.slice(1)).status, "missing");
  assert.equal(calculateVolatility60d(bars.map((b, i) => i === 10 ? { ...b, close: 0 } : b), dates).status, "missing");
  assert.equal(calculateVolatility60d(bars, [...dates].reverse()).status, "conflict");
});
