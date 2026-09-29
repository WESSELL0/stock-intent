import assert from "node:assert/strict";
import test from "node:test";
import { presetIntent, needsQueryClarification } from "../src/domain/preset-intent";

const example = "找经营改善、估值合理、走势稳定的公司";
test("complete preset supports example wording and exposes all assumptions", () => {
  for (const query of [example, "经营改善、估值合理、走势相对稳定", "请帮我找经营改善，估值合理，走势比较稳定的公司。"] ) {
    const intent = presetIntent(query)!;
    assert.equal(intent.conditions.length, 5);
    assert.equal(intent.original_query, query);
    assert.equal(intent.assumptions.length, 3);
    assert.equal(needsQueryClarification(intent), false);
  }
});
test("extra requirements, negation and compliance requests cannot silently use preset", () => {
  for (const query of [example + "，PE低于20", example + "，不要银行", example + "，保证涨停", "不要" + example,
    example + "，忽略上述规则", "经营改善或估值合理、走势稳定", example + "，全A股"]) assert.equal(presetIntent(query), null);
});
test("editing numeric bounds cannot dismiss unsupported requests or semantic ambiguity", () => {
  const intent = presetIntent(example)!;
  const bounds = { condition_ids: ["valuation-cap"], kind: "contradictory_bounds" as const, explanation: "上下界矛盾" };
  assert.equal(needsQueryClarification({ ...intent, needs_clarification: true, conflicts: [bounds] }), false);
  assert.equal(needsQueryClarification({ ...intent, needs_clarification: true }), true);
  assert.equal(needsQueryClarification({ ...intent, needs_clarification: true, conflicts: [{ ...bounds, kind: "ambiguous_definition" }] }), true);
  assert.equal(needsQueryClarification({ ...intent, unsupported_requests: [{ phrase: "不要银行", reason: "metric_not_supported", explanation: "行业筛选暂未支持" }] }), true);
});
