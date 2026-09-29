import type { Condition } from "./schemas";
import type { MetricId } from "./metrics";

export type ConditionConflict = { condition_ids: string[]; kind: "contradictory_bounds"; explanation: string };
type Boundary = { value: number; inclusive: boolean; id: string };

export function detectConflicts(conditions: Condition[]): ConditionConflict[] {
  const groups = new Map<MetricId, Condition[]>();
  for (const condition of conditions) groups.set(condition.metric, [...(groups.get(condition.metric) ?? []), condition]);
  const conflicts: ConditionConflict[] = [];
  for (const [metric, group] of groups) {
    let lower: Boundary | null = null;
    let upper: Boundary | null = null;
    for (const c of group) {
      if ([">", ">=", "="].includes(c.operator)) {
        const next = { value: c.threshold, inclusive: c.operator !== ">", id: c.id };
        if (!lower || next.value > lower.value || next.value === lower.value && !next.inclusive && lower.inclusive) lower = next;
      }
      if (["<", "<=", "="].includes(c.operator)) {
        const next = { value: c.threshold, inclusive: c.operator !== "<", id: c.id };
        if (!upper || next.value < upper.value || next.value === upper.value && !next.inclusive && upper.inclusive) upper = next;
      }
    }
    if (lower && upper && (lower.value > upper.value || lower.value === upper.value && (!lower.inclusive || !upper.inclusive))) {
      conflicts.push({ condition_ids: [...new Set([lower.id, upper.id])], kind: "contradictory_bounds", explanation: `${metric} 的上下界没有共同可取值` });
    }
  }
  return conflicts;
}
