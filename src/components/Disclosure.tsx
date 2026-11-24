import { type ReactNode, useId, useState } from "react";

// A header that opens a panel below it. The panel's height animates through
// grid rows (0fr to 1fr), so no height is measured (transitions.dev accordion).
// `lazy` builds the content on first open only, for panels full of charts; it
// then stays built so closing can animate.
export function Disclosure({
  className,
  summary,
  lazy,
  children,
}: {
  className: string;
  summary: ReactNode;
  lazy?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState(!lazy);
  const id = useId();
  return (
    <div className={`t-acc ${className}`} data-open={open}>
      <button
        type="button"
        className="t-acc-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          setBuilt(true);
        }}
      >
        {/* Turned to point right while closed. */}
        <span className="t-acc-chevron">
          <Chevron />
        </span>
        {summary}
      </button>
      <div className="t-acc-panel" id={id} inert={!open}>
        <div className="t-acc-panel-inner">
          <div className="t-acc-body">{built ? children : null}</div>
        </div>
      </div>
    </div>
  );
}

// Lucide chevron-down.
export function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
