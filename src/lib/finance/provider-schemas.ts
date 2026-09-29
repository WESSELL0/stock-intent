import { z } from "zod";

export const ProviderStockSchema = z.object({
  thscode: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
  ticker: z.string(), name: z.string().nullable(),
});
export const ProviderConstituentsSchema = z.object({
  timestamp: z.number().int().nonnegative(), item: z.array(ProviderStockSchema),
});
export const ProviderCalendarSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  item: z.array(z.object({ date_ms: z.number().int(), date: z.string().regex(/^\d{8}$/) })),
});
export const ProviderFinancialsSchema = z.object({
  thscode: z.string(), report: z.string(),
  abilities: z.array(z.object({
    ability: z.string(),
    indicators: z.array(z.object({ index_id: z.string(), value: z.string().nullable() })),
  })),
});
export const ProviderValuationsSchema = z.object({
  timestamp: z.number().int().nonnegative().nullable(), total: z.number().int().nonnegative(),
  item: z.array(ProviderStockSchema.extend({
    pe_ttm: z.number().finite().nullable(), pb_mrq: z.number().finite().nullable(),
  })),
});
export const ProviderHistorySchema = z.object({
  thscode: z.string(), adjust: z.literal("forward"),
  timestamp: z.number().int().nonnegative(),
  item: z.array(z.object({ date_ms: z.number().int(), close_price: z.number().finite() })),
});

export const FINANCIAL_FIELD_MAP = {
  operating_income_yoy_growth_ratio: "calculate_operating_income_yoy_growth_ratio",
  parent_holder_net_profit_yoy_growth_ratio: "calculate_parent_holder_net_profit_yoy_growth_ratio",
  index_weighted_avg_roe: "index_weighted_avg_roe",
  sale_gross_margin: "sale_gross_margin",
} as const;
