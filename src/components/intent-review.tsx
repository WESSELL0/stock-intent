"use client";
import { canConfirmAmbiguousInterpretation } from "@/domain/preset-intent";
import { useWorkspace } from "./workspace-context";

export function IntentReview() {
  const { intent, interpreter, clarificationRequired, confirmInterpretation } = useWorkspace();
  if (!intent) return null;
  return <section className="panel" aria-label="意图解释与澄清">
    <div className="section-title"><h2>{interpreter === "preset" ? "系统预设解释" : "AI意图解释"}</h2>
      <span className="badge">{interpreter === "preset" ? "规则预设 · 未调用模型" : "模型仅解释条件"}</span></div>
    {intent.assumptions.length > 0 && <><h3>需要你检查的假设</h3><ul>{intent.assumptions.map(item =>
      <li key={item.id}><strong>{item.source_phrase}：</strong>{item.explanation}</li>)}</ul>
      <p className="muted">这些是假设，不是股票事实。请检查下方条件，点击“确认并运行筛选”后执行修改后的条件。</p></>}
    {intent.unsupported_requests.length > 0 && <><h3>当前不支持的要求</h3><ul>{intent.unsupported_requests.map((item, index) =>
      <li key={index}><strong>{item.phrase}：</strong>{item.explanation}</li>)}</ul></>}
    {intent.conflicts.filter(item => item.kind !== "contradictory_bounds").map((item, index) => <p key={index} role="alert">待澄清：{item.explanation}</p>)}
    {canConfirmAmbiguousInterpretation(intent) && <div className="clarification-choice"><p>如果下方条件正是你的意思，可明确接受这组解释；系统会记录你的确认。</p>
      <button className="secondary-button" onClick={confirmInterpretation}>确认按当前条件理解</button></div>}
    {intent.assumptions.some(item => item.acknowledged) && <p className="confirmed-note">已确认当前条件的默认解释。修改条件后按修改值执行。</p>}
    {clarificationRequired && <p className="form-error" role="alert">当前意图尚不可执行。请修改上方描述并重新解析，明确处理不支持或有歧义的要求；系统不会静默删除这些要求。</p>}
  </section>;
}
