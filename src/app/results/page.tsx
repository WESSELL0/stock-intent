"use client";
import Link from "next/link";
import { useState } from "react";
import { DataStatus } from "@/components/data-status";
import { formatMetric, StockEvidence } from "@/components/stock-evidence";
import { useWorkspace } from "@/components/workspace-context";

export default function ResultsPage() {
  const { result } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  if (!result) return <><div className="page-heading"><p className="eyebrow">SCREENING RESULTS</p><h1>筛选结果与逐项证据</h1></div><DataStatus /><section className="panel"><p>尚未运行筛选。请先输入意图并确认条件。</p><Link className="text-link" href="/">返回条件编辑器</Link></section></>;
  const pass = result.results.filter(row => row.status === "PASS");
  const selectedRow = pass.find(row => row.stock.thscode === selected);
  const displayedMetrics = result.applied_conditions.filter((condition, index, all) =>
    all.findIndex(item => item.metric === condition.metric) === index);
  return <>
    <div className="page-heading"><p className="eyebrow">SCREENING RESULTS</p><h1>筛选结果与逐项证据</h1><p>只将所有条件均通过的股票列为入选；数据不足单独计数。</p></div>
    <DataStatus />
    <div className="summary-strip four"><div><span>沪深300股票</span><strong>{result.counts.total}</strong></div><div><span>PASS</span><strong className="green">{result.counts.pass}</strong></div><div><span>FAIL</span><strong className="red">{result.counts.fail}</strong></div><div><span>UNKNOWN</span><strong className="amber">{result.counts.unknown}</strong></div></div>
    <section className="panel"><div className="section-title"><div><h2>入选股票</h2><p>表格显示本次实际使用的指标；点击股票查看每个条件的真实证据。</p></div><Link className="text-link" href="/sensitivity">查看排除原因与条件变化 →</Link></div>
      {pass.length === 0 ? <p className="muted">当前条件下没有全部通过的股票。可返回调整条件。</p> :
        <div className="table-scroll"><table><thead><tr><th>股票</th>{displayedMetrics.map(item => <th key={item.metric}>{item.metric_label}</th>)}<th>结果</th><th>证据</th></tr></thead><tbody>
          {pass.map(row => <tr key={row.stock.thscode}><td><strong>{row.stock.name}</strong><small className="code">{row.stock.thscode}</small></td>
            {displayedMetrics.map(item => <td key={item.metric}>{formatMetric(row.metrics[item.metric]?.value, item.unit)}</td>)}
            <td><span className="status-pill pass">PASS</span></td><td><button className="subtle-button" onClick={() => setSelected(row.stock.thscode)}>查看证据</button></td></tr>)}
        </tbody></table></div>}
    </section>
    {selectedRow && <StockEvidence row={selectedRow} />}
  </>;
}
