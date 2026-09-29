import { z } from "zod";
import { ConditionSchema } from "@/domain/schemas";
import { compareRuns } from "@/domain/sensitivity";
import { nearMiss, screenSnapshot } from "@/domain/screen";
import { loadSnapshot } from "@/lib/snapshot/store";
import { snapshotSummary } from "@/lib/snapshot/summary";
import { JsonBodyError, readJsonBody } from "@/lib/http/json";
import { unmetTemporalRequirements } from "@/domain/temporal-intent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Input = z.strictObject({ original_query: z.string().min(1).max(2000),
  conditions: z.array(ConditionSchema).min(1).max(20),
  baseline_conditions: z.array(ConditionSchema).min(1).max(20).optional() });

export async function POST(request: Request) {
  try {
    const input = Input.parse(await readJsonBody(request, 64_000));
    const snapshot = await loadSnapshot();
    if (!snapshot) return Response.json({ error: "真实市场快照尚未就绪" }, { status: 503 });
    const timeConflicts = unmetTemporalRequirements(input.original_query, snapshot.market_date, snapshot.report_period);
    if (timeConflicts.length) return Response.json({ error: timeConflicts.map(item => item.explanation).join("；") }, { status: 409 });
    const current = screenSnapshot(snapshot, input.conditions, input.original_query);
    const baseline = input.baseline_conditions ? screenSnapshot(snapshot, input.baseline_conditions, input.original_query) : null;
    const sensitivity = baseline ? compareRuns(baseline, current) : null;
    const metrics = new Map(snapshot.stocks.map(row => [row.stock.thscode, row.metrics]));
    const results = current.results.map(row => ({
      stock: row.stock, status: row.status, failed_condition_count: row.failed_condition_count,
      unknown_condition_count: row.unknown_condition_count,
      // One evidence object per stock/metric. Conditions that share a metric reuse it on the client.
      metrics: Object.fromEntries((metrics.get(row.stock.thscode) ?? []).map(item => [item.metric, {
        value: item.value, quality: item.quality,
        evidence: { value: item.value, unit: item.unit, source: item.source, endpoint: item.endpoint,
          as_of: item.as_of, as_of_semantics: item.as_of_semantics, retrieved_at: item.retrieved_at,
          report_period: item.report_period, calculation_method: item.calculation_method,
          quality: item.quality, issues: item.issues, raw_fields: Object.keys(item.raw_fields),
          observation_count: item.observation_count, window_start: item.window_start, window_end: item.window_end },
      }])),
      condition_results: row.condition_results.map(result => ({ condition_id: result.condition.id,
        status: result.status, actual_value: result.actual_value, reason: result.reason })),
    }));
    const counts = { total: results.length, pass: results.filter(row => row.status === "PASS").length,
      fail: results.filter(row => row.status === "FAIL").length, unknown: results.filter(row => row.status === "UNKNOWN").length };
    return Response.json({ snapshot: snapshotSummary(snapshot),
      run_id: current.run_id, applied_conditions: input.conditions, baseline_conditions: input.baseline_conditions ?? [], counts, results,
      near_miss_codes: nearMiss(current, 300).map(row => row.stock.thscode), sensitivity });
  } catch (error) {
    if (error instanceof JsonBodyError) return Response.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error && error.message.startsWith("CONFLICTING_CONDITIONS") ? "筛选条件存在上下界冲突" :
      error instanceof z.ZodError ? "筛选条件格式无效" : "筛选运行失败";
    return Response.json({ error: message }, { status: message === "筛选运行失败" ? 500 : 400 });
  }
}
