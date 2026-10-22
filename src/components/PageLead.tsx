import type { ReactNode } from "react";

export function PageLead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="page-lead" aria-label="How to read this page">
      <div className="page-lead-label">How to read this page</div>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}
