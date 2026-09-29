import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { METRIC_IDS, type MetricId } from "../../domain/metrics";
import { MarketSnapshotSchema, StockSchema, type MarketSnapshot, type StockMetric } from "../../domain/schemas";
import { createFinanceRequester, type Capture, type RequestFailure } from "../finance/request";
import { financialMetrics, valuationMetrics, volatilityMetric, type StockIdentity } from "../finance/normalizers";
import { ProviderCalendarSchema, ProviderConstituentsSchema, ProviderValuationsSchema } from "../finance/provider-schemas";
import { saveSnapshot } from "./store";

type Failure = RequestFailure;
export type CoverageReport = {
  snapshot_id: string; status: MarketSnapshot["status"]; stock_count: number; metric_non_null: Record<MetricId, number>;
  metric_unknown: Record<MetricId, number>; api_failure_count: number; api_failures: Failure[];
  retry_count: number; duration_ms: number; built_at: string; market_date: string; report_period: string;
};
const Report = z.string().regex(/^\d{4}-[1-4]$/);
const shanghaiDate = (timestamp: number) => new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 10);
async function pool<T>(items: T[], concurrency: number, job: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) { const index = next++; await job(items[index]!, index); }
  }));
}

export async function buildMarketSnapshot(reportInput: string, onProgress: (message: string) => void = () => {}): Promise<CoverageReport> {
  const started = Date.now();
  const report = Report.parse(reportInput);
  const runDirectory = `data/verification/snapshot-${shanghaiDate(started)}-${report}`;
  const failures: Failure[] = [];
  let retries = 0;
  await mkdir(runDirectory, { recursive: true });
  const capturedRequest = createFinanceRequester({ onFailure: failure => failures.push(failure), onRetry: () => { retries++; } });
  function request(label: string, args: string[], endpoint: string, target: string, cacheScope = ""): Promise<Capture | null> {
    return capturedRequest(join(runDirectory, `${label}.json`), args, endpoint, target, cacheScope);
  }
  const memberCapture = await request("constituents", ["index", "constituents", "--thscode", "000300.SH"], "/api/a-share-index/constituents/ths-stock-list", "000300.SH");
  if (!memberCapture) throw new Error("INDEX_CONSTITUENTS_UNAVAILABLE");
  const memberData = ProviderConstituentsSchema.parse(memberCapture.data);
  const members: StockIdentity[] = memberData.item.map(row => StockSchema.parse({ thscode: row.thscode, ticker: row.thscode.slice(0, 6), name: row.name })).sort((a, b) => a.thscode.localeCompare(b.thscode));
  if (members.length !== 300 || new Set(members.map(row => row.thscode)).size !== 300) throw new Error("INDEX_MEMBERSHIP_NOT_300_UNIQUE_STOCKS");
  onProgress("沪深300成分：300只，身份校验通过");
  const calendarCapture = await request("calendar", ["market", "calendar"], "/api/a-share/calendar/trading-days", "A股交易日历");
  if (!calendarCapture) throw new Error("TRADING_CALENDAR_UNAVAILABLE");
  const calendar = ProviderCalendarSchema.parse(calendarCapture.data);
  const today = shanghaiDate(started).replaceAll("-", "");
  const localTime = new Date(started + 8 * 3_600_000);
  const marketClosed = localTime.getUTCHours() * 60 + localTime.getUTCMinutes() >= 15 * 60 + 30;
  const days = calendar.item.filter(day => day.date < today || day.date === today && marketClosed).sort((a, b) => a.date_ms - b.date_ms);
  if (days.length < 100) throw new Error("TRADING_CALENDAR_TOO_SHORT");
  const lastDay = days.at(-1)!;
  const marketDate = `${lastDay.date.slice(0, 4)}-${lastDay.date.slice(4, 6)}-${lastDay.date.slice(6, 8)}`;
  const historyStart = days.at(-100)!.date_ms;
  const historyEnd = lastDay.date_ms + 86_399_999;
  const completedDates = days.map(day => `${day.date.slice(0, 4)}-${day.date.slice(4, 6)}-${day.date.slice(6, 8)}`);
  onProgress(`市场日：${marketDate}；财报期：${report}`);
  const financialByCode = new Map<string, StockMetric[]>();
  await pool(members, 2, async (stock, index) => {
    const capture = await request(`financial/${stock.thscode}`, ["financials", "indicators", "--thscode", stock.thscode, "--report", report], "/api/a-share/financials/indicators", stock.thscode);
    financialByCode.set(stock.thscode, financialMetrics(stock, report, capture?.retrievedAt ?? new Date().toISOString(), capture, capture ? undefined : "FINANCIAL_REQUEST_FAILED"));
    if ((index + 1) % 50 === 0) onProgress(`财务：${index + 1}/300`);
  });
  const valuationByCode = new Map<string, StockMetric[]>();
  for (let batch = 0; batch < 3; batch++) {
    const group = members.slice(batch * 100, (batch + 1) * 100);
    const endpoint = "/api/a-share/valuations/snapshot";
    const capture = await request(`valuation/batch-${batch + 1}`, ["valuation", "snapshot", "--thscodes", group.map(stock => stock.thscode).join(",")], endpoint, `batch-${batch + 1}`, `build-${started}`);
    let batchCapture: Capture | null = capture;
    if (capture) {
      try { const data = ProviderValuationsSchema.parse(capture.data); if (data.total !== data.item.length || data.item.some(row => !group.some(stock => stock.thscode === row.thscode))) throw new Error("VALUATION_BATCH_CONFLICT"); }
      catch { failures.push({ code: "VALUATION_BATCH_INVALID", endpoint, target: `batch-${batch + 1}` }); batchCapture = null; }
    }
    for (const stock of group) valuationByCode.set(stock.thscode, valuationMetrics(stock, report, batchCapture?.retrievedAt ?? new Date().toISOString(), batchCapture, batchCapture ? undefined : "VALUATION_REQUEST_FAILED"));
    onProgress(`估值：${Math.min((batch + 1) * 100, 300)}/300`);
  }
  const volatilityByCode = new Map<string, StockMetric>();
  await pool(members, 2, async (stock, index) => {
    const capture = await request(`history/${stock.thscode}`, ["market", "history", "--thscode", stock.thscode, "--start-ms", String(historyStart), "--end-ms", String(historyEnd), "--adjust", "forward"], "/api/a-share/prices/historical", stock.thscode);
    volatilityByCode.set(stock.thscode, volatilityMetric(stock, report, capture?.retrievedAt ?? new Date().toISOString(), capture, completedDates, capture ? undefined : "HISTORY_REQUEST_FAILED"));
    if ((index + 1) % 50 === 0) onProgress(`日K/波动率：${index + 1}/300`);
  });
  const rows = members.map(stock => ({ stock, metrics: [...financialByCode.get(stock.thscode)!, ...valuationByCode.get(stock.thscode)!, volatilityByCode.get(stock.thscode)!] }));
  const metricNonNull = Object.fromEntries(METRIC_IDS.map(metric => [metric, rows.filter(row => row.metrics.some(item => item.metric === metric && item.quality === "ok" && item.value !== null)).length])) as Record<MetricId, number>;
  const metricUnknown = Object.fromEntries(METRIC_IDS.map(metric => [metric, 300 - metricNonNull[metric]])) as Record<MetricId, number>;
  const totalNonNull = Object.values(metricNonNull).reduce((sum, count) => sum + count, 0);
  const status: MarketSnapshot["status"] = totalNonNull === 0 ? "blocked" : totalNonNull === 2100 && failures.length === 0 ? "ready" : "partial";
  const builtAt = new Date().toISOString();
  const issues = status === "ready" ? [] : [`${2100 - totalNonNull}/2100个指标不可用于筛选；详情见每股quality/issues`, `${failures.length}个接口请求最终失败`];
  const identity = createHash("sha256").update(JSON.stringify({ marketDate, report, memberHash: memberCapture.sha256, builtAt, metricNonNull })).digest("hex").slice(0, 12);
  const snapshotId = `snap-${marketDate}-${report}-${identity}`;
  const snapshot = MarketSnapshotSchema.parse({ schema_version: "1", snapshot_id: snapshotId, mode: "real", built_at: builtAt,
    market_date: marketDate, report_period: report, universe: "CSI300", index_thscode: "000300.SH",
    constituent_as_of: new Date(memberData.timestamp).toISOString(),
    constituent_evidence: { path: memberCapture.relative_path, sha256: memberCapture.sha256, field: "item[]" },
    expected_count: 300, status, issues, stocks: rows });
  const coverage: CoverageReport = { snapshot_id: snapshotId, status, stock_count: rows.length,
    metric_non_null: metricNonNull, metric_unknown: metricUnknown, api_failure_count: failures.length,
    api_failures: failures, retry_count: retries, duration_ms: Date.now() - started, built_at: builtAt,
    market_date: marketDate, report_period: report };
  await mkdir("data/snapshots", { recursive: true });
  await writeFile(join("data/snapshots", `${snapshotId}-coverage.json`), JSON.stringify(coverage, null, 2), { mode: 0o600 });
  await saveSnapshot(snapshot);
  onProgress(snapshot.status === "blocked" ? `构建被阻断，已保存诊断快照并保留旧版：${snapshotId}` : `本地快照已更新：${snapshotId}`);
  return coverage;
}
