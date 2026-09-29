import { SensitivityResultSchema, type ScreeningRun, type SensitivityResult } from "./schemas";

export function compareRuns(before: ScreeningRun, after: ScreeningRun): SensitivityResult {
  if (before.snapshot_id !== after.snapshot_id) throw new Error("SNAPSHOT_IDS_DIFFER");
  const passed = (run: ScreeningRun) => new Set(run.results.filter(row => row.status === "PASS").map(row => row.stock.thscode));
  const first = passed(before), second = passed(after);
  if (before.results.length !== after.results.length ||
      before.results.some(row => !after.results.some(other => other.stock.thscode === row.stock.thscode))) throw new Error("UNIVERSE_IDS_DIFFER");
  return SensitivityResultSchema.parse({
    snapshot_id: before.snapshot_id, before_run_id: before.run_id, after_run_id: after.run_id,
    before_count: first.size, after_count: second.size,
    newly_included: [...second].filter(code => !first.has(code)).sort(),
    newly_excluded: [...first].filter(code => !second.has(code)).sort(),
    unknown_before_count: before.results.filter(row => row.status === "UNKNOWN").length,
    unknown_after_count: after.results.filter(row => row.status === "UNKNOWN").length,
  });
}
