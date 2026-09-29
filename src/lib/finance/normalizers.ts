import { METRICS, type MetricId } from "../../domain/metrics";
import { StockMetricSchema, type StockMetric } from "../../domain/schemas";
import type { CapturedResponse } from "./cli";
import { parseProviderNumber } from "./numeric";
import { calculateVolatility60d } from "./volatility";
import { FINANCIAL_FIELD_MAP, ProviderFinancialsSchema, ProviderHistorySchema, ProviderValuationsSchema } from "./provider-schemas";

export type StockIdentity = { thscode: string; ticker: string; name: string };
type SourceInput = {
  stock: StockIdentity; metric: MetricId; reportPeriod: string; retrievedAt: string;
  capture: CapturedResponse | null; error?: string;
};

function reference(capture: CapturedResponse, field: string) {
  return { path: capture.relative_path, sha256: capture.sha256, field };
}
function base(input: SourceInput, endpoint: string, method: string, options: Partial<StockMetric> = {}): StockMetric {
  const metric = METRICS[input.metric];
  const quality = input.error ? "error" : "missing";
  return StockMetricSchema.parse({
    ...input.stock, metric: input.metric, value: null, unit: metric.unit,
    source: "hithink-finance/fuyao", endpoint, as_of: null, as_of_semantics: "unavailable",
    retrieved_at: input.retrievedAt, report_period: metric.category === "fundamental" ? input.reportPeriod : null,
    calculation_method: method, raw_fields: {}, raw_references: [], quality,
    issues: [input.error ?? "供应商未返回该指标或当前窗口无有效数据"],
    adjustment: input.metric === "volatility_60d" ? "forward" : "not_applicable",
    observation_count: null, window_start: null, window_end: null,
    ...options,
  });
}

export function financialMetrics(stock: StockIdentity, reportPeriod: string, retrievedAt: string, capture: CapturedResponse | null, error?: string): StockMetric[] {
  const entries = Object.entries(FINANCIAL_FIELD_MAP) as Array<[keyof typeof FINANCIAL_FIELD_MAP, string]>;
  if (!capture) return entries.map(([metric]) => base({ stock, metric, reportPeriod, retrievedAt, capture, error }, "/api/a-share/financials/indicators", `报告期${reportPeriod}原始指标`));
  let data;
  try { data = ProviderFinancialsSchema.parse(capture.data); }
  catch { return entries.map(([metric]) => base({ stock, metric, reportPeriod, retrievedAt, capture, error: "FINANCIAL_RESPONSE_INVALID" }, "/api/a-share/financials/indicators", `报告期${reportPeriod}原始指标`)); }
  if (data.thscode !== stock.thscode || data.report !== reportPeriod) return entries.map(([metric]) => base({ stock, metric, reportPeriod, retrievedAt, capture, error: "FINANCIAL_IDENTITY_OR_PERIOD_MISMATCH" }, "/api/a-share/financials/indicators", `报告期${reportPeriod}原始指标`));
  const all = data.abilities.flatMap(group => group.indicators);
  return entries.map(([metric, field]) => {
    const matches = all.filter(item => item.index_id === field);
    const raw = matches[0]?.value ?? null;
    const value = parseProviderNumber(raw);
    const quality = matches.length > 1 ? "conflict" : value === null ? "missing" : "ok";
    return base({ stock, metric, reportPeriod, retrievedAt, capture }, "/api/a-share/financials/indicators",
      `扶摇原始指标 ${field}；单位为百分数值，10表示10%；报告期${reportPeriod}`,
      { value: quality === "ok" ? value : null, quality,
        raw_fields: { [field]: raw }, raw_references: [reference(capture, `abilities[].indicators[index_id=${field}].value`)],
        issues: quality === "ok" ? ["接口未提供披露日；as_of未知"] : [matches.length > 1 ? "同一原始字段重复" : `原始字段 ${field} 缺失或空值`, "接口未提供披露日；as_of未知"],
      });
  });
}

export function valuationMetrics(stock: StockIdentity, reportPeriod: string, retrievedAt: string, capture: CapturedResponse | null, error?: string): StockMetric[] {
  const ids = ["pe_ttm", "pb_mrq"] as const;
  if (!capture) return ids.map(metric => base({ stock, metric, reportPeriod, retrievedAt, capture, error }, "/api/a-share/valuations/snapshot", "供应商当前估值快照"));
  let data;
  try { data = ProviderValuationsSchema.parse(capture.data); }
  catch { return ids.map(metric => base({ stock, metric, reportPeriod, retrievedAt, capture, error: "VALUATION_RESPONSE_INVALID" }, "/api/a-share/valuations/snapshot", "供应商当前估值快照")); }
  const matches = data.item.filter(item => item.thscode === stock.thscode);
  const row = matches[0];
  return ids.map(metric => {
    const value = matches.length === 1 ? row?.[metric] ?? null : null;
    const quality = matches.length > 1 ? "conflict" : value === null ? "missing" : "ok";
    const asOf = data.timestamp === null ? null : new Date(data.timestamp).toISOString();
    return base({ stock, metric, reportPeriod, retrievedAt, capture }, "/api/a-share/valuations/snapshot",
      `供应商${metric.toUpperCase()}当前快照；不自行计算；具体底层财报期未返回`,
      { value, quality, as_of: asOf, as_of_semantics: asOf ? "upstream_batch_max" : "unavailable",
        raw_fields: { [metric]: row?.[metric] ?? null, timestamp: data.timestamp },
        raw_references: [reference(capture, `item[thscode=${stock.thscode}].${metric}`)],
        issues: [
          ...(quality !== "ok" ? [matches.length > 1 ? "股票在估值批次重复" : `${metric} 未返回或为空`] : []),
          ...(asOf ? ["as_of仅为批次最大上游时间，不保证逐字段同步"] : ["供应商未提供估值数据时间"]),
          "供应商未返回具体底层财报期",
        ],
      });
  });
}

export function volatilityMetric(stock: StockIdentity, reportPeriod: string, retrievedAt: string, capture: CapturedResponse | null, completedDates: string[], error?: string): StockMetric {
  const input = { stock, metric: "volatility_60d" as const, reportPeriod, retrievedAt, capture, error };
  const endpoint = "/api/a-share/prices/historical";
  const method = "61个连续交易日前复权收盘价；60个简单收益率样本标准差(ddof=1)×√252×100";
  if (!capture) return base(input, endpoint, method);
  let data;
  try { data = ProviderHistorySchema.parse(capture.data); }
  catch { return base({ ...input, error: "HISTORY_RESPONSE_INVALID" }, endpoint, method); }
  if (data.thscode !== stock.thscode) return base({ ...input, error: "HISTORY_IDENTITY_MISMATCH" }, endpoint, method);
  const date = (timestamp: number) => new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 10);
  const calculated = calculateVolatility60d(data.item.map(item => ({ date: date(item.date_ms), close: item.close_price })), completedDates);
  const asOf = new Date(data.timestamp).toISOString();
  if (calculated.status !== "ok") return base(input, endpoint, method, { quality: calculated.status, as_of: asOf, as_of_semantics: "last_bar_time", issues: [calculated.reason], raw_references: [reference(capture, "item[].close_price")], raw_fields: { adjust: data.adjust } });
  return base(input, endpoint, method, { value: calculated.value, quality: "ok", as_of: asOf,
    as_of_semantics: "last_bar_time", issues: [], observation_count: 60,
    window_start: calculated.window_start, window_end: calculated.window_end,
    raw_fields: { adjust: data.adjust, first_close_date: calculated.window_start, last_close_date: calculated.window_end },
    raw_references: [reference(capture, "item[].close_price")],
  });
}
