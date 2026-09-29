import { readFile, stat } from "node:fs/promises";
import { MarketSnapshotSchema } from "../src/domain/schemas";
import { METRIC_IDS } from "../src/domain/metrics";

async function main() {
  const snapshotPath = "data/snapshots/current.json";
  const snapshot = MarketSnapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
  if (snapshot.mode !== "real" || snapshot.status === "blocked" || snapshot.stocks.length !== 300) {
    throw new Error("RELEASE_REQUIRES_REAL_300_STOCK_SNAPSHOT");
  }
  const traces = ["health", "screen", "snapshot"];
  const tracedRoutes: string[] = [];
  for (const route of traces) {
    const path = `.next/server/app/api/${route}/route.js.nft.json`;
    const trace = JSON.parse(await readFile(path, "utf8")) as { files?: string[] };
    if (trace.files?.some(file => file.endsWith("data/snapshots/current.json"))) tracedRoutes.push(route);
    if (trace.files?.some(file => file.includes("data/verification/") || file.includes("artifacts/") || file.endsWith(".env.local"))) {
      throw new Error(`PRIVATE_FILE_IN_DEPLOYMENT_TRACE:${route}`);
    }
  }
  if (tracedRoutes.length !== traces.length) throw new Error(`REAL_SNAPSHOT_NOT_TRACED:${tracedRoutes.join(",")}`);
  const coverage = Object.fromEntries(METRIC_IDS.map(metric => [metric,
    snapshot.stocks.filter(row => row.metrics.some(item => item.metric === metric && item.quality === "ok" && item.value !== null)).length]));
  const ageDays = Math.floor((Date.now() - Date.parse(`${snapshot.market_date}T00:00:00+08:00`)) / 86_400_000);
  console.log(JSON.stringify({ local_snapshot_valid: true, release_artifact: "validated_locally",
    snapshot_id: snapshot.snapshot_id,
    snapshot_status: snapshot.status, stock_count: snapshot.stocks.length,
    market_date: snapshot.market_date, report_period: snapshot.report_period,
    snapshot_age_days: ageDays, size_bytes: (await stat(snapshotPath)).size,
    traced_routes_with_real_snapshot: tracedRoutes, coverage }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : "RELEASE_CHECK_FAILED"); process.exitCode = 1; });
