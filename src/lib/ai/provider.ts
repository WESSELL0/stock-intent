import "server-only";
import { fetchIntentJSON } from "./transport";

export function llmConfigured(): boolean { return Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL); }

/** OpenAI-compatible Chat Completions adapter; no financial credential is passed. */
export async function requestIntentJSON(system: string, user: string): Promise<string> {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!key || !model) throw new Error("LLM_NOT_CONFIGURED");
  return fetchIntentJSON({ key, model, base: process.env.LLM_BASE_URL || "https://api.openai.com/v1" }, system, user);
}
