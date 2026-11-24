import type { ComponentProps } from "react";

// A link that opens a new tab, and says so. The arrow is for sighted readers
// only; `context` adds words for links whose text is just a date.
export function ExternalLink({
  children,
  arrow,
  context,
  ...rest
}: Omit<ComponentProps<"a">, "target" | "rel"> & { arrow?: boolean; context?: string }) {
  return (
    <a {...rest} target="_blank" rel="noopener noreferrer">
      {children}
      {arrow ? <span aria-hidden="true"> ↗</span> : null}
      <span className="sr-only">{context ? `, ${context}` : ""} (opens in a new tab)</span>
    </a>
  );
}
