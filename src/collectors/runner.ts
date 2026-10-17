import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { and, eq, inArray } from "drizzle-orm";
import * as v from "valibot";
import {
  type ObservationInput,
  ObservationInputSchema,
  type SeriesDef,
  SeriesDefSchema,
} from "~/domain/types";
import type { Db } from "~/storage/db";
import { collectorRuns, observations, rawSnapshots, series } from "~/storage/schema";
import { type CollectorError, classify, permanent } from "./errors";
import { fetchWithRetry } from "./http";
import type { CollectContext, CollectOutput, Collector } from "./types";

export type RunSummary = {
  runId: number;
  collector: string;
  status: "ok" | "partial" | "failed";
  fetched: number;
  inserted: number;
  revised: number;
  unchanged: number;
  failures: { key: string; error: CollectorError }[];
  error?: CollectorError;
};

const INSERT_CHUNK = 200;

export async function runCollector(
  db: Db,
  collector: Collector,
  opts: Partial<Omit<CollectContext, "log">> & {
    log?: (msg: string) => void;
  } = {},
): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((msg: string) => console.log(`[${collector.name}] ${msg}`));
  const [run] = await db
    .insert(collectorRuns)
    .values({
      collector: collector.name,
      startedAt: now.toISOString(),
      status: "running",
    })
    .returning({ id: collectorRuns.id });
  if (!run) throw new Error("failed to create run row");

  try {
    const output = await collector.collect({
      backfill: opts.backfill ?? false,
      now,
      fetch: opts.fetch ?? fetchWithRetry,
      log,
    });
    const validated = validate(output);
    const counts = await persist(db, collector.name, validated, run.id, now.toISOString());
    const failures = output.failures ?? [];
    const status = failures.length ? "partial" : "ok";
    for (const f of failures) {
      log(`FAILED ${f.key} (${f.error.errorClass}): ${f.error.message}`);
    }
    await db
      .update(collectorRuns)
      .set({
        status,
        finishedAt: new Date().toISOString(),
        fetched: validated.observations.length,
        ...counts,
        errorClass: failures[0]?.error.errorClass ?? null,
        message: failures.length
          ? failures.map((f) => `${f.key}: ${f.error.message}`).join("; ")
          : null,
      })
      .where(eq(collectorRuns.id, run.id));
    log(
      `${status}: ${validated.observations.length} fetched, ${counts.inserted} new, ${counts.revised} revised, ${counts.unchanged} unchanged`,
    );
    return {
      runId: run.id,
      collector: collector.name,
      status,
      fetched: validated.observations.length,
      ...counts,
      failures,
    };
  } catch (raw) {
    const error = classify(raw);
    await db
      .update(collectorRuns)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        errorClass: error.errorClass,
        message: error.message,
      })
      .where(eq(collectorRuns.id, run.id));
    log(`FAILED (${error.errorClass}): ${error.message}`);
    return {
      runId: run.id,
      collector: collector.name,
      status: "failed",
      fetched: 0,
      inserted: 0,
      revised: 0,
      unchanged: 0,
      failures: [],
      error,
    };
  }
}

function validate(output: CollectOutput) {
  const seriesDefs: SeriesDef[] = [];
  for (const s of output.series) {
    const r = v.safeParse(SeriesDefSchema, s);
    if (!r.success) throw permanent(`invalid series ${s.id}: ${issues(r)}`);
    seriesDefs.push(r.output);
  }
  const known = new Set(seriesDefs.map((s) => s.id));
  const seen = new Set<string>();
  const obs: ObservationInput[] = [];
  for (const o of output.observations) {
    const r = v.safeParse(ObservationInputSchema, o);
    if (!r.success) {
      throw permanent(`invalid observation ${o.seriesId}@${o.periodEnd}: ${issues(r)}`);
    }
    if (!known.has(o.seriesId)) {
      throw permanent(`observation for undeclared series ${o.seriesId}`);
    }
    // Collectors must resolve duplicates themselves (e.g. pick the latest filing).
    const key = `${o.seriesId}@${o.periodEnd}`;
    if (seen.has(key)) throw permanent(`duplicate observation ${key}`);
    seen.add(key);
    obs.push(r.output);
  }
  return {
    series: seriesDefs,
    observations: obs,
    snapshots: output.snapshots ?? [],
  };
}

function issues(r: { issues: readonly { message: string }[] }) {
  return r.issues.map((i) => i.message).join(", ");
}

function sameValue(a: number, b: number) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

// Append-only: unchanged values are skipped, changed values become a new
// vintage and the old row loses its isLatest flag. All writes are one batch,
// so a run either lands completely or not at all.
async function persist(
  db: Db,
  source: string,
  data: ReturnType<typeof validate>,
  runId: number,
  collectedAt: string,
) {
  const seriesIds = data.series.map((s) => s.id);
  const latest = new Map<string, { id: number; value: number }>();
  if (seriesIds.length) {
    const rows = await db
      .select({
        id: observations.id,
        seriesId: observations.seriesId,
        periodEnd: observations.periodEnd,
        value: observations.value,
      })
      .from(observations)
      .where(and(inArray(observations.seriesId, seriesIds), eq(observations.isLatest, true)));
    for (const r of rows) latest.set(`${r.seriesId}@${r.periodEnd}`, r);
  }

  const toInsert: (typeof observations.$inferInsert)[] = [];
  const superseded: number[] = [];
  let unchanged = 0;
  for (const o of data.observations) {
    const prev = latest.get(`${o.seriesId}@${o.periodEnd}`);
    if (prev && sameValue(prev.value, o.value)) {
      unchanged++;
      continue;
    }
    if (prev) superseded.push(prev.id);
    toInsert.push({ ...o, collectedAt, runId, isLatest: true });
  }

  const stmts = [];
  for (const s of data.series) {
    const row = { ...s, updatedAt: collectedAt };
    stmts.push(
      db.insert(series).values(row).onConflictDoUpdate({
        target: series.id,
        set: row,
      }),
    );
  }
  for (let i = 0; i < superseded.length; i += INSERT_CHUNK) {
    stmts.push(
      db
        .update(observations)
        .set({ isLatest: false })
        .where(inArray(observations.id, superseded.slice(i, i + INSERT_CHUNK))),
    );
  }
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    stmts.push(db.insert(observations).values(toInsert.slice(i, i + INSERT_CHUNK)));
  }
  for (const snap of data.snapshots) {
    const body = gzipSync(snap.body);
    stmts.push(
      db
        .insert(rawSnapshots)
        .values({
          source,
          takenAt: collectedAt,
          contentType: snap.contentType,
          sha256: createHash("sha256").update(snap.body).digest("hex"),
          body,
          runId,
        })
        .onConflictDoNothing(),
    );
  }
  const [first, ...rest] = stmts;
  if (first) await db.batch([first, ...rest]);

  return {
    inserted: toInsert.length - superseded.length,
    revised: superseded.length,
    unchanged,
  };
}
