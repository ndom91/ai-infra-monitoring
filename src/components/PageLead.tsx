import type { ReactNode } from "react";

export function PageLead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="page-lead">
      <summary>How to read this page</summary>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </details>
  );
}
