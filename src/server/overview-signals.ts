import { formatDayRange } from "~/lib/format";

export type OverviewAlert = {
  ruleId: string;
  seriesId: string | null;
  triggeredAt: string;
  severity: "info" | "warning" | "critical";
  message: string;
  description?: string;
};

export type AlertSignal = OverviewAlert & {
  firstTriggeredAt: string;
  occurrences: number;
};

// How many recent alerts the "Current read" looks at.
export const RISK_READ_ALERT_LIMIT = 6;

export type RiskRead = {
  label: "Elevated" | "Watch" | "No recent warnings";
  detail: string;
  signals: AlertSignal[];
};

export function groupAlertSignals(alerts: OverviewAlert[]): AlertSignal[] {
  const grouped = new Map<string, AlertSignal>();
  for (const alert of alerts) {
    const key = `${alert.ruleId}:${alert.seriesId ?? "all"}`;
    const current = grouped.get(key);
    if (current) {
      current.occurrences += 1;
      current.firstTriggeredAt =
        alert.triggeredAt < current.firstTriggeredAt ? alert.triggeredAt : current.firstTriggeredAt;
      continue;
    }
    grouped.set(key, { ...alert, firstTriggeredAt: alert.triggeredAt, occurrences: 1 });
  }
  const severityRank = { critical: 0, warning: 1, info: 2 };
  return [...grouped.values()].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      b.triggeredAt.localeCompare(a.triggeredAt),
  );
}

export function riskReadFromAlerts(alerts: OverviewAlert[]): RiskRead {
  const signals = groupAlertSignals(alerts);
  const critical = signals.filter((signal) => signal.severity === "critical").length;
  const warnings = signals.filter((signal) => signal.severity === "warning").length;
  if (critical > 0) {
    return {
      label: "Elevated",
      detail: `${critical} critical and ${warnings} warning signal${warnings === 1 ? "" : "s"} recorded in the latest alert history.`,
      signals,
    };
  }
  if (warnings > 0) {
    return {
      label: "Watch",
      detail: `${warnings} warning signal${warnings === 1 ? "" : "s"} recorded in the latest alert history.`,
      signals,
    };
  }
  return {
    label: "No recent warnings",
    detail: "No alert rules have fired in the latest alert history.",
    signals,
  };
}

// ---- Per-step status on the homepage ----

export type Step = "borrow" | "build" | "rent" | "fill";
export const STEPS: Step[] = ["borrow", "build", "rent", "fill"];

const STEP_BY_SERIES_PREFIX: [string, Step][] = [
  ["fred.", "borrow"],
  ["sec.", "build"],
  ["sec_debt.", "borrow"],
  ["depreciation.", "build"],
  ["insider.", "build"],
  ["aws.", "rent"],
  ["azure.", "rent"],
  ["gpu_resale.", "rent"],
  ["salad.", "rent"],
  ["runcrate.", "rent"],
  ["cbre.", "fill"],
  ["jll.", "fill"],
  ["census.", "fill"],
  ["eia.", "fill"],
];

// Every rule in data/alerts.config.yaml. Rules without a series (the
// borrowing-cost cluster rule) can only be placed this way.
const STEP_BY_RULE: Record<string, Step> = {
  hy_oas_widening: "borrow",
  hy_oas_sharp_widening: "borrow",
  ccc_oas_widening: "borrow",
  bbb_oas_widening: "borrow",
  hy_oas_elevated: "borrow",
  multi_indicator_deterioration: "borrow",
  gpu_list_price_cut: "rent",
  azure_spot_cut: "rent",
};

export function stepOfAlert(alert: Pick<OverviewAlert, "ruleId" | "seriesId">): Step | null {
  const bySeries = alert.seriesId
    ? STEP_BY_SERIES_PREFIX.find(([prefix]) => alert.seriesId?.startsWith(prefix))?.[1]
    : undefined;
  return bySeries ?? STEP_BY_RULE[alert.ruleId] ?? null;
}

// The warning and critical alerts behind a step's status, for its chapter
// pill: "3 alerts · 5–6 Nov". Counted the way the current read counts them
// (one per rule and series), dated from the first to the latest firing.
// Undefined when the step has none, so a calm chapter carries no detail.
export function stepAlertDetail(signals: AlertSignal[], step: Step): string | undefined {
  const mine = signals.filter((s) => s.severity !== "info" && stepOfAlert(s) === step);
  if (mine.length === 0) return undefined;
  const first = mine.reduce((a, s) => (s.firstTriggeredAt < a ? s.firstTriggeredAt : a), "9999");
  const last = mine.reduce((a, s) => (s.triggeredAt > a ? s.triggeredAt : a), "");
  return `${mine.length} alert${mine.length === 1 ? "" : "s"} · ${formatDayRange(first, last)}`;
}

// The overall read applied to each step's own alerts. An alert that maps
// to no step counts toward none.
export function stepReads(alerts: OverviewAlert[]): Record<Step, RiskRead["label"]> {
  const out = {} as Record<Step, RiskRead["label"]>;
  for (const step of STEPS) {
    out[step] = riskReadFromAlerts(alerts.filter((a) => stepOfAlert(a) === step)).label;
  }
  return out;
}
