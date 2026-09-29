import "server-only";
import { type NaturalLanguageIntent } from "@/domain/schemas";
import { parseModelIntent } from "@/domain/parse-intent";
import { requestIntentJSON } from "./provider";
import { INTENT_SYSTEM_PROMPT } from "./prompts";

export async function interpretNaturalLanguage(query: string): Promise<NaturalLanguageIntent> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 2000) throw new Error("QUERY_LENGTH_INVALID");
  const text = await requestIntentJSON(INTENT_SYSTEM_PROMPT, trimmed);
  try { return parseModelIntent(text, trimmed); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "LLM_UNGROUNDED_UNSUPPORTED") throw error;
    // A single retry asks the model to cite only text the user actually wrote.
    const retry = await requestIntentJSON(`${INTENT_SYSTEM_PROMPT}\n上次解析包含用户没有说出的不支持要求。重新检查每个unsupported_requests.phrase，必须逐字摘录用户输入；不要增加隐含诉求。`, trimmed);
    return parseModelIntent(retry, trimmed);
  }
}
