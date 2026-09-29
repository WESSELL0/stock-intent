import assert from "node:assert/strict";
import test from "node:test";
import { parseModelIntent } from "../src/domain/parse-intent";
import { INITIAL_PRESETS } from "../src/domain/presets";

const query = "找市盈率低于20倍的公司";
const condition = { ...INITIAL_PRESETS[3]!, id: "ai-pe-cap", source_phrase: "市盈率低于20倍",
  operator: "<" as const, threshold: 20, origin: "ai_interpretation" as const };
const intent = { original_query: query, universe: "CSI300", combination: "AND", conditions: [condition],
  assumptions: [], unsupported_requests: [], conflicts: [], needs_clarification: false };

test("valid model intent preserves editable condition without choosing stocks", () => {
  const parsed = parseModelIntent(JSON.stringify(intent), query);
  assert.equal(parsed.conditions[0]?.threshold, 20);
  assert.equal(parsed.needs_clarification, false);
});

test("model cannot invent metrics, claim user origin or acknowledge its own assumptions", () => {
  assert.throws(() => parseModelIntent(JSON.stringify({ ...intent, conditions: [{ ...condition, metric: "predicted_return" }] }), query));
  assert.throws(() => parseModelIntent(JSON.stringify({ ...intent, conditions: [{ ...condition, origin: "user" }] }), query));
  assert.throws(() => parseModelIntent(JSON.stringify({ ...intent, assumptions: [{ id: "a1", source_phrase: "合理",
    explanation: "默认解释", condition_ids: [condition.id], acknowledged: true }] }), query));
  assert.throws(() => parseModelIntent(JSON.stringify(intent), "不同的输入"), /LLM_QUERY_MISMATCH/);
});

test("deterministic conflict is added without dropping model ambiguity", () => {
  const lower = { ...condition, id: "ai-pe-floor", operator: ">" as const, threshold: 30 };
  const modelConflict = { condition_ids: [condition.id], kind: "ambiguous_definition",
    explanation: "市盈率口径需要澄清" };
  const parsed = parseModelIntent(JSON.stringify({ ...intent, conditions: [condition, lower],
    conflicts: [modelConflict], needs_clarification: true }), query);
  assert.equal(parsed.conflicts.length, 2);
  assert.equal(parsed.conflicts[0]?.kind, "ambiguous_definition");
  assert.equal(parsed.conflicts[1]?.kind, "contradictory_bounds");
  assert.equal(parsed.needs_clarification, true);
});
test("provider and deterministic reports of the same bound conflict appear once", () => {
  const lower = { ...condition, id: "ai-pe-floor", operator: ">" as const, threshold: 30 };
  const modelConflict = { condition_ids: [lower.id, condition.id], kind: "contradictory_bounds",
    explanation: "两个市盈率阈值不可同时满足" };
  const parsed = parseModelIntent(JSON.stringify({ ...intent, conditions: [condition, lower],
    conflicts: [modelConflict], needs_clarification: true }), query);
  assert.equal(parsed.conflicts.length, 1);
});
test("model may report only unsupported phrases grounded in the user's text", () => {
  const original = "找市盈率低于20倍的公司，不要银行";
  const grounded = { phrase: "不要银行", reason: "metric_not_supported", explanation: "当前没有行业字段" };
  const valid = { ...intent, original_query: original, unsupported_requests: [grounded], needs_clarification: true };
  assert.equal(parseModelIntent(JSON.stringify(valid), original).unsupported_requests.length, 1);
  const invented = { ...grounded, phrase: "（隐含）保证未来收益" };
  assert.throws(() => parseModelIntent(JSON.stringify({ ...valid, unsupported_requests: [grounded, invented] }), original),
    /LLM_UNGROUNDED_UNSUPPORTED/);
});
