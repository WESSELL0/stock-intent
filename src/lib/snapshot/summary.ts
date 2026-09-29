import { METRIC_IDS } from "../../domain/metrics";
import type { MarketSnapshot } from "../../domain/schemas";

export function snapshotSummary(snapshot: MarketSnapshot) {
  const coverage = Object.fromEntries(METRIC_IDS.map(metric => [metric,
    snapshot.stocks.filter(row => row.metrics.some(item => item.metric === metric && item.quality === "ok" && item.value !== null)).length]));
  return { ready: true, snapshot_id: snapshot.snapshot_id, universe: "沪深300", market_date: snapshot.market_date,
    report_period: snapshot.report_period, status: snapshot.status, stock_count: snapshot.stocks.length,
    built_at: snapshot.built_at, coverage, issues: snapshot.issues };
}
