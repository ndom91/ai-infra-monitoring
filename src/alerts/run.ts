import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "~/storage/db";
import { alertEvents, observations, series } from "~/storage/schema";
import { loadAlertConfig, matchesSeries, type Rule } from "./config";
import {
  type AlertCandidate,
  type EvalSeries,
  evaluateBreadthRules,
  evaluateSeriesRules,
} from "./evaluate";

type Existing = Pick<AlertCandidate, "ruleId" | "seriesId" | "triggeredAt">;

const DAY_MS = 86_400_000;

// Drops candidates whose rule+series already fired within the cooldown.
export function applyCooldown(
  candidates: AlertCandidate[],
  existing: Existing[],
): AlertCandidate[] {
  const accepted: AlertCandidate[] = [];
  const history = [...existing];
  const sorted = [...candidates].sort((a, b) => a.triggeredAt.localeCompare(b.triggeredAt));
  for (const c of sorted) {
    const blocked = history.some(
      (e) =>
        e.ruleId === c.ruleId &&
        e.seriesId === c.seriesId &&
        e.triggeredAt <= c.triggeredAt &&
        Date.parse(c.triggeredAt) - Date.parse(e.triggeredAt) < c.cooldownDays * DAY_MS,
    );
    if (blocked) continue;
    accepted.push(c);
    history.push(c);
  }
  return accepted;
}

async function loadSeries(db: Db, rules: Rule[], since?: string) {
  const patterns = rules.flatMap((r) => (r.type === "breadth" ? [] : [r.series]));
  const defs = (await db.select().from(series)).filter((s) =>
    patterns.some((p) => matchesSeries(p, s.id)),
  );
  if (defs.length === 0) return [];
  const rows = await db
    .select({
      id: observations.id,
      seriesId: observations.seriesId,
      periodEnd: observations.periodEnd,
      value: observations.value,
      sourceUrl: observations.sourceUrl,
    })
    .from(observations)
    .where(
      and(
        inArray(
          observations.seriesId,
          defs.map((d) => d.id),
        ),
        eq(observations.isLatest, true),
        since ? gte(observations.periodEnd, since) : undefined,
      ),
    )
    .orderBy(observations.seriesId, observations.periodEnd);
  return defs.map(
    (d): EvalSeries => ({
      id: d.id,
      label: d.label,
      unit: d.unit,
      source: d.source,
      sourceUrl: d.sourceUrl,
      points: rows.filter((r) => r.seriesId === d.id),
    }),
  );
}

function truncate(all: EvalSeries[], asOf: string): EvalSeries[] {
  return all.map((s) => ({
    ...s,
    points: s.points.filter((p) => p.periodEnd <= asOf),
  }));
}

function dedupeKey(c: AlertCandidate) {
  return `${c.ruleId}:${c.seriesId ?? "*"}:${c.triggeredAt}`;
}

async function write(db: Db, accepted: AlertCandidate[]) {
  const now = new Date().toISOString();
  for (let i = 0; i < accepted.length; i += 100) {
    await db
      .insert(alertEvents)
      .values(
        accepted.slice(i, i + 100).map((c) => ({
          ruleId: c.ruleId,
          seriesId: c.seriesId,
          triggeredAt: c.triggeredAt,
          severity: c.severity,
          message: c.message,
          evidence: c.evidence,
          dedupeKey: dedupeKey(c),
          createdAt: now,
        })),
      )
      .onConflictDoNothing();
  }
}

function toExisting(rows: (typeof alertEvents.$inferSelect)[]): Existing[] {
  return rows.map((r) => ({
    ruleId: r.ruleId,
    seriesId: r.seriesId,
    triggeredAt: r.triggeredAt,
  }));
}

// Live: evaluate as of the latest data. Backtest: replay weekly through
// history so the event log has context from the first day.
export async function runAlerts(db: Db, { backtest = false, log = console.log } = {}) {
  const { rules } = await loadAlertConfig();
  const maxWindow = Math.max(...rules.map((r) => (r.type === "level" ? 0 : r.window_days)));
  const since = backtest
    ? undefined
    : new Date(Date.now() - (maxWindow + 60) * DAY_MS).toISOString().slice(0, 10);
  const all = await loadSeries(db, rules, since);
  const existingRows = await db.select().from(alertEvents);
  const existing = toExisting(existingRows);

  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  if (backtest) {
    const first = all.flatMap((s) => s.points.slice(0, 1).map((p) => p.periodEnd)).sort()[0];
    for (let t = first ? Date.parse(first) : Date.now(); t <= Date.now(); t += 7 * DAY_MS) {
      dates.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  dates.push(today);

  const accepted: AlertCandidate[] = [];
  for (const asOf of dates) {
    const view = truncate(all, asOf);
    const fresh = applyCooldown(evaluateSeriesRules(rules, view), [...existing, ...accepted]);
    accepted.push(...fresh);
    const pool = [
      ...existingRows.map((r) => ({
        ruleId: r.ruleId,
        triggeredAt: r.triggeredAt,
        evidence: r.evidence,
      })),
      ...accepted,
    ];
    const breadth = applyCooldown(evaluateBreadthRules(rules, pool, asOf), [
      ...existing,
      ...accepted,
    ]);
    accepted.push(...breadth);
  }

  await write(db, accepted);
  log(`[alerts] ${accepted.length} new events (${rules.length} rules)`);
  return accepted;
}
