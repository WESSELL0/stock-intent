export const METRIC_IDS = [
  "operating_income_yoy_growth_ratio",
  "parent_holder_net_profit_yoy_growth_ratio",
  "index_weighted_avg_roe",
  "sale_gross_margin",
  "pe_ttm",
  "pb_mrq",
  "volatility_60d",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];
export type MetricDefinition = {
  label: string;
  unit: "percent" | "multiple";
  category: "fundamental" | "valuation" | "risk";
  definition: string;
};

// Percent values use percentage points throughout: 10 means 10%, never 0.10.
export const METRICS: Record<MetricId, MetricDefinition> = {
  operating_income_yoy_growth_ratio: {
    label: "营业收入同比增长率", unit: "percent", category: "fundamental",
    definition: "指定报告期营业收入与上年同期比较；累计/单季口径须经数据适配器验证。",
  },
  parent_holder_net_profit_yoy_growth_ratio: {
    label: "归母净利润同比增长率", unit: "percent", category: "fundamental",
    definition: "供应商归属于母公司股东净利润同比；原始字段 calculate_parent_holder_net_profit_yoy_growth_ratio。",
  },
  index_weighted_avg_roe: {
    label: "加权净资产收益率（ROE）", unit: "percent", category: "fundamental",
    definition: "指定报告期的 index_weighted_avg_roe 原值，不自行年化。",
  },
  sale_gross_margin: {
    label: "销售毛利率", unit: "percent", category: "fundamental",
    definition: "指定报告期销售毛利率；不适用或未披露时保留空值。",
  },
  pe_ttm: {
    label: "PE TTM", unit: "multiple", category: "valuation",
    definition: "供应商最近连续12个月口径市盈率；保留负值和空值。",
  },
  pb_mrq: {
    label: "PB MRQ", unit: "multiple", category: "valuation",
    definition: "供应商最近已披露报告期口径市净率；不推测未返回的具体报告期。",
  },
  volatility_60d: {
    label: "60日年化波动率", unit: "percent", category: "risk",
    definition: "61个连续市场交易日的前复权收盘价，60个简单收益率样本标准差（ddof=1）×√252×100。",
  },
};
