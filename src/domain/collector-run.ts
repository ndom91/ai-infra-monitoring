import type { Signal } from "./chapterSignals";

export type RunStatus = "running" | "ok" | "partial" | "failed";

// What a collector run's own status says, in words. It says nothing about how
// old the data is: freshness comes from the latest period (see freshness.ts),
// so a partly failed run must not be labelled "stale".
export const RUN_STATUS: Record<RunStatus, { label: string; signal: Signal }> = {
  ok: { label: "Succeeded", signal: "reassuring" },
  partial: { label: "Partly failed", signal: "mixed" },
  failed: { label: "Failed", signal: "worsening" },
  running: { label: "Running", signal: "context" },
};
