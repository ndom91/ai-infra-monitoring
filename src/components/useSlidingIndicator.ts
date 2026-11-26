import { useEffect, useLayoutEffect, useRef } from "react";

// transitions.dev "tabs sliding": one indicator moves to the item marked
// aria-current. It slides to a new item and snaps on first paint and when
// the active item itself resizes. The bar gets `has-indicator` once placed, so CSS can
// drop the item's own active style; before hydration that style still shows.
export function useSlidingIndicator<T extends HTMLElement>(active: string) {
  const bar = useRef<T>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  // The item and box last written to the indicator.
  const target = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const targetItem = useRef<HTMLElement | null>(null);

  const place = (resized: boolean) => {
    const root = bar.current;
    const ind = indicator.current;
    const item = root?.querySelector<HTMLElement>("[aria-current]");
    if (!root || !ind || !item) return;
    // Router links mark themselves aria-current as soon as the URL changes,
    // so a resize can be the first to see a new item. Moving to another
    // item always slides; only a resize of the same item snaps.
    const animate = placed.current && !(resized && item === targetItem.current);
    // Rects, not offset*: those round to whole pixels and leave a 1 px seam.
    // Measured from the bar's padding edge, where the indicator sits.
    const r = root.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    const x = box.left - r.left - root.clientLeft + root.scrollLeft;
    const y = box.top - r.top - root.clientTop + root.scrollTop;
    const next = { x, y, w: box.width, h: box.height };
    // A re-render can nudge items by a fraction of a pixel and fire the
    // resize observer mid-slide. Snapping then would cut the slide short, so
    // a snap that would not visibly move the indicator is skipped.
    const prev = target.current;
    if (
      !animate &&
      prev &&
      Math.abs(prev.x - x) < 0.5 &&
      Math.abs(prev.y - y) < 0.5 &&
      Math.abs(prev.w - next.w) < 0.5 &&
      Math.abs(prev.h - next.h) < 0.5
    ) {
      return;
    }
    target.current = next;
    targetItem.current = item;
    if (!animate) ind.style.transition = "none";
    ind.style.setProperty("--ind-x", `${x}px`);
    ind.style.setProperty("--ind-y", `${y}px`);
    ind.style.setProperty("--ind-w", `${box.width}px`);
    ind.style.setProperty("--ind-h", `${box.height}px`);
    if (!animate) {
      // Reflow before restoring the transition, or the snap animates.
      void ind.offsetWidth;
      ind.style.transition = "";
    }
    root.classList.add("has-indicator");
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-place only when the active item changes.
  useLayoutEffect(() => {
    place(false);
    placed.current = true;
  }, [active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: set up once; place reads refs.
  useEffect(() => {
    const root = bar.current;
    if (!root) return;
    // The observer reports once on start; skip it so it can't cancel a slide.
    let started = false;
    const observer = new ResizeObserver(() => {
      if (started) place(true);
      started = true;
    });
    observer.observe(root);
    // Items only: the indicator's own width changes while it slides.
    for (const child of root.children) {
      if (child !== indicator.current) observer.observe(child);
    }
    return () => observer.disconnect();
  }, []);

  return { bar, indicator };
}
