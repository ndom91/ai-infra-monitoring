import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Explainer } from "~/domain/explainers";

// Keeps a popover this far from the screen edge.
const EDGE = 8;
// Gap between the trigger and its popover; matches the CSS offset.
const GAP = 6;

// Opens on hover or keyboard focus. A click/tap pins it open, so it also
// works on touch screens; tap again, tap outside, or press Escape to close.
//
// Two shapes: the round "i" beside a chart title shows an Explainer; with
// `inline` a quiet text trigger sits in a table row and opens `children`.
export function InfoTip({
  label,
  info,
  children,
  inline,
  text,
  ariaLabel,
}: {
  label: string;
  info?: Explainer;
  // Popover content for the inline trigger.
  children?: ReactNode;
  inline?: boolean;
  // Visible trigger text for the inline shape.
  text?: string;
  // Replaces the default "About: {label}" name.
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState({ dx: 0, up: false });
  const ref = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const id = useId();
  const name = ariaLabel ?? `About: ${label}`;

  // The popover can sit in a narrow table cell near a screen edge: slide it
  // back inside the viewport, or open it upward when there is no room below.
  useLayoutEffect(() => {
    if (!open || !body.current) return;
    const measure = () => {
      const el = body.current;
      const trigger = button.current;
      if (!el || !trigger) return;
      const { width, height } = el.getBoundingClientRect();
      const t = trigger.getBoundingClientRect();
      // Where the unshifted popover sits: left-aligned to an inline trigger,
      // right-aligned to the round one.
      const left = inline ? t.left : t.right - width;
      // clientWidth, not innerWidth: a popover that overflows widens the
      // latter on phones.
      const viewWidth = document.documentElement.clientWidth;
      let dx = 0;
      if (left + width > viewWidth - EDGE) dx = viewWidth - EDGE - (left + width);
      if (left + dx < EDGE) dx = EDGE - left;
      const up = t.bottom + GAP + height > window.innerHeight - EDGE && t.top - GAP - height > EDGE;
      setPlace((p) => (p.dx === dx && p.up === up ? p : { dx, up }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, inline]);

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
      if (e.key !== "Escape") return;
      if (ref.current?.contains(document.activeElement)) button.current?.focus();
      close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const leave = (event: { relatedTarget: EventTarget | null }) => {
    if (!pinned && !ref.current?.contains(event.relatedTarget as Node)) setOpen(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus handlers only keep the popover open while the pointer or focus is inside it.
    <span
      ref={ref}
      className={`infotip${inline ? " infotip-inline" : ""}`}
      onMouseLeave={leave}
      onBlur={leave}
    >
      <button
        ref={button}
        type="button"
        className={`infotip-btn${inline ? " infotip-text" : ""}`}
        aria-label={name}
        aria-expanded={open}
        aria-describedby={open && !inline ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
        }}
      >
        {inline ? text : "i"}
      </button>
      {open && (
        <span
          ref={body}
          className={`infotip-body${place.up ? " up" : ""}`}
          style={place.dx ? { translate: `${place.dx}px` } : undefined}
          // A tooltip may not hold links; the inline popover can.
          {...(inline ? { role: "group", "aria-label": name } : { role: "tooltip" })}
          id={id}
        >
          {inline ? (
            <span className="infotip-bubble">{children}</span>
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
