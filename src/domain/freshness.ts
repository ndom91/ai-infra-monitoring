import type { Cadence } from "./types";

export type Freshness = "current" | "stale" | "unavailable" | "historical-only" | "awaiting";

// How old the latest period may be before the series counts as stale.
// Includes typical publication lag (filings ~45 days, broker reports ~2 months).
export const MAX_AGE_DAYS: Record<Cadence, number> = {
  daily: 3,
  weekdays: 5,
  weekly: 10,
  monthly: 45,
  quarterly: 140,
  semiannual: 270,
  annual: 460,
  irregular: Number.POSITIVE_INFINITY,
};

export type FreshnessInput = {
  cadence: Cadence;
  latestPeriodEnd?: string;
  lastRunStatus?: "running" | "ok" | "partial" | "failed";
  now: Date;
};

const DAY_MS = 86_400_000;

export function ageInDays(isoDate: string, now: Date) {
  return Math.floor((now.getTime() - Date.parse(isoDate)) / DAY_MS);
}

export function freshness({
  cadence,
  latestPeriodEnd,
  lastRunStatus,
  now,
}: FreshnessInput): Freshness {
  if (!latestPeriodEnd) {
    return lastRunStatus === "failed" ? "unavailable" : "awaiting";
  }
  // Irregular series (one-off disclosures) never "expire", but are not live either.
  if (cadence === "irregular") return "historical-only";
  if (ageInDays(latestPeriodEnd, now) <= MAX_AGE_DAYS[cadence]) {
    return "current";
  }
  // Old data plus a failing collector: the source is down, not just slow.
  return lastRunStatus === "failed" || lastRunStatus === "partial" ? "unavailable" : "stale";
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: "Current",
  stale: "Stale",
  unavailable: "Source unavailable",
  "historical-only": "Historical only",
  awaiting: "Awaiting data",
};
