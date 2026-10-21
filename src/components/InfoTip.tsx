import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { Explainer } from "~/domain/explainers";

// Opens on hover or keyboard focus. A click/tap pins it open, so it also
// works on touch screens; tap again, tap outside, or press Escape to close.
export function InfoTip({
  label,
  info,
  description,
  children,
  triggerClassName,
  inline = false,
}: {
  label: string;
  info?: Explainer;
  description?: string;
  children?: ReactNode;
  triggerClassName?: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`infotip${inline ? " infotip-inline" : ""}`}>
      <button
        type="button"
        className={`infotip-btn${triggerClassName ? ` ${triggerClassName}` : ""}`}
        aria-label={`About: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={(event) => {
          if (!pinned && !ref.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
        }}
      >
        {children ?? "i"}
      </button>
      {open && (
        <span
          className={`infotip-body${description ? " infotip-body-brief" : ""}`}
          role="tooltip"
          id={id}
          onMouseLeave={(event) => {
            if (!pinned && !ref.current?.contains(event.relatedTarget as Node)) setOpen(false);
          }}
        >
          {description ? (
            <span className="infotip-bubble infotip-brief">{description}</span>
          ) : (
            info && (
              <span className="infotip-bubble">
                <span className="infotip-row">
                  <b>What it shows</b>
                  {info.what}
                </span>
                <span className="infotip-row">
                  <b>How to read it</b>
                  {info.read}
                </span>
                <span className="infotip-row">
                  <b>Why it matters</b>
                  {info.why}
                </span>
              </span>
            )
          )}
        </span>
      )}
    </span>
  );
}
