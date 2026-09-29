import assert from "node:assert/strict";
import test from "node:test";
import { enforceTemporalIntent, unmetTemporalRequirements } from "../src/domain/temporal-intent";
import { presetIntent } from "../src/domain/preset-intent";

const now = new Date("2026-09-29T04:00:00.000Z");
const query = "找今天PE低于20倍的沪深300公司";
test("today and realtime words cannot silently use an older fixed snapshot", () => {
  const missing = unmetTemporalRequirements(query, "2026-09-28", "2026-2", now);
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.phrase, "今天");
  assert.equal(missing[0]?.reason, "data_time_not_supported");
  assert.equal(unmetTemporalRequirements(query, "2026-09-29", "2026-2", now).length, 0);
  assert.equal(unmetTemporalRequirements("找实时PE低于20倍的公司", "2026-09-29", "2026-2", now).length, 1);
});
test("explicit report period and dated market requests require matching snapshot fields", () => {
  assert.equal(unmetTemporalRequirements("只用2025年年报", "2026-09-28", "2026-2", now)[0]?.phrase, "2025年年报");
  assert.equal(unmetTemporalRequirements("只用2026年半年报", "2026-09-28", "2026-2", now).length, 0);
  assert.equal(unmetTemporalRequirements("看2026年9月27日的数据", "2026-09-28", "2026-2", now)[0]?.phrase, "2026年9月27日");
});
test("temporal guard retains the model's conditions and prevents execution", () => {
  const base = presetIntent("找经营改善、估值合理、走势稳定的公司")!;
  const interpreted = { ...base, original_query: query };
  const blocked = enforceTemporalIntent(interpreted, "2026-09-28", "2026-2", now);
  assert.equal(blocked.conditions.length, 5);
  assert.equal(blocked.unsupported_requests[0]?.phrase, "今天");
  assert.equal(blocked.needs_clarification, true);
  assert.equal(enforceTemporalIntent(blocked, "2026-09-28", "2026-2", now).unsupported_requests.length, 1);
  const modelUnsupported = { ...interpreted, needs_clarification: true,
    unsupported_requests: [{ phrase: "今天", reason: "metric_not_supported" as const, explanation: "需核对日期" }] };
  const corrected = enforceTemporalIntent(modelUnsupported, "2026-09-28", "2026-2", now);
  assert.equal(corrected.unsupported_requests.length, 1);
  assert.match(corrected.unsupported_requests[0]!.explanation, /2026-09-28/);
});
