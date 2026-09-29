import assert from "node:assert/strict";
import test from "node:test";
import { snapshotFreshness } from "../src/lib/snapshot/freshness";

test("snapshot age follows Shanghai calendar days and flags old or future market dates", () => {
  const marketDate = "2026-09-28";
  assert.deepEqual(snapshotFreshness(marketDate, new Date("2026-09-29T01:00:00Z")), {
    evaluated_on: "2026-09-29", age_calendar_days: 1, stale_after_days: 3,
    date_anomaly: false, stale: false,
  });
  assert.equal(snapshotFreshness(marketDate, new Date("2026-10-01T15:59:59Z")).stale, false);
  assert.equal(snapshotFreshness(marketDate, new Date("2026-10-01T16:00:00Z")).stale, true);
  const future = snapshotFreshness("2026-09-30", new Date("2026-09-29T01:00:00Z"));
  assert.equal(future.date_anomaly, true);
  assert.equal(future.stale, true);
});
