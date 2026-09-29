import { INITIAL_PRESETS } from "./presets";
import { NaturalLanguageIntentSchema, type NaturalLanguageIntent } from "./schemas";

/** Recognize only the complete example. Extra requirements must reach the interpreter. */
export function presetIntent(query: string): NaturalLanguageIntent | null {
  const normalized = query.replace(/\s/g, "");
  if (!/^(?:请)?(?:帮我)?(?:找|寻找|筛选)?经营改善[、，,]估值合理[、，,]走势(?:比较|相对)?稳定(?:的(?:公司|股票))?[。！!]?$/.test(normalized)) return null;
  return NaturalLanguageIntentSchema.parse({ original_query: query, universe: "CSI300", combination: "AND",
    conditions: INITIAL_PRESETS.map(condition => ({ ...condition })),
    assumptions: [
      { id: "growth", source_phrase: "经营改善", condition_ids: ["growth-revenue", "growth-profit"],
        explanation: "默认以营收同比及归母净利润同比均≥10%表示经营改善；未判断连续改善趋势。", acknowledged: false },
      { id: "valuation", source_phrase: "估值合理", condition_ids: ["valuation-positive", "valuation-cap"],
        explanation: "默认以0<PE TTM≤30表示估值合理；未比较行业估值。", acknowledged: false },
      { id: "risk", source_phrase: "走势稳定", condition_ids: ["risk-cap"],
        explanation: "默认以60日年化波动率≤30%表示走势稳定；不代表未来风险或收益。", acknowledged: false },
    ], unsupported_requests: [], conflicts: [], needs_clarification: false });
}

export function needsQueryClarification(intent: NaturalLanguageIntent): boolean {
  return intent.unsupported_requests.length > 0 || intent.conflicts.some(item => item.kind !== "contradictory_bounds") ||
    (intent.needs_clarification && !intent.conflicts.length);
}
