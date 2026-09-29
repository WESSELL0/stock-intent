"use client";
import { METRIC_IDS, METRICS } from "@/domain/metrics";
import { useWorkspace } from "./workspace-context";

export function DataStatus() {
  const { snapshot: loadedSnapshot, snapshotError, result } = useWorkspace();
  const snapshot = result?.snapshot ?? loadedSnapshot;
  if (!snapshot) return <section className="data-status" aria-label="数据状态"><div><strong>市场快照{snapshotError ? "不可用" : "加载中"}</strong><p>{snapshotError ?? "正在读取真实数据覆盖情况…"}</p></div><span className="badge warning">未就绪</span></section>;
  return <section className="data-status live" aria-label="数据状态"><div className="data-status-main"><strong>沪深300 · {snapshot.stock_count}只 · {snapshot.status === "partial" ? "部分覆盖" : "完整覆盖"}</strong>
    <p>Snapshot {snapshot.snapshot_id} · 市场日 {snapshot.market_date} · 财报期 {snapshot.report_period}</p>
    <div className="coverage-line">{METRIC_IDS.map(metric => <span key={metric} title={METRICS[metric].label}>{METRICS[metric].label} {snapshot.coverage[metric]}/{snapshot.stock_count}</span>)}</div>
  </div><span className={`badge ${snapshot.status === "partial" ? "warning" : "good"}`}>{snapshot.status.toUpperCase()}</span></section>;
}
