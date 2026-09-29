import { NaturalLanguageIntentSchema, type NaturalLanguageIntent } from "./schemas";

type Unsupported = NaturalLanguageIntent["unsupported_requests"][number];
const shanghaiDay = (now: Date) => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
const quarterByName: Record<string, number> = { 年报: 4, 年度报告: 4, 半年报: 2, 半年度报告: 2, 一季报: 1, 三季报: 3 };

/** Explicit time constraints must match the fixed snapshot; text here is only used for clarification. */
export function unmetTemporalRequirements(query: string, marketDate: string | null,
  reportPeriod: string | null, now = new Date()): Unsupported[] {
  const unmet: Unsupported[] = [];
  const add = (phrase: string, explanation: string) => {
    if (!unmet.some(item => item.phrase === phrase)) unmet.push({ phrase, reason: "data_time_not_supported", explanation });
  };
  const today = shanghaiDay(now);
  for (const match of query.matchAll(/今天|今日|本交易日|当天/g)) {
    if (marketDate !== today) add(match[0], `请求的是${today}的数据，当前快照市场日为${marketDate ?? "未知"}；请改用已标注的快照日期或等待更新。`);
  }
  for (const match of query.matchAll(/实时|此刻|现在|当前时点/g)) {
    add(match[0], `本产品仅使用固定快照（市场日${marketDate ?? "未知"}），无法提供实时或此刻的数据。`);
  }
  for (const match of query.matchAll(/((?:19|20)\d{2})年(年报|年度报告|半年报|半年度报告|一季报|三季报)/g)) {
    const requested = `${match[1]}-${quarterByName[match[2]!]}`;
    if (reportPeriod !== requested) add(match[0], `请求的财报期为${requested}，当前快照财报期为${reportPeriod ?? "未知"}；不能用其他报告期替代。`);
  }
  for (const match of query.matchAll(/((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日/g)) {
    const requested = `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
    if (marketDate !== requested) add(match[0], `请求的市场日为${requested}，当前快照市场日为${marketDate ?? "未知"}；不能用其他日期替代。`);
  }
  return unmet;
}

export function enforceTemporalIntent(intent: NaturalLanguageIntent, marketDate: string | null,
  reportPeriod: string | null, now = new Date()): NaturalLanguageIntent {
  const missing = unmetTemporalRequirements(intent.original_query, marketDate, reportPeriod, now);
  if (!missing.length) return intent;
  const unrelated = intent.unsupported_requests.filter(existing => !missing.some(item =>
    existing.phrase.includes(item.phrase) || item.phrase.includes(existing.phrase)));
  return NaturalLanguageIntentSchema.parse({ ...intent,
    unsupported_requests: [...unrelated, ...missing], needs_clarification: true });
}
