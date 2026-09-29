import { NaturalLanguageIntentSchema, type NaturalLanguageIntent } from "./schemas";
import { detectConflicts } from "./conflicts";

/** Treat model output as untrusted input; no stock facts or numeric decisions enter here. */
export function parseModelIntent(text: string, originalQuery: string): NaturalLanguageIntent {
  let parsed: NaturalLanguageIntent;
  try { parsed = NaturalLanguageIntentSchema.parse(JSON.parse(text)); }
  catch { throw new Error("LLM_INTENT_SCHEMA_INVALID"); }
  if (parsed.original_query !== originalQuery) throw new Error("LLM_QUERY_MISMATCH");
  if (parsed.conditions.some(condition => condition.origin !== "ai_interpretation") ||
      parsed.assumptions.some(assumption => assumption.acknowledged)) throw new Error("LLM_INTENT_SCHEMA_INVALID");
  const deterministicConflicts = detectConflicts(parsed.conditions);
  if (!deterministicConflicts.length) return parsed;
  return NaturalLanguageIntentSchema.parse({ ...parsed,
    conflicts: [...parsed.conflicts, ...deterministicConflicts], needs_clarification: true });
}
