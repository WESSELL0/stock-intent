// Constructed boundary fixtures; never published or shown as real market data.
import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_PRESETS } from "../src/domain/presets";
import { compare, nearMiss, screenSnapshot } from "../src/domain/screen";
import { detectConflicts } from "../src/domain/conflicts";
import { compareRuns } from "../src/domain/sensitivity";
import { makeSnapshot } from "./fixtures/snapshot";

const condition = INITIAL_PRESETS.find(c => c.id === "valuation-cap")!;

test("all comparison operators respect exact unrounded boundaries", () => {
  assert.equal(compare(30, "=", 30), true);
  assert.equal(compare(30, ">", 30), false);
  assert.equal(compare(30, ">=", 30), true);
  assert.equal(compare(30, "<", 30), false);
  assert.equal(compare(30, "<=", 30), true);
  assert.equal(compare(30.000001, "<=", 30), false);
});

test("same-metric interval conflicts include strict/equal endpoint cases", () => {
  const lower = { ...condition, id: "lo", operator: ">" as const, threshold: 30 };
  const upper = { ...condition, id: "hi", operator: "<=" as const, threshold: 30 };
  assert.equal(detectConflicts([lower, upper]).length, 1);
  assert.equal(detectConflicts([{ ...lower, operator: ">=" }, upper]).length, 0);
  assert.equal(detectConflicts([{ ...lower, operator: "=", threshold: 29 }, upper]).length, 0);
  assert.equal(detectConflicts([{ ...lower, operator: "=", threshold: 31 }, upper]).length, 1);
});

test("full 300-stock screen is three-state; near miss excludes any incomplete stock", () => {
  const snapshot = makeSnapshot();
  const run = screenSnapshot(snapshot, INITIAL_PRESETS);
  const counts = { pass: run.results.filter(r => r.status === "PASS").length,
    fail: run.results.filter(r => r.status === "FAIL").length,
    unknown: run.results.filter(r => r.status === "UNKNOWN").length };
  assert.deepEqual(counts, { pass: 297, fail: 2, unknown: 1 });
  assert.equal(run.results[0]!.status, "PASS");
  assert.equal(run.results[1]!.condition_results.find(r => r.condition.id === "valuation-cap")!.status, "FAIL");
  assert.equal(run.results[2]!.status, "UNKNOWN");
  assert.equal(run.results[3]!.status, "FAIL");
  assert.equal(run.results[3]!.unknown_condition_count, 1);
  assert.deepEqual(nearMiss(run).map(r => r.stock.ticker), ["100001"]);
});

test("same snapshot sensitivity adds only true PASS transitions and rejects mixed versions", () => {
  const snapshot = makeSnapshot();
  const before = screenSnapshot(snapshot, INITIAL_PRESETS);
  const after = screenSnapshot(snapshot, INITIAL_PRESETS.map(c => c.id === "valuation-cap" ? { ...c, threshold: 35 } : c));
  const delta = compareRuns(before, after);
  assert.equal(delta.before_count, 297);
  assert.equal(delta.after_count, 298);
  assert.deepEqual(delta.newly_included, ["100001.SZ"]);
  assert.deepEqual(delta.newly_excluded, []);
  assert.throws(() => compareRuns(before, { ...after, snapshot_id: "another-snapshot" }), /SNAPSHOT_IDS_DIFFER/);
});
