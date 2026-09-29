import assert from "node:assert/strict";
import test from "node:test";
import { canConfirmAmbiguousInterpretation, confirmAmbiguousInterpretation, presetIntent, needsQueryClarification } from "../src/domain/preset-intent";

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
test("explicit confirmation resolves disclosed ambiguity but cannot dismiss unsupported requests", () => {
  const intent = presetIntent(example)!;
  const ambiguous = { ...intent, needs_clarification: true,
    conflicts: [{ condition_ids: ["risk-cap"], kind: "ambiguous_definition" as const, explanation: "稳定的定义待确认" }] };
  assert.equal(canConfirmAmbiguousInterpretation(ambiguous), true);
  const confirmed = confirmAmbiguousInterpretation(ambiguous);
  assert.equal(confirmed.needs_clarification, false);
  assert.equal(confirmed.assumptions.every(item => item.acknowledged), true);
  assert.equal(needsQueryClarification(confirmed), false);
  const unsupported = { ...ambiguous, unsupported_requests: [{ phrase: "不要银行", reason: "metric_not_supported" as const,
    explanation: "当前指标不支持行业排除" }] };
  assert.equal(canConfirmAmbiguousInterpretation(unsupported), false);
  assert.throws(() => confirmAmbiguousInterpretation(unsupported), /CLARIFICATION_NOT_CONFIRMABLE/);
  assert.equal(canConfirmAmbiguousInterpretation({ ...ambiguous, assumptions: [] }), false);
});
