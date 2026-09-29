import Link from "next/link";
import type { ReactNode } from "react";
import { WorkspaceProvider } from "./workspace-context";

const sections = [
  { href: "/", label: "01  意图与条件" },
  { href: "/results", label: "02  筛选结果" },
  { href: "/sensitivity", label: "03  排除与变化" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/">条件研究室<span>Stock Intent · 沪深300</span></Link>
      <nav aria-label="主导航">{sections.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      <p className="sidebar-note">自然语言意图<br />可检查的条件<br />可追溯的证据</p>
    </aside>
    <WorkspaceProvider><div className="workspace">
      <header className="topbar"><span>自然语言智能选股与策略解释器</span><span className="badge">真实数据 · 沪深300</span></header>
      <main>{children}</main>
      <footer>本工具用于研究与筛选条件解释，不构成投资建议。</footer>
    </div></WorkspaceProvider>
  </div>;
}
