import { changeOver } from "~/metrics/changes";
import type { AlertEvidence } from "~/storage/schema";
import type { BreadthRule, ChangeRule, LevelRule, Rule } from "./config";
import { matchesSeries } from "./config";

export type EvalPoint = {
  id: number;
  periodEnd: string;
  value: number;
  sourceUrl: string | null;
};

export type EvalSeries = {
  id: string;
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  // Ascending by periodEnd, latest vintage only.
  points: EvalPoint[];
};

export type AlertCandidate = {
  ruleId: string;
  seriesId: string | null;
  triggeredAt: string;
  severity: Rule["severity"];
  message: string;
  evidence: AlertEvidence;
  cooldownDays: number;
};

function evidenceFor(s: EvalSeries, points: EvalPoint[]) {
  return points.map((p) => ({
    id: p.id,
    seriesId: s.id,
    label: s.label,
    periodEnd: p.periodEnd,
    value: p.value,
    unit: s.unit,
    source: s.source,
    sourceUrl: p.sourceUrl ?? s.sourceUrl,
  }));
}

function evalChange(rule: ChangeRule, s: EvalSeries): AlertCandidate | null {
  const c = changeOver(s.points, rule.window_days);
  if (!c) return null;
  const move = rule.relative ? c.pct : c.delta;
  if (move == null) return null;
  const hit = rule.direction === "up" ? move >= rule.threshold : move <= -rule.threshold;
  if (!hit) return null;
  const from = s.points.find((p) => p.periodEnd === c.from.periodEnd);
  const to = s.points.at(-1);
  if (!from || !to) return null;
  const sign = move > 0 ? "+" : "";
  const shown = rule.relative
    ? `${sign}${(move * 100).toFixed(1)}%`
    : s.unit === "%"
      ? `${sign}${move.toFixed(2)} pp (${Math.round(move * 100)} bps)`
      : `${sign}${+move.toFixed(4)} ${s.unit}`;
  return {
    ruleId: rule.id,
    seriesId: s.id,
    triggeredAt: to.periodEnd,
    severity: rule.severity,
    message: `${s.label} moved ${shown} between ${from.periodEnd} and ${to.periodEnd}. ${rule.description}`,
    evidence: {
      observations: evidenceFor(s, [from, to]),
      params: {
        description: rule.description,
        window_days: rule.window_days,
        threshold: rule.threshold,
        relative: String(rule.relative),
        direction: rule.direction,
      },
    },
    cooldownDays: rule.cooldown_days,
  };
}

function evalLevel(rule: LevelRule, s: EvalSeries): AlertCandidate | null {
  const last = s.points.at(-1);
  if (!last) return null;
  const above = rule.above != null && last.value > rule.above;
  const below = rule.below != null && last.value < rule.below;
  if (!above && !below) return null;
  return {
    ruleId: rule.id,
    seriesId: s.id,
    triggeredAt: last.periodEnd,
    severity: rule.severity,
    message: `${s.label} is ${last.value} ${s.unit} on ${last.periodEnd} (${above ? `above ${rule.above}` : `below ${rule.below}`}). ${rule.description}`,
    evidence: {
      observations: evidenceFor(s, [last]),
      params: {
        description: rule.description,
        ...(rule.above != null && { above: rule.above }),
        ...(rule.below != null && { below: rule.below }),
      },
    },
    cooldownDays: rule.cooldown_days,
  };
}

// Series-level rules, evaluated as of the last point in each series.
export function evaluateSeriesRules(rules: Rule[], series: EvalSeries[]): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const rule of rules) {
    if (rule.type === "breadth") continue;
    for (const s of series) {
      if (!matchesSeries(rule.series, s.id)) continue;
      const hit = rule.type === "change" ? evalChange(rule, s) : evalLevel(rule, s);
      if (hit) out.push(hit);
    }
  }
  return out;
}

const BREADTH_NEW_DAYS = 7;

// Breadth rules look at already-fired events: several independent warning
// signs in the same window, without collapsing them into a single score.
export function evaluateBreadthRules(
  rules: Rule[],
  events: Pick<AlertCandidate, "ruleId" | "triggeredAt" | "evidence">[],
  asOf: string,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const rule of rules) {
    if (rule.type !== "breadth") continue;
    const since = new Date(Date.parse(asOf) - rule.window_days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const recent = events.filter(
      (e) => rule.rules.includes(e.ruleId) && e.triggeredAt >= since && e.triggeredAt <= asOf,
    );
    const fired = [...new Set(recent.map((e) => e.ruleId))];
    if (fired.length < rule.min_rules) continue;
    // Only fire on new information, not on the same old events re-counted.
    const newSince = new Date(Date.parse(asOf) - BREADTH_NEW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (!recent.some((e) => e.triggeredAt >= newSince)) continue;
    out.push(breadthCandidate(rule, fired, recent, asOf));
  }
  return out;
}

function breadthCandidate(
  rule: BreadthRule,
  fired: string[],
  recent: Pick<AlertCandidate, "evidence">[],
  asOf: string,
): AlertCandidate {
  return {
    ruleId: rule.id,
    seriesId: null,
    triggeredAt: asOf,
    severity: rule.severity,
    message: `${fired.length} separate rules fired within ${rule.window_days} days: ${fired.join(", ")}. ${rule.description}`,
    evidence: {
      observations: recent.flatMap((e) => e.evidence.observations),
      params: {
        description: rule.description,
        rules_fired: fired.join(","),
        min_rules: rule.min_rules,
        window_days: rule.window_days,
      },
    },
    cooldownDays: rule.cooldown_days,
  };
}
