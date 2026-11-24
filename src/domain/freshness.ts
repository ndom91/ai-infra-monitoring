import type { Cadence } from "./types";

export type Freshness = "current" | "stale" | "unavailable" | "historical-only" | "awaiting";

// How old the latest period may be before the series counts as stale.
// Includes typical publication lag (filings ~45 days, broker reports ~2 months).
// Monthly is 70 days because Census C30 construction spending is released about a
// month after the month ends (Sep data on 2 Nov), so a current figure is already
// ~32-63 days past its period end.
export const MAX_AGE_DAYS: Record<Cadence, number> = {
  daily: 3,
  weekdays: 5,
  weekly: 10,
  monthly: 70,
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

// Worst first: what a figure built from several series should admit to.
const FRESHNESS_ORDER: Freshness[] = [
  "unavailable",
  "stale",
  "awaiting",
  "historical-only",
  "current",
];

export function worstFreshness(states: Freshness[]): Freshness | undefined {
  return FRESHNESS_ORDER.find((s) => states.includes(s));
}

// " · stale" after a figure's note. Only data that is out of date is admitted
// to (stale, source unavailable); current, historical-only, awaiting and
// unknown states add nothing.
export const freshnessSuffix = (state: Freshness | undefined) =>
  state === "stale" || state === "unavailable" ? ` · ${FRESHNESS_LABEL[state].toLowerCase()}` : "";
