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
