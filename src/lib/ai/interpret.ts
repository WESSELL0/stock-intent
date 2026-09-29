import "server-only";
import { type NaturalLanguageIntent } from "@/domain/schemas";
import { parseModelIntent } from "@/domain/parse-intent";
import { requestIntentJSON } from "./provider";
import { INTENT_SYSTEM_PROMPT } from "./prompts";

export async function interpretNaturalLanguage(query: string): Promise<NaturalLanguageIntent> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 2000) throw new Error("QUERY_LENGTH_INVALID");
  const text = await requestIntentJSON(INTENT_SYSTEM_PROMPT, trimmed);
  return parseModelIntent(text, trimmed);
}
