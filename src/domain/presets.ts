import { METRICS, type MetricId } from "./metrics";
import { ConditionSchema, type Condition } from "./schemas";

function preset(id: string, phrase: string, metric: MetricId, operator: Condition["operator"], threshold: number): Condition {
  const definition = METRICS[metric];
  return ConditionSchema.parse({
    id, source_phrase: phrase, category: definition.category, metric,
    metric_label: definition.label, unit: definition.unit, operator, threshold,
    explanation: "这是系统对模糊描述的默认解释，你可以修改。",
    editable: true, origin: "preset",
  });
}

// Configuration only: this module does NOT parse user queries or claim an AI call.
export const INITIAL_PRESETS = [
  preset("growth-revenue", "经营改善", "operating_income_yoy_growth_ratio", ">=", 10),
  preset("growth-profit", "经营改善", "parent_holder_net_profit_yoy_growth_ratio", ">=", 10),
  preset("valuation-positive", "估值合理", "pe_ttm", ">", 0),
  preset("valuation-cap", "估值合理", "pe_ttm", "<=", 30),
  preset("risk-cap", "走势稳定", "volatility_60d", "<=", 30),
];
