import type { ReactNode } from "react";

export function PageLead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="page-lead" aria-label="How to use this page">
      <div className="eyebrow">Start here</div>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </aside>
  );
}
