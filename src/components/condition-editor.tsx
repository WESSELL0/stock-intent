"use client";
import { useState } from "react";
import { METRIC_IDS, METRICS, type MetricId } from "@/domain/metrics";
import type { Condition } from "@/domain/schemas";
import { useWorkspace } from "./workspace-context";

export function ConditionEditor() {
  const { conditions, setConditions, addCondition, conflicts } = useWorkspace();
  const [newMetric, setNewMetric] = useState<MetricId>("index_weighted_avg_roe");
  const update = (id: string, patch: Partial<Condition>) => setConditions(conditions.map(c => c.id === id ? { ...c, ...patch, origin: "user" as const, explanation: "用户修改后的明确筛选条件。" } : c));
  return <section className="panel" aria-label="条件编辑器">
    <div className="section-title"><div><h2>我这样理解你的条件</h2><p>这是系统对模糊描述的默认解释，可由用户修改，不代表唯一客观定义。</p></div><span className="badge">AND · 全部满足</span></div>
    {conflicts.length > 0 && <div className="form-error" role="alert">条件冲突：{conflicts.map(c => c.explanation).join("；")}</div>}
    <div className="conditions-list">{conditions.map((c, index) => <div className="condition-row" data-testid={`condition-${c.id}`} key={c.id}>
      <span className="condition-index">{String(index + 1).padStart(2, "0")}</span>
      <div className="condition-name"><strong>{c.metric_label}</strong><small>{c.source_phrase} · {c.origin === "user" ? "用户修改" : c.origin === "ai_interpretation" ? "AI解释" : "系统预设"}</small></div>
      <select aria-label={`${c.id} 运算符`} value={c.operator} onChange={e => update(c.id, { operator: e.target.value as Condition["operator"] })}>
        {[">", ">=", "<", "<=", "="].map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <input aria-label={`${c.id} 阈值`} type="number" step="any" value={c.threshold}
        onChange={e => { if (e.target.value.trim() !== "") update(c.id, { threshold: Number(e.target.value) }); }} />
      <span className="unit">{c.unit === "percent" ? "%" : "倍"}</span>
      <button className="subtle-button" aria-label={`删除 ${c.metric_label} ${c.id}`} onClick={() => setConditions(conditions.filter(item => item.id !== c.id))}>删除</button>
    </div>)}</div>
    <div className="condition-add"><select aria-label="新增条件指标" value={newMetric} onChange={e => setNewMetric(e.target.value as MetricId)}>
      {METRIC_IDS.map(id => <option key={id} value={id}>{METRICS[id].label}</option>)}
    </select><button className="secondary-button" onClick={() => addCondition(newMetric)} disabled={conditions.length >= 20}>添加白名单条件</button></div>
  </section>;
}
