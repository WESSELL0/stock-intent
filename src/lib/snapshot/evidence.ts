import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { MarketSnapshot } from "../../domain/schemas";

/** Verify local private captures before a newly built snapshot becomes current. */
export async function verifySnapshotEvidence(snapshot: MarketSnapshot): Promise<number> {
  const references = [snapshot.constituent_evidence,
    ...snapshot.stocks.flatMap(row => row.metrics.flatMap(metric => metric.raw_references))];
  const unique = new Map<string, string>();
  for (const reference of references) {
    const prior = unique.get(reference.path);
    if (prior && prior !== reference.sha256) throw new Error("EVIDENCE_PATH_HASH_CONFLICT");
    unique.set(reference.path, reference.sha256);
  }
  for (const [path, expected] of unique) {
    const actual = createHash("sha256").update(await readFile(path)).digest("hex");
    if (actual !== expected) throw new Error(`EVIDENCE_HASH_MISMATCH:${path}`);
  }
  return unique.size;
}
