"use client";
import { useRouter } from "next/navigation";
import { ConditionEditor } from "@/components/condition-editor";
import { IntentReview } from "@/components/intent-review";
import { DataStatus } from "@/components/data-status";
import { useWorkspace } from "@/components/workspace-context";

export default function IntentPage() {
  const router = useRouter();
  const { query, setQuery, parsed, parsing, clarificationRequired, parseIntent, snapshot, conditions, conflicts, running, error, run } = useWorkspace();
  async function submit() { if (await run()) router.push("/results"); }
  return <>
    <div className="page-heading"><p className="eyebrow">INTENT BUILDER</p><h1>把想法变成明确的条件</h1><p>检查系统的默认解释，修改条件，再运行真实沪深300数据筛选。</p></div>
    <DataStatus />
    <section className="panel"><label htmlFor="query" className="panel-title">你想寻找什么样的公司？</label>
      <textarea id="query" disabled={parsing || running} value={query} onChange={event => setQuery(event.target.value)} placeholder="例如：找经营改善、估值合理、走势稳定的公司。" rows={3} />
      <div className="row"><p className="muted">示例短语使用已验证预设；其他表达由已配置的LLM解析。</p><button className="primary-button" onClick={() => { void parseIntent(); }} disabled={!query.trim() || parsing || running}>{parsing ? "解析中…" : "解析意图"}</button></div>
    </section>
    {parsed && <><IntentReview /><ConditionEditor /><div className="action-bar"><span>已确认股票池：沪深300 · 条件 {conditions.length} 项</span>
      <button className="primary-button" onClick={submit} disabled={clarificationRequired || !snapshot || !conditions.length || !!conflicts.length || running}>{running ? "筛选中…" : "确认并运行筛选"}</button></div></>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </>;
}
