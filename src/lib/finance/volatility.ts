export type DailyClose = { date: string; close: number };
export type VolatilityResult =
  | { status: "ok"; value: number; unit: "percent"; observation_count: 60; window_start: string; window_end: string }
  | { status: "missing" | "conflict"; reason: string };

/** Call only with forward-adjusted daily closes and a completed-market-day calendar. */
export function calculateVolatility60d(bars: DailyClose[], completedTradingDates: string[]): VolatilityResult {
  if (completedTradingDates.length < 61) return { status: "missing", reason: "至少需要61个已完成交易日" };
  if (new Set(completedTradingDates).size !== completedTradingDates.length || completedTradingDates.some((day, i) => i > 0 && day <= completedTradingDates[i - 1]!)) return { status: "conflict", reason: "交易日历重复或未升序" };
  if (new Set(bars.map(b => b.date)).size !== bars.length) return { status: "conflict", reason: "K线日期重复" };
  const dates = completedTradingDates.slice(-61);
  const byDate = new Map(bars.map(b => [b.date, b.close]));
  const closes = dates.map(day => byDate.get(day));
  if (closes.some(close => close === undefined || !Number.isFinite(close) || close <= 0)) return { status: "missing", reason: "窗口内K线缺失、停牌缺口或收盘价无效；不填充" };
  const returns = closes.slice(1).map((close, i) => close! / closes[i]! - 1);
  const mean = returns.reduce((sum, value) => sum + value, 0) / 60;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 59;
  const value = Math.sqrt(variance) * Math.sqrt(252) * 100;
  if (!Number.isFinite(value)) return { status: "conflict", reason: "波动率计算溢出" };
  return { status: "ok", value, unit: "percent", observation_count: 60, window_start: dates[0]!, window_end: dates[60]! };
}
