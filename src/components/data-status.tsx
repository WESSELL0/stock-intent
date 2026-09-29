"use client";
import { METRIC_IDS, METRICS } from "@/domain/metrics";
import { useWorkspace } from "./workspace-context";

export function DataStatus() {
  const { snapshot: loadedSnapshot, snapshotError, result } = useWorkspace();
  const snapshot = result?.snapshot ?? loadedSnapshot;
  if (!snapshot) return <section className="data-status" aria-label="数据状态"><div><strong>市场快照{snapshotError ? "不可用" : "加载中"}</strong><p>{snapshotError ?? "正在读取真实数据覆盖情况…"}</p></div><span className="badge warning">未就绪</span></section>;
  const freshness = snapshot.freshness;
  return <section className={`data-status live${freshness.stale ? " stale" : ""}`} aria-label="数据状态"><div className="data-status-main"><strong>沪深300 · {snapshot.stock_count}只 · {snapshot.status === "partial" ? "部分覆盖" : "完整覆盖"}</strong>
    <p>Snapshot {snapshot.snapshot_id} · 市场日 {snapshot.market_date} · 财报期 {snapshot.report_period}</p>
    <p className={freshness.stale ? "freshness-warning" : "freshness-note"}>{freshness.date_anomaly
      ? "快照市场日晚于当前北京时间，日期异常；请核验数据来源后再使用。"
      : freshness.stale
        ? `过期快照：市场日距今${freshness.age_calendar_days}个自然日，超过${freshness.stale_after_days}日提示线。结果仅反映${snapshot.market_date}，请刷新快照后再用于当前研究。`
        : `固定快照：结果仅反映${snapshot.market_date}；此后行情和财务变化未包含在内。`}</p>
    <div className="coverage-line">{METRIC_IDS.map(metric => <span key={metric} title={METRICS[metric].label}>{METRICS[metric].label} {snapshot.coverage[metric]}/{snapshot.stock_count}</span>)}</div>
  </div><span className={`badge ${snapshot.status === "partial" || freshness.stale ? "warning" : "good"}`}>{freshness.stale ? freshness.date_anomaly ? "DATE ERROR" : "STALE" : snapshot.status.toUpperCase()}</span></section>;
}
