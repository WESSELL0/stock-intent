import { createHash, randomUUID } from "node:crypto";
import { METRICS } from "./metrics";
import { ConditionSchema, NaturalLanguageIntentSchema, ScreeningRunSchema, type Condition, type MarketSnapshot, type ScreeningResult, type ScreeningRun, type StockMetric } from "./schemas";
import { detectConflicts } from "./conflicts";

export function compare(value: number, operator: Condition["operator"], threshold: number): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case "=": return value === threshold;
  }
}

function conditionReason(condition: Condition, evidence: StockMetric, status: "PASS" | "FAIL" | "UNKNOWN"): string {
  const label = METRICS[condition.metric].label;
  if (status === "UNKNOWN") return `${label}无法判断：${evidence.issues.join("；") || evidence.quality}`;
  const unit = condition.unit === "percent" ? "%" : "倍";
  return `${label}实际为${evidence.value}${unit}，条件${condition.operator}${condition.threshold}${unit}，${status === "PASS" ? "满足" : "不满足"}。`;
}

export function screenSnapshot(snapshot: MarketSnapshot, input: Condition[], originalQuery = "用户确认的筛选条件"): ScreeningRun {
  if (snapshot.status === "blocked" || snapshot.stocks.length !== 300) throw new Error("SNAPSHOT_NOT_SCREENABLE");
  if (!input.length || input.length > 20) throw new Error("CONDITIONS_EMPTY_OR_TOO_MANY");
  const conditions = input.map(c => ConditionSchema.parse(c));
  if (new Set(conditions.map(c => c.id)).size !== conditions.length) throw new Error("DUPLICATE_CONDITION_ID");
  const conflicts = detectConflicts(conditions);
  if (conflicts.length) throw new Error(`CONFLICTING_CONDITIONS:${conflicts.map(c => c.condition_ids.join(",")).join("|")}`);
  const intent = NaturalLanguageIntentSchema.parse({ original_query: originalQuery, universe: "CSI300", combination: "AND",
    conditions, assumptions: conditions.filter(c => c.origin !== "user").map(c => ({ id: `assumption-${c.id}`, source_phrase: c.source_phrase,
      explanation: c.explanation, condition_ids: [c.id], acknowledged: true })),
    unsupported_requests: [], conflicts: [], needs_clarification: false });
  const results: ScreeningResult[] = snapshot.stocks.map(row => {
    const metrics = new Map(row.metrics.map(metric => [metric.metric, metric]));
    const conditionResults = conditions.map(condition => {
      const evidence = metrics.get(condition.metric);
      if (!evidence) throw new Error("SNAPSHOT_METRIC_KEY_MISSING");
      const status: "PASS" | "FAIL" | "UNKNOWN" = evidence.quality !== "ok" || evidence.value === null ? "UNKNOWN"
        : compare(evidence.value, condition.operator, condition.threshold) ? "PASS" : "FAIL";
      return { condition, status, actual_value: evidence.value, evidence, reason: conditionReason(condition, evidence, status) };
    });
    const failed = conditionResults.filter(result => result.status === "FAIL").length;
    const unknown = conditionResults.filter(result => result.status === "UNKNOWN").length;
    const status = failed ? "FAIL" : unknown ? "UNKNOWN" : "PASS";
    return { stock: row.stock, status, passed: status === "UNKNOWN" ? null : status === "PASS",
      condition_results: conditionResults, failed_condition_count: failed, unknown_condition_count: unknown };
  });
  return ScreeningRunSchema.parse({ run_id: randomUUID(), snapshot_id: snapshot.snapshot_id, executed_at: new Date().toISOString(),
    intent, conditions_hash: createHash("sha256").update(JSON.stringify(conditions)).digest("hex"), results });
}

export function nearMiss(run: ScreeningRun, limit = 30): ScreeningResult[] {
  return run.results.filter(row => row.status === "FAIL" && row.unknown_condition_count === 0)
    .sort((a, b) => a.failed_condition_count - b.failed_condition_count || a.stock.thscode.localeCompare(b.stock.thscode)).slice(0, limit);
}
