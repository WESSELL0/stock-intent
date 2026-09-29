"use client";
import Link from "next/link";
import { useState } from "react";
import { ConditionEditor } from "@/components/condition-editor";
import { DataStatus } from "@/components/data-status";
import { formatMetric, StockEvidence } from "@/components/stock-evidence";
import { useWorkspace } from "@/components/workspace-context";

export default function SensitivityPage() {
  const { result, run, running, conditions, conflicts, error } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  if (!result) return <><div className="page-heading"><p className="eyebrow">EXCLUDED & SENSITIVITY</p><h1>排除与条件变化</h1></div><DataStatus /><section className="panel"><p>请先运行一次筛选，再查看排除原因和条件变化。</p><Link className="text-link" href="/">返回条件编辑器</Link></section></>;
  const byCode = new Map(result.results.map(row => [row.stock.thscode, row]));
  const nearMiss = result.near_miss_codes.map(code => byCode.get(code)!).filter(Boolean);
  const unknown = result.results.filter(row => row.unknown_condition_count > 0);
  const selectedRow = result.results.find(row => row.stock.thscode === selected);
  const delta = result.sensitivity;
  const stockName = (code: string) => byCode.get(code)?.stock.name ?? code;
  const changedConditions = result.applied_conditions.flatMap(condition => {
    const baseline = result.baseline_conditions.find(item => item.id === condition.id);
    if (!baseline) return [`新增：${condition.metric_label} ${condition.operator}${condition.threshold}${condition.unit === "percent" ? "%" : "x"}`];
    if (baseline.threshold === condition.threshold && baseline.operator === condition.operator) return [];
    const unit = condition.unit === "percent" ? "%" : "x";
    return [`${condition.metric_label} ${baseline.operator}${baseline.threshold}${unit} → ${condition.operator}${condition.threshold}${unit}`];
  });
  changedConditions.push(...result.baseline_conditions.filter(item => !result.applied_conditions.some(c => c.id === item.id)).map(item => `删除：${item.metric_label} ${item.operator}${item.threshold}${item.unit === "percent" ? "%" : "x"}`));
  return <>
    <div className="page-heading"><p className="eyebrow">EXCLUDED & SENSITIVITY</p><h1>为什么排除，修改后怎样变化</h1><p>基准条件与当前条件在同一份 {result.snapshot.snapshot_id} 上运行。</p></div>
    <DataStatus />
    {delta && <section className="panel" aria-label="条件敏感性"><div className="section-title"><div><h2>条件变化</h2><p>基准：本次意图最初解析的条件。当前：用户确认后的条件。两次运行使用同一个Snapshot ID。</p></div><span className="badge">同快照</span></div>
      <p className="change-description">{changedConditions.length ? changedConditions.join("；") : "当前条件与初始解析条件一致"}</p>
      <div className="delta-count"><strong data-testid="sensitivity-count">{delta.before_count} → {delta.after_count}</strong><span>入选数量变化</span></div>
      <div className="delta-columns"><div><h3>新增入选 · {delta.newly_included.length}</h3>{delta.newly_included.length ? <ul>{delta.newly_included.map(code => <li key={code}>{stockName(code)} <small>{code}</small></li>)}</ul> : <p className="muted">无</p>}</div>
        <div><h3>退出入选 · {delta.newly_excluded.length}</h3>{delta.newly_excluded.length ? <ul>{delta.newly_excluded.map(code => <li key={code}>{stockName(code)} <small>{code}</small></li>)}</ul> : <p className="muted">无</p>}</div></div>
    </section>}
    <section className="panel" aria-label="Near Miss"><div className="section-title"><div><h2>Near Miss · 数据完整的排除股票</h2><p>按失败条件数量升序，再按股票代码稳定排序；缺失数据不会进入此表。</p></div><span className="badge">{nearMiss.length}只</span></div>
      <div className="table-scroll"><table><thead><tr><th>股票</th><th>满足条件</th><th>未通过原因</th><th>证据</th></tr></thead><tbody>
        {nearMiss.slice(0, 40).map(row => <tr key={row.stock.thscode}><td><strong>{row.stock.name}</strong><small className="code">{row.stock.thscode}</small></td>
          <td>{result.applied_conditions.length - row.failed_condition_count}/{result.applied_conditions.length}</td>
          <td className="failure-reason">{row.condition_results.filter(item => item.status === "FAIL").map(item => `${item.condition.metric_label} ${formatMetric(item.actual_value, item.condition.unit)}，要求${item.condition.operator}${formatMetric(item.condition.threshold, item.condition.unit)}`).join("；")}</td>
          <td><button className="subtle-button" onClick={() => setSelected(row.stock.thscode)}>查看证据</button></td></tr>)}
      </tbody></table></div>
      {nearMiss.length > 40 && <p className="muted">显示前40只；排序使用完整数据。</p>}
    </section>
    <section className="panel" aria-label="Unknown Data"><div className="section-title"><div><h2>Unknown Data · 存在无法判断的数据</h2><p>这类股票不列为Near Miss；若同时有已知失败项，整体状态按FAIL规则处理。</p></div><span className="badge warning">{unknown.length}只</span></div>
      {unknown.length ? <div className="table-scroll"><table><thead><tr><th>股票</th><th>整体状态</th><th>缺失条件及原因</th><th>证据</th></tr></thead><tbody>
        {unknown.map(row => <tr key={row.stock.thscode}><td><strong>{row.stock.name}</strong><small className="code">{row.stock.thscode}</small></td><td>{row.status} · {row.unknown_condition_count}项未知</td>
          <td>{row.condition_results.filter(item => item.status === "UNKNOWN").map(item => item.reason).join("；")}</td>
          <td><button className="subtle-button" onClick={() => setSelected(row.stock.thscode)}>查看证据</button></td></tr>)}
      </tbody></table></div> : <p className="muted">本次使用的条件没有未知数据。</p>}
    </section>
    {selectedRow && <StockEvidence row={selectedRow} />}
    <ConditionEditor />
    <div className="action-bar"><span>修改阈值后，在同一快照上重新计算。</span><button className="primary-button" onClick={() => { void run(); }} disabled={running || !conditions.length || !!conflicts.length}>{running ? "运行中…" : "重新运行并比较"}</button></div>
    {error && <div className="form-error" role="alert">{error}</div>}
  </>;
}
