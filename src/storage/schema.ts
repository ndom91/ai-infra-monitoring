import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Static provenance lives here so observation rows stay small.
export const series = sqliteTable("series", {
  id: text().primaryKey(),
  indicator: text().notNull(),
  label: text().notNull(),
  // Company ticker, GPU model, region... whatever the series is "about".
  entity: text(),
  source: text().notNull(),
  sourceUrl: text().notNull(),
  unit: text().notNull(),
  currency: text(),
  methodology: text().notNull(),
  cadence: text().notNull(),
  collector: text().notNull(),
  updatedAt: text().notNull(),
});

export const observations = sqliteTable(
  "observations",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    seriesId: text()
      .notNull()
      .references(() => series.id),
    periodStart: text().notNull(),
    periodEnd: text().notNull(),
    value: real().notNull(),
    kind: text({
      enum: ["reported", "calculated", "estimated", "manual"],
    }).notNull(),
    // Publication/filing date of this vintage, when the source states one.
    asOf: text(),
    // Specific document (filing, report) when more precise than series.sourceUrl.
    sourceUrl: text(),
    note: text(),
    // Verbatim source sentence backing a hand-entered value.
    quote: text(),
    collectedAt: text().notNull(),
    runId: integer()
      .notNull()
      .references(() => collectorRuns.id),
    // Maintained on write so reads never need a "latest vintage" subquery,
    // which matters because Turso bills by rows read.
    isLatest: integer({ mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    uniqueIndex("obs_vintage_uq").on(t.seriesId, t.periodEnd, t.collectedAt),
    index("obs_latest_idx").on(t.seriesId, t.isLatest, t.periodEnd),
  ],
);

export const rawSnapshots = sqliteTable(
  "raw_snapshots",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    takenAt: text().notNull(),
    contentType: text().notNull(),
    sha256: text().notNull(),
    // gzip-compressed response body.
    body: blob({ mode: "buffer" }).notNull(),
    runId: integer()
      .notNull()
      .references(() => collectorRuns.id),
  },
  (t) => [uniqueIndex("snap_sha_uq").on(t.source, t.sha256)],
);

export const collectorRuns = sqliteTable(
  "collector_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    collector: text().notNull(),
    startedAt: text().notNull(),
    finishedAt: text(),
    status: text({ enum: ["running", "ok", "partial", "failed"] }).notNull(),
    errorClass: text({ enum: ["transient", "permanent"] }),
    message: text(),
    fetched: integer().notNull().default(0),
    inserted: integer().notNull().default(0),
    revised: integer().notNull().default(0),
    unchanged: integer().notNull().default(0),
  },
  (t) => [index("runs_collector_idx").on(t.collector, t.startedAt)],
);

export const filingEvents = sqliteTable(
  "filing_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    accession: text().notNull().unique(),
    ticker: text().notNull(),
    company: text().notNull(),
    form: text().notNull(),
    filedAt: text().notNull(),
    acceptedAt: text(),
    reportDate: text(),
    items: text(),
    description: text(),
    sourceUrl: text().notNull(),
    runId: integer()
      .notNull()
      .references(() => collectorRuns.id),
  },
  (t) => [index("filing_events_time_idx").on(t.acceptedAt, t.filedAt)],
);

export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    ruleId: text().notNull(),
    // Null for rules that span several series (breadth rules).
    seriesId: text(),
    triggeredAt: text().notNull(),
    severity: text({ enum: ["info", "warning", "critical"] }).notNull(),
    message: text().notNull(),
    // JSON: triggering observation ids, values, dates, sources.
    evidence: text({ mode: "json" }).$type<AlertEvidence>().notNull(),
    // One event per rule per evidence window, so re-evaluation is idempotent.
    dedupeKey: text().notNull().unique(),
    createdAt: text().notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("alerts_time_idx").on(t.triggeredAt)],
);

export type AlertEvidence = {
  observations: {
    id: number;
    seriesId: string;
    label: string;
    periodEnd: string;
    value: number;
    unit: string;
    source: string;
    sourceUrl: string;
  }[];
  params: Record<string, number | string>;
};
