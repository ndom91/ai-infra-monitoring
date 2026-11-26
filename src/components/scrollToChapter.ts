import { useRouter } from "@tanstack/react-router";
import { type MouseEvent, useCallback } from "react";

// Moves to a section on the same page: smoothly, or at once for readers who
// ask for less motion. It goes through the router because the router scrolls
// to the hash itself whenever the URL changes, and would otherwise jump there
// first. The hash entry is replaced, so the link stays shareable without
// adding a Back step per jump. CSS scroll-margin keeps it clear of sticky bars.
export function useScrollToChapter() {
  const router = useRouter();
  // Stable, so effects can depend on it without re-running.
  return useCallback(
    (id: string) => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      void router.navigate({
        to: ".",
        search: true,
        hash: id,
        replace: true,
        hashScrollIntoView: { behavior: reduce ? "auto" : "smooth", block: "start" },
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
