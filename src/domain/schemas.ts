import { z } from "zod";
import { METRIC_IDS, METRICS } from "./metrics";

export const MetricSchema = z.enum(METRIC_IDS);
export const OperatorSchema = z.enum([">", ">=", "<", "<=", "="]);
export const UnitSchema = z.enum(["percent", "multiple"]);
export const ReportPeriodSchema = z.string().regex(/^\d{4}-[1-4]$/);
const TimestampSchema = z.iso.datetime({ offset: true });
const CodeSchema = z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/);
const IdSchema = z.string().min(1).max(120);

export const ConditionSchema = z.strictObject({
  id: IdSchema,
  source_phrase: z.string().min(1).max(1000),
  category: z.enum(["fundamental", "valuation", "risk"]),
  metric: MetricSchema,
  metric_label: z.string().min(1),
  operator: OperatorSchema,
  threshold: z.number().finite(),
  unit: UnitSchema,
  explanation: z.string().min(1).max(2000),
  editable: z.literal(true),
  origin: z.enum(["preset", "user", "ai_interpretation"]),
}).superRefine((c, ctx) => {
  const definition = METRICS[c.metric];
  for (const [field, expected] of [
    ["unit", definition.unit], ["category", definition.category], ["metric_label", definition.label],
  ] as const) {
    if (c[field] !== expected) ctx.addIssue({ code: "custom", path: [field], message: "必须匹配指标白名单定义" });
  }
});

export const NaturalLanguageIntentSchema = z.strictObject({
  original_query: z.string().min(1).max(2000),
  universe: z.literal("CSI300"),
  combination: z.literal("AND"),
  conditions: z.array(ConditionSchema).max(20),
  assumptions: z.array(z.strictObject({
    id: IdSchema, source_phrase: z.string(), explanation: z.string().min(1),
    condition_ids: z.array(IdSchema), acknowledged: z.boolean(),
  })).max(30),
  unsupported_requests: z.array(z.strictObject({
    phrase: z.string().min(1),
    reason: z.enum(["metric_not_supported", "universe_not_supported", "logic_not_supported", "compliance_boundary"]),
    explanation: z.string().min(1),
  })).max(30),
  conflicts: z.array(z.strictObject({
    condition_ids: z.array(IdSchema).min(1),
    kind: z.enum(["contradictory_bounds", "ambiguous_definition", "unsupported_logic"]),
    explanation: z.string().min(1),
  })).max(30),
  needs_clarification: z.boolean(),
}).superRefine((intent, ctx) => {
  const ids = new Set(intent.conditions.map(c => c.id));
  if (ids.size !== intent.conditions.length) ctx.addIssue({ code: "custom", path: ["conditions"], message: "条件 ID 必须唯一" });
  if ((!intent.conditions.length || intent.conflicts.length || intent.unsupported_requests.length) && !intent.needs_clarification) {
    ctx.addIssue({ code: "custom", path: ["needs_clarification"], message: "空条件、冲突或不支持请求必须先澄清" });
  }
  for (const group of [...intent.assumptions, ...intent.conflicts]) {
    if (group.condition_ids.some(id => !ids.has(id))) ctx.addIssue({ code: "custom", message: "引用了不存在的条件 ID" });
  }
});

export const StockSchema = z.strictObject({
  thscode: CodeSchema, ticker: z.string().regex(/^\d{6}$/), name: z.string().min(1),
}).refine(stock => stock.thscode.startsWith(`${stock.ticker}.`), "ticker 与 thscode 必须一致");

// Kept server-side. API/UI evidence will expose allowlisted metadata, never raw files.
export const RawReferenceSchema = z.strictObject({
  path: z.string().regex(/^data\/verification\/[a-zA-Z0-9_./-]+\.json$/)
    .refine(value => !value.split("/").includes(".."), "路径不得越界"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  field: z.string().min(1),
});

export const StockMetricSchema = z.strictObject({
  ...StockSchema.shape,
  metric: MetricSchema,
  value: z.number().finite().nullable(),
  unit: UnitSchema,
  source: z.literal("hithink-finance/fuyao"),
  endpoint: z.string().startsWith("/api/"),
  as_of: TimestampSchema.nullable(),
  as_of_semantics: z.enum(["upstream_batch_max", "last_bar_time", "disclosure_date", "unavailable"]),
  retrieved_at: TimestampSchema,
  report_period: ReportPeriodSchema.nullable(),
  calculation_method: z.string().min(1),
  raw_fields: z.record(z.string(), z.union([z.string(), z.number().finite(), z.null()])),
  raw_references: z.array(RawReferenceSchema),
  quality: z.enum(["ok", "missing", "error", "conflict", "stale"]),
  issues: z.array(z.string().min(1)),
  adjustment: z.enum(["forward", "not_applicable"]),
  observation_count: z.number().int().nonnegative().nullable(),
  window_start: z.iso.date().nullable(),
  window_end: z.iso.date().nullable(),
}).superRefine((m, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!m.thscode.startsWith(`${m.ticker}.`)) issue("ticker 与 thscode 不一致");
  if (m.unit !== METRICS[m.metric].unit) issue("指标单位不匹配");
  if (m.quality === "ok" && (m.value === null || !m.raw_references.length)) issue("可用数据必须有数值和原始证据");
  if (["missing", "error", "conflict"].includes(m.quality) && m.value !== null) issue("不可用数据不得带入筛选值");
  if (m.quality !== "ok" && !m.issues.length) issue("异常必须有原因");
  if ((m.as_of === null) !== (m.as_of_semantics === "unavailable")) issue("时点与时点语义不一致");
  if (m.as_of === null && !m.issues.length) issue("未提供数据时间必须显式说明");
  if (METRICS[m.metric].category === "fundamental" && m.quality === "ok" && !m.report_period) issue("财务指标必须标注报告期");
  if (m.metric === "volatility_60d" && m.quality === "ok") {
    if (m.adjustment !== "forward" || m.observation_count !== 60 || !m.window_start || !m.window_end || m.value! < 0) issue("波动率窗口、复权或样本数错误");
  }
});

export const ConditionResultSchema = z.strictObject({
  condition: ConditionSchema,
  status: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  actual_value: z.number().finite().nullable(),
  evidence: StockMetricSchema,
  reason: z.string().min(1),
}).superRefine((r, ctx) => {
  const valid = r.evidence.quality === "ok";
  if (r.condition.metric !== r.evidence.metric || r.actual_value !== r.evidence.value) ctx.addIssue({ code: "custom", message: "条件与证据不一致" });
  if ((r.status === "UNKNOWN") === valid) ctx.addIssue({ code: "custom", message: "未知状态必须与证据质量一致" });
});

export const ScreeningResultSchema = z.strictObject({
  stock: StockSchema,
  status: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  passed: z.boolean().nullable(),
  condition_results: z.array(ConditionResultSchema).min(1),
  failed_condition_count: z.number().int().nonnegative(),
  unknown_condition_count: z.number().int().nonnegative(),
}).superRefine((r, ctx) => {
  const fails = r.condition_results.filter(c => c.status === "FAIL").length;
  const unknowns = r.condition_results.filter(c => c.status === "UNKNOWN").length;
  const status = fails ? "FAIL" : unknowns ? "UNKNOWN" : "PASS";
  const passed = status === "UNKNOWN" ? null : status === "PASS";
  if (r.status !== status || r.passed !== passed || fails !== r.failed_condition_count || unknowns !== r.unknown_condition_count) ctx.addIssue({ code: "custom", message: "汇总与逐条件状态不一致" });
  if (r.condition_results.some(c => c.evidence.thscode !== r.stock.thscode)) ctx.addIssue({ code: "custom", message: "证据股票不一致" });
  if (new Set(r.condition_results.map(c => c.condition.id)).size !== r.condition_results.length) ctx.addIssue({ code: "custom", message: "条件结果 ID 重复" });
});

export const MarketSnapshotSchema = z.strictObject({
  schema_version: z.literal("1"),
  snapshot_id: IdSchema,
  mode: z.enum(["real", "demo"]),
  built_at: TimestampSchema,
  market_date: z.iso.date(),
  report_period: ReportPeriodSchema,
  universe: z.literal("CSI300"),
  index_thscode: z.literal("000300.SH"),
  constituent_as_of: TimestampSchema,
  constituent_evidence: RawReferenceSchema,
  expected_count: z.number().int().positive(),
  status: z.enum(["ready", "partial", "blocked"]),
  issues: z.array(z.string()),
  stocks: z.array(z.strictObject({ stock: StockSchema, metrics: z.array(StockMetricSchema).length(7) })),
}).superRefine((s, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (s.expected_count !== s.stocks.length) issue("必须保留全部成分，缺失股票不能静默丢弃");
  if (new Set(s.stocks.map(r => r.stock.thscode)).size !== s.stocks.length) issue("重复股票");
  for (const row of s.stocks) {
    if (new Set(row.metrics.map(m => m.metric)).size !== 7 || row.metrics.some(m => m.thscode !== row.stock.thscode)) issue("指标集合或股票身份不一致");
    if (row.metrics.some(m => m.report_period !== null && m.report_period !== s.report_period)) issue("不能混用财务报告期");
  }
  if (s.status === "ready" && s.stocks.some(r => r.metrics.some(m => m.quality !== "ok"))) issue("ready 不得掩盖缺失数据");
  if (s.status !== "ready" && !s.issues.length) issue("非完整快照必须说明原因");
});

export const ScreeningRunSchema = z.strictObject({
  run_id: IdSchema, snapshot_id: IdSchema, executed_at: TimestampSchema,
  intent: NaturalLanguageIntentSchema,
  conditions_hash: z.string().regex(/^[a-f0-9]{64}$/),
  results: z.array(ScreeningResultSchema),
});

export const SensitivityResultSchema = z.strictObject({
  snapshot_id: IdSchema, before_run_id: IdSchema, after_run_id: IdSchema,
  before_count: z.number().int().nonnegative(), after_count: z.number().int().nonnegative(),
  newly_included: z.array(CodeSchema), newly_excluded: z.array(CodeSchema),
  unknown_before_count: z.number().int().nonnegative(), unknown_after_count: z.number().int().nonnegative(),
}).superRefine((s, ctx) => {
  const added = new Set(s.newly_included), removed = new Set(s.newly_excluded);
  if (added.size !== s.newly_included.length || removed.size !== s.newly_excluded.length || [...added].some(c => removed.has(c)) || s.before_count + added.size - removed.size !== s.after_count) ctx.addIssue({ code: "custom", message: "集合变化与数量不一致" });
});

export type Condition = z.infer<typeof ConditionSchema>;
export type NaturalLanguageIntent = z.infer<typeof NaturalLanguageIntentSchema>;
export type StockMetric = z.infer<typeof StockMetricSchema>;
export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
export type ScreeningRun = z.infer<typeof ScreeningRunSchema>;
export type SensitivityResult = z.infer<typeof SensitivityResultSchema>;
