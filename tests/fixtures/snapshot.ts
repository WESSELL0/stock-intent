// Synthetic test fixtures only; never loaded by the application.
import { METRIC_IDS, METRICS, type MetricId } from "../../src/domain/metrics";
import { MarketSnapshotSchema } from "../../src/domain/schemas";
const stamp = "2026-09-28T08:00:00Z";
const prices: Record<MetricId, number> = {
  operating_income_yoy_growth_ratio: 12, parent_holder_net_profit_yoy_growth_ratio: 15,
  index_weighted_avg_roe: 9, sale_gross_margin: 25, pe_ttm: 20, pb_mrq: 2, volatility_60d: 20,
};
export const makeSnapshot = () => MarketSnapshotSchema.parse({
  schema_version: "1", snapshot_id: "synthetic-boundary-test", mode: "demo", built_at: stamp,
  market_date: "2026-09-28", report_period: "2026-2", universe: "CSI300", index_thscode: "000300.SH",
  constituent_as_of: stamp, constituent_evidence: { path: "data/verification/test/constituents.json", sha256: "a".repeat(64), field: "item[]" },
  expected_count: 300, status: "partial", issues: ["合成边界样本"],
  stocks: Array.from({ length: 300 }, (_, index) => {
    const ticker = String(100000 + index);
    const stock = { thscode: `${ticker}.SZ`, ticker, name: `合成测试${index}` };
    const metrics = METRIC_IDS.map(metric => {
      const missing = metric === "pe_ttm" && index === 2 || metric === "volatility_60d" && index === 3;
      const value = missing ? null : metric === "pe_ttm" && index === 0 ? 30 : metric === "pe_ttm" && index === 1 ? 30.000001 : metric === "pe_ttm" && index === 3 ? 40 : prices[metric];
      return { ...stock, metric, value, unit: METRICS[metric].unit, source: "hithink-finance/fuyao",
        endpoint: metric === "volatility_60d" ? "/api/a-share/prices/historical" : "/api/a-share/financials/indicators",
        as_of: stamp, as_of_semantics: metric === "volatility_60d" ? "last_bar_time" : "upstream_batch_max", retrieved_at: stamp,
        report_period: METRICS[metric].category === "fundamental" ? "2026-2" : null,
        calculation_method: "合成测试", raw_fields: { [metric]: value },
        raw_references: [{ path: "data/verification/test/metrics.json", sha256: "b".repeat(64), field: metric }],
        quality: missing ? "missing" : "ok", issues: missing ? ["合成缺失"] : [],
        adjustment: metric === "volatility_60d" ? "forward" : "not_applicable",
        observation_count: metric === "volatility_60d" && !missing ? 60 : null,
        window_start: metric === "volatility_60d" && !missing ? "2026-07-01" : null,
        window_end: metric === "volatility_60d" && !missing ? "2026-09-28" : null,
      };
    });
    return { stock, metrics };
  }),
});
