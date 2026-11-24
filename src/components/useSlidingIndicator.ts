import { useEffect, useLayoutEffect, useRef } from "react";

// transitions.dev "tabs sliding": one indicator moves to the item marked
// aria-current. It slides when `active` changes and snaps on first paint and
// when the bar resizes. The bar gets `has-indicator` once placed, so CSS can
// drop the item's own active style; before hydration that style still shows.
export function useSlidingIndicator<T extends HTMLElement>(active: string) {
  const bar = useRef<T>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  const place = (animate: boolean) => {
    const root = bar.current;
    const ind = indicator.current;
    const item = root?.querySelector<HTMLElement>("[aria-current]");
    if (!root || !ind || !item) return;
    if (!animate) ind.style.transition = "none";
    // Rects, not offset*: those round to whole pixels and leave a 1 px seam.
    // Measured from the bar's padding edge, where the indicator sits.
    const r = root.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    const x = box.left - r.left - root.clientLeft + root.scrollLeft;
    const y = box.top - r.top - root.clientTop + root.scrollTop;
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
    place(placed.current);
    placed.current = true;
  }, [active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: set up once; place reads refs.
  useEffect(() => {
    const root = bar.current;
    if (!root) return;
    // The observer reports once on start; skip it so it can't cancel a slide.
    let started = false;
    const observer = new ResizeObserver(() => {
      if (started) place(false);
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
