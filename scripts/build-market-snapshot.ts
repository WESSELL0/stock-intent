import { buildMarketSnapshot } from "../src/lib/snapshot/build";

const args = process.argv.slice(2);
const reportAt = args.indexOf("--report");
const report = reportAt >= 0 ? args[reportAt + 1] : "2026-2";
if (!report || !/^\d{4}-[1-4]$/.test(report)) throw new Error("请使用 --report YYYY-Q 指定财报期");
if (args.includes("--plan")) {
  console.log(JSON.stringify({ report_period: report, universe: "CSI300", members: 300, remote_calls_max: 605,
    batches: { valuation: 3, financial: 300, history: 300, concurrency: 2 },
    cache: `data/verification/snapshot-<Asia/Shanghai date>-${report}`,
    output: "data/snapshots/current.json", partial_allowed: true }, null, 2));
} else if (args.includes("--execute")) {
  const result = await buildMarketSnapshot(report, message => console.log(`[snapshot] ${message}`));
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error("使用 --plan 或 --execute");
}
