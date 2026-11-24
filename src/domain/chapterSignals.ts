// Status dots on chapters and topic cards. Every status comes from an
// explicit rule below. A chapter or topic without a rule is "context": the
// page never colours a chapter on judgement alone.
import type { Change } from "~/metrics/changes";

export type Signal = "worsening" | "mixed" | "reassuring" | "context";

export const SIGNAL_LABELS: Record<Signal, string> = {
  worsening: "Worsening",
  mixed: "Mixed",
  reassuring: "Reassuring",
  context: "Context",
};

// Credit chapter 01 follows the homepage "Current read" (alert history), so
// the two can never disagree.
export function creditMarketSignal(riskLabel: "Elevated" | "Watch" | "No recent warnings"): Signal {
  if (riskLabel === "Elevated") return "worsening";
  if (riskLabel === "Watch") return "mixed";
  return "reassuring";
}

// Cash & spending: 12-month capex above 12-month operating cash flow (> 1×)
// means the company relies on outside money to build.
export function cashSignal(capexToOcf: number | null | undefined): Signal {
  if (capexToOcf == null) return "context";
  return capexToOcf > 1 ? "worsening" : "reassuring";
}

// Thresholds for the half-yearly CBRE topic cards. Each change compares the
// same half-year a year apart.
export const SUPPLY_FAST_GROWTH = 0.25; // construction up 25% or more
export const PRELEASE_DROP_PP = 1; // pre-leased share down 1 pp or more
export const VACANCY_RISE_PP = 1; // vacancy up 1 pp or more

// Supply: construction rising while the pre-leased share falls is the warning
// sign. Fast growth that is still pre-leased is "mixed".
export function supplySignal(construction: Change | null, preleased: Change | null): Signal {
  if (!construction || !preleased) return "context";
  const growing = (construction.pct ?? 0) > 0;
  if (growing && preleased.delta <= -PRELEASE_DROP_PP) return "worsening";
  if ((construction.pct ?? 0) >= SUPPLY_FAST_GROWTH) return "mixed";
  return "reassuring";
}

// Space: vacancy (percentage points) up by the threshold or more.
export function spaceSignal(vacancy: Change | null): Signal {
  if (!vacancy) return "context";
  return vacancy.delta >= VACANCY_RISE_PP ? "worsening" : "reassuring";
}

// Rent: asking rents falling year over year point to weaker demand.
export function rentSignal(rent: Change | null): Signal {
  if (!rent) return "context";
  return rent.delta < 0 ? "worsening" : "reassuring";
}
