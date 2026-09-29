import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeSnapshot } from "./fixtures/snapshot";
import { loadSnapshot, saveSnapshot } from "../src/lib/snapshot/store";

test("blocked refresh is archived and retains the last usable snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snapshot-store-test-"));
  const current = join(directory, "current.json");
  try {
    assert.equal(await loadSnapshot(current), null);
    // Synthetic fixture is explicitly relabeled only within this isolated store contract test.
    const usable = { ...makeSnapshot(), mode: "real" as const };
    await saveSnapshot(usable, current);
    const before = await readFile(current, "utf8");
    const archived = await saveSnapshot({ ...usable, snapshot_id: "blocked-test", status: "blocked" }, current);
    assert.equal((await loadSnapshot(current))!.snapshot_id, usable.snapshot_id);
    assert.equal(await readFile(current, "utf8"), before);
    assert.equal(JSON.parse(await readFile(archived, "utf8")).status, "blocked");
    await assert.rejects(saveSnapshot({ ...usable, snapshot_id: "duplicate", stocks: [] }, current));
    assert.equal(await readFile(current, "utf8"), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("real-data store rejects demo, incomplete universe and corrupt data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snapshot-store-test-"));
  const current = join(directory, "current.json");
  try {
    const demo = makeSnapshot();
    await assert.rejects(saveSnapshot(demo, current), /REAL_CSI300_SNAPSHOT_REQUIRED/);
    for (const value of [demo, { ...demo, mode: "real", expected_count: 299, stocks: demo.stocks.slice(0, 299) }]) {
      await writeFile(current, JSON.stringify(value));
      await assert.rejects(loadSnapshot(current), /REAL_CSI300_SNAPSHOT_REQUIRED/);
    }
    await writeFile(current, "invalid-json");
    await assert.rejects(loadSnapshot(current));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
