export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="empty-state"><span className="empty-mark" aria-hidden="true">—</span><h2>{title}</h2><p>{children}</p></section>;
}
