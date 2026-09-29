import assert from "node:assert/strict";
import test from "node:test";
import { enforceTemporalIntent, hasTemporalMention, unmetTemporalRequirements } from "../src/domain/temporal-intent";
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
  assert.equal(unmetTemporalRequirements("只用2025年报数据", "2026-09-28", "2026-2", now)[0]?.phrase, "2025年报");
  assert.equal(unmetTemporalRequirements("只用2026年半年报", "2026-09-28", "2026-2", now).length, 0);
  assert.equal(unmetTemporalRequirements("看2026年9月27日的数据", "2026-09-28", "2026-2", now)[0]?.phrase, "2026年9月27日");
  assert.equal(unmetTemporalRequirements("只用2025-12-31的数据", "2026-09-28", "2026-2", now)[0]?.phrase, "2025-12-31");
  assert.equal(unmetTemporalRequirements("只用2026-09-28的数据", "2026-09-28", "2026-2", now).length, 0);
  assert.match(unmetTemporalRequirements("只用2025-13-99的数据", "2026-09-28", "2026-2", now)[0]!.explanation, /无法识别日期/);
});
test("explicitly waived time requests do not block the current snapshot", () => {
  const waived = "不要求今天的数据，用现有快照筛选PE低于20倍";
  assert.equal(hasTemporalMention(waived), true);
  assert.deepEqual(unmetTemporalRequirements(waived, "2026-09-28", "2026-2", now), []);
  assert.deepEqual(unmetTemporalRequirements("无需实时数据，按现有快照筛选", "2026-09-28", "2026-2", now), []);
  assert.equal(unmetTemporalRequirements("不要求今天，但要2025年报数据", "2026-09-28", "2026-2", now)[0]?.phrase, "2025年报");
  const base = presetIntent("找经营改善、估值合理、走势稳定的公司")!;
  const interpreted = { ...base, original_query: waived, needs_clarification: true,
    unsupported_requests: [{ phrase: "今天", reason: "data_time_not_supported" as const, explanation: "需核对" }] };
  const corrected = enforceTemporalIntent(interpreted, "2026-09-28", "2026-2", now);
  assert.deepEqual(corrected.unsupported_requests, []);
  assert.equal(corrected.needs_clarification, false);
  const composite = enforceTemporalIntent({ ...interpreted,
    unsupported_requests: [{ phrase: "今天的数据和行业排除", reason: "data_time_not_supported", explanation: "混合要求" }] },
  "2026-09-28", "2026-2", now);
  assert.equal(composite.unsupported_requests.length, 1);
});
test("provider time wording is replaced once by snapshot evidence", () => {
  const base = presetIntent("找经营改善、估值合理、走势稳定的公司")!;
  const original_query = "只用2025-12-31的数据筛选PE低于20倍";
  const corrected = enforceTemporalIntent({ ...base, original_query, needs_clarification: true,
    unsupported_requests: [{ phrase: "只用2025-12-31的数据", reason: "data_time_not_supported", explanation: "模型待核对" }] },
  "2026-09-29", "2026-2", now);
  assert.deepEqual(corrected.unsupported_requests.map(item => item.phrase), ["2025-12-31"]);
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
