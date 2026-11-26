import { useRouter } from "@tanstack/react-router";
import { type MouseEvent, useCallback } from "react";

// The scroll animates in JS rather than with `behavior: "smooth"`: browsers
// whose smooth scrolling is switched off (a Vivaldi setting, a Chromium
// flag) turn that into an instant jump. Readers who ask for reduced motion
// still get the jump.
const MIN_MS = 300;
const MAX_MS = 700;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Input that means the reader has taken over the scroll.
const TAKEOVER = ["wheel", "touchstart", "keydown", "mousedown"] as const;

let cancelRunning: (() => void) | null = null;

function animateScrollTo(top: number) {
  cancelRunning?.();
  const start = window.scrollY;
  const distance = top - start;
  if (Math.abs(distance) < 1) return;
  // Longer trips take a little longer, within bounds.
  const duration = Math.min(MAX_MS, Math.max(MIN_MS, Math.abs(distance) / 4));
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of TAKEOVER) window.removeEventListener(type, stop);
    cancelRunning = null;
  };
  for (const type of TAKEOVER) window.addEventListener(type, stop, { passive: true });
  cancelRunning = stop;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    window.scrollTo({ top: start + distance * easeInOutCubic(t), behavior: "instant" });
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  frame = requestAnimationFrame(step);
}

// Moves to a section on the same page. The router records the hash (search
// params such as ?range= are kept, and the entry is replaced so Back is not
// one step per jump) but is told not to scroll: it would jump to the hash
// before the animation could run. CSS scroll-margin keeps the section clear
// of sticky bars.
export function useScrollToChapter() {
  const router = useRouter();
  // Stable, so effects can depend on it without re-running.
  return useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const top = el.getBoundingClientRect().top + window.scrollY - margin;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.scrollTo({ top, behavior: "instant" });
      } else {
        animateScrollTo(top);
      }
      void router.navigate({
        to: ".",
        search: true,
        hash: id,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      });
    },
    [router],
  );
}

// True for a plain left click; modified clicks keep the browser's own
// behaviour (new tab, new window).
export function isPlainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
