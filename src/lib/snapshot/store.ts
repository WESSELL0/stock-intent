import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MarketSnapshotSchema, type MarketSnapshot } from "../../domain/schemas";

const currentPath = () => process.env.SNAPSHOT_PATH || "data/snapshots/current.json";

function validateRealSnapshot(value: unknown): MarketSnapshot {
  const snapshot = MarketSnapshotSchema.parse(value);
  if (snapshot.mode !== "real" || snapshot.expected_count !== 300) throw new Error("REAL_CSI300_SNAPSHOT_REQUIRED");
  return snapshot;
}

export async function loadSnapshot(path = currentPath()): Promise<MarketSnapshot | null> {
  try {
    const snapshot = validateRealSnapshot(JSON.parse(await readFile(path, "utf8")));
    return snapshot.status === "blocked" ? null : snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveSnapshot(snapshot: MarketSnapshot, current = currentPath()): Promise<string> {
  const validated = validateRealSnapshot(snapshot);
  const directory = dirname(current);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${validated.snapshot_id}.json`);
  const payload = JSON.stringify(validated);
  await writeFile(path, payload, { flag: "wx", mode: 0o600 });
  // Preserve the last usable snapshot when an attempted refresh is blocked.
  if (validated.status === "blocked") return path;
  const temp = join(directory, `.current-${process.pid}-${Date.now()}.json`);
  await writeFile(temp, payload, { mode: 0o600 });
  await rename(temp, current);
  return path;
}
