import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSnapshot } from "./fixtures/snapshot";
import { verifySnapshotEvidence } from "../src/lib/snapshot/evidence";

test("snapshot promotion requires every referenced raw file to match its hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snapshot-evidence-test-"));
  try {
    const constituents = join(directory, "constituents.json");
    const metrics = join(directory, "metrics.json");
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    await writeFile(constituents, "members");
    await writeFile(metrics, "metrics");
    const source = makeSnapshot();
    const snapshot = { ...source,
      constituent_evidence: { ...source.constituent_evidence, path: constituents, sha256: hash("members") },
      stocks: source.stocks.map(row => ({ ...row, metrics: row.metrics.map(metric => ({ ...metric,
        raw_references: metric.raw_references.map(reference => ({ ...reference, path: metrics, sha256: hash("metrics") })) })) })) };
    assert.equal(await verifySnapshotEvidence(snapshot), 2);
    await writeFile(metrics, "changed");
    await assert.rejects(verifySnapshotEvidence(snapshot), /EVIDENCE_HASH_MISMATCH/);
    await rm(constituents);
    await assert.rejects(verifySnapshotEvidence(snapshot), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
