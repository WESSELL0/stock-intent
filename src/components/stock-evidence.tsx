"use client";
import type { ResultView } from "./workspace-context";

export function formatMetric(value: number | null | undefined, unit: "percent" | "multiple" = "percent") {
  if (value === null || value === undefined) return "数据缺失";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}${unit === "percent" ? "%" : "x"}`;
}
export function reportLabel(period: string | null) {
  if (!period) return "未提供";
  const [year, quarter] = period.split("-");
  return quarter === "2" ? `${year}H1` : quarter === "4" ? `${year}FY` : `${year}Q${quarter}`;
}
export function StockEvidence({ row }: { row: ResultView }) {
  return <section className="evidence-panel" aria-label={`${row.stock.name} 逐条件证据`}>
    <div className="section-title"><div><h2>{row.stock.name} <span className="muted">{row.stock.thscode}</span></h2>
      <p>结果由原始未舍入值比较；展示值仅作阅读用。</p></div><span className={`status-pill ${row.status.toLowerCase()}`}>{row.status}</span></div>
    <div className="evidence-list">{row.condition_results.map((item, index) => <article className="evidence-item" key={item.condition.id}>
      <div className="evidence-head"><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span><strong>{item.condition.metric_label}</strong><span>{item.condition.operator} {formatMetric(item.condition.threshold, item.condition.unit)}</span></div>
      <p>{item.reason}</p>
      <dl><div><dt>实际值</dt><dd>{formatMetric(item.actual_value, item.condition.unit)}</dd></div>
        <div><dt>来源</dt><dd>扶摇金融数据 · {item.evidence.endpoint}</dd></div>
        <div><dt>报告期</dt><dd>{reportLabel(item.evidence.report_period)}</dd></div>
        <div><dt>数据时间</dt><dd>{item.evidence.as_of ? `${item.evidence.as_of}（${item.evidence.as_of_semantics === "upstream_batch_max" ? "批次最大时间" : "最近K线"}）` : "供应商未提供"}</dd></div>
        <div><dt>获取时间</dt><dd>{item.evidence.retrieved_at}</dd></div>
        <div><dt>原始字段</dt><dd>{item.evidence.raw_fields.join(", ") || "未返回"}</dd></div>
        <div><dt>计算口径</dt><dd>{item.evidence.calculation_method}</dd></div>
        {item.evidence.observation_count !== null && <div><dt>样本窗口</dt><dd>{item.evidence.window_start} → {item.evidence.window_end}，{item.evidence.observation_count}个收益率</dd></div>}
        {item.evidence.issues.length > 0 && <div><dt>数据说明</dt><dd>{item.evidence.issues.join("；")}</dd></div>}
      </dl>
      <small>条件 {index + 1}/{row.condition_results.length} · {item.evidence.quality}</small>
    </article>)}</div>
  </section>;
}
