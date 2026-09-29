import { NaturalLanguageIntentSchema, type NaturalLanguageIntent } from "./schemas";

type Unsupported = NaturalLanguageIntent["unsupported_requests"][number];
type Mention = { phrase: string; kind: "market" | "report" | "realtime"; requested: string | null; waived: boolean };
const shanghaiDay = (now: Date) => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
const quarterByName: Record<string, number> = { 年报: 4, 年度报告: 4, 半年报: 2, 半年度报告: 2, 一季报: 1, 三季报: 3 };
const waiver = /(?:不要求|无需|无须|不用|不需要|不必|放弃)(?:使用|看|用|要)?$/;

function waivedAt(query: string, index: number): boolean {
  return waiver.test(query.slice(Math.max(0, index - 12), index).replace(/\s/g, ""));
}

function validDate(year: string, month: string, day: string): string | null {
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function temporalMentions(query: string): Mention[] {
  const found: Mention[] = [];
  const add = (phrase: string, index: number, kind: Mention["kind"], requested: string | null) =>
    found.push({ phrase, kind, requested, waived: waivedAt(query, index) });
  for (const match of query.matchAll(/(?:今天|今日|本交易日|当天|实时|此刻|现在|当前时点)/g)) {
    add(match[0], match.index, /^(?:实时|此刻|现在|当前时点)$/.test(match[0]) ? "realtime" : "market", null);
  }
  for (const match of query.matchAll(/((?:19|20)\d{2})年?(年报|年度报告|半年报|半年度报告|一季报|三季报)/g)) {
    add(match[0], match.index, "report", `${match[1]}-${quarterByName[match[2]!]}`);
  }
  for (const match of query.matchAll(/((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日/g)) {
    add(match[0], match.index, "market", validDate(match[1]!, match[2]!, match[3]!));
  }
  for (const match of query.matchAll(/((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
    add(match[0], match.index, "market", validDate(match[1]!, match[2]!, match[3]!));
  }
  return found;
}

export function hasTemporalMention(query: string): boolean { return temporalMentions(query).length > 0; }

/** Explicit time constraints must match the fixed snapshot; text here is only used for clarification. */
export function unmetTemporalRequirements(query: string, marketDate: string | null,
  reportPeriod: string | null, now = new Date()): Unsupported[] {
  const unmet: Unsupported[] = [];
  const today = shanghaiDay(now);
  for (const mention of temporalMentions(query)) {
    if (mention.waived) continue;
    let explanation: string | null = null;
    if (mention.kind === "realtime") explanation = `本产品仅使用固定快照（市场日${marketDate ?? "未知"}），无法提供实时或此刻的数据。`;
    else if (mention.kind === "report" && mention.requested !== reportPeriod)
      explanation = `请求的财报期为${mention.requested}，当前快照财报期为${reportPeriod ?? "未知"}；不能用其他报告期替代。`;
    else if (mention.kind === "market") {
      const requested = mention.requested ?? (/^(?:今天|今日|本交易日|当天)$/.test(mention.phrase) ? today : null);
      if (!requested) explanation = `无法识别日期“${mention.phrase}”，请指定有效市场日。`;
      else if (marketDate !== requested) explanation = `请求的市场日为${requested}，当前快照市场日为${marketDate ?? "未知"}；不能用其他日期替代。`;
    }
    if (explanation && !unmet.some(item => item.phrase === mention.phrase))
      unmet.push({ phrase: mention.phrase, reason: "data_time_not_supported", explanation });
  }
  return unmet;
}

export function enforceTemporalIntent(intent: NaturalLanguageIntent, marketDate: string | null,
  reportPeriod: string | null, now = new Date()): NaturalLanguageIntent {
  const mentions = temporalMentions(intent.original_query);
  if (!mentions.length) return intent;
  const missing = unmetTemporalRequirements(intent.original_query, marketDate, reportPeriod, now);
  // Model time labels are replaced by the deterministic snapshot check, including waived requests.
  const unrelated = intent.unsupported_requests.filter(existing =>
    !mentions.some(mention => {
      if (existing.phrase === mention.phrase) return true;
      if (existing.reason !== "data_time_not_supported" || !existing.phrase.includes(mention.phrase)) return false;
      const remainder = existing.phrase.replace(mention.phrase, "")
        .replace(/^(?:(?:不要求|无需|无须|不用|不需要|不必|放弃)(?:使用|看|用|要)?|只用|只使用|用|使用|看|基于|按照)/, "")
        .replace(/^(?:的)?数据$/, "");
      return remainder.trim() === "";
    }));
  const unsupported = [...unrelated, ...missing];
  return NaturalLanguageIntentSchema.parse({ ...intent, unsupported_requests: unsupported,
    needs_clarification: unsupported.length > 0 || intent.conflicts.length > 0 || intent.conditions.length === 0 });
}
