import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { SeriesDef } from "~/domain/types";
import { collectorRuns, observations } from "~/storage/schema";
import { memoryDb } from "../../test/helpers";
import { transient } from "./errors";
import { runCollector } from "./runner";
import type { CollectOutput, Collector } from "./types";

const SERIES: SeriesDef = {
  id: "test.a",
  indicator: "credit",
  label: "Test A",
  source: "Test",
  sourceUrl: "https://example.com",
  unit: "%",
  methodology: "test",
  cadence: "daily",
  collector: "test",
};

function collector(output: () => CollectOutput): Collector {
  return {
    name: "test",
    description: "test",
    collect: async () => output(),
  };
}

const obs = (periodEnd: string, value: number) => ({
  seriesId: "test.a",
  periodStart: periodEnd,
  periodEnd,
  value,
  kind: "reported" as const,
});

const quiet = { log: () => {} };

describe("runCollector", () => {
  it("is idempotent and keeps revisions as new vintages", async () => {
    const db = await memoryDb();
    let values = [obs("2026-01-01", 1), obs("2026-01-02", 2)];
    const c = collector(() => ({ series: [SERIES], observations: values }));

    const first = await runCollector(db, c, {
      ...quiet,
      now: new Date("2026-01-03T00:00:00Z"),
    });
    expect(first).toMatchObject({ status: "ok", inserted: 2, revised: 0 });

    const second = await runCollector(db, c, {
      ...quiet,
      now: new Date("2026-01-04T00:00:00Z"),
    });
    expect(second).toMatchObject({ inserted: 0, revised: 0, unchanged: 2 });

    values = [obs("2026-01-01", 1), obs("2026-01-02", 2.5)];
    const third = await runCollector(db, c, {
      ...quiet,
      now: new Date("2026-01-05T00:00:00Z"),
    });
    expect(third).toMatchObject({ inserted: 0, revised: 1, unchanged: 1 });

    const rows = await db
      .select()
      .from(observations)
      .where(eq(observations.periodEnd, "2026-01-02"));
    expect(rows.map((r) => [r.value, r.isLatest])).toEqual([
      [2, false],
      [2.5, true],
    ]);
  });

  it("fails the whole run on invalid data and writes nothing", async () => {
    const db = await memoryDb();
    const c = collector(() => ({
      series: [SERIES],
      observations: [obs("2026-01-01", 1), obs("not-a-date", 2)],
    }));
    const res = await runCollector(db, c, quiet);
    expect(res.status).toBe("failed");
    expect(res.error?.errorClass).toBe("permanent");
    expect(await db.select().from(observations)).toHaveLength(0);
    const [run] = await db.select().from(collectorRuns);
    expect(run).toMatchObject({ status: "failed", errorClass: "permanent" });
  });

  it("rejects duplicate periods and undeclared series", async () => {
    const db = await memoryDb();
    const dup = await runCollector(
      db,
      collector(() => ({
        series: [SERIES],
        observations: [obs("2026-01-01", 1), obs("2026-01-01", 2)],
      })),
      quiet,
    );
    expect(dup.error?.message).toMatch(/duplicate/);
    const undeclared = await runCollector(
      db,
      collector(() => ({ series: [], observations: [obs("2026-01-01", 1)] })),
      quiet,
    );
    expect(undeclared.error?.message).toMatch(/undeclared/);
  });

  it("records partial runs with the failing sub-source", async () => {
    const db = await memoryDb();
    const res = await runCollector(
      db,
      collector(() => ({
        series: [SERIES],
        observations: [obs("2026-01-01", 1)],
        failures: [{ key: "other", error: transient("HTTP 503") }],
      })),
      quiet,
    );
    expect(res).toMatchObject({ status: "partial", inserted: 1 });
    const [run] = await db.select().from(collectorRuns);
    expect(run).toMatchObject({
      status: "partial",
      errorClass: "transient",
      message: "other: HTTP 503",
    });
  });

  it("fails the run when there are failures and no output", async () => {
    const db = await memoryDb();
    const res = await runCollector(
      db,
      collector(() => ({
        series: [],
        observations: [],
        failures: [
          { key: "a", error: transient("HTTP 503") },
          { key: "b", error: transient("HTTP 502") },
        ],
      })),
      quiet,
    );
    expect(res.status).toBe("failed");
    expect(res.error?.message).toBe("HTTP 503");
    const [run] = await db.select().from(collectorRuns);
    expect(run).toMatchObject({ status: "failed", errorClass: "transient", message: "HTTP 503" });
  });

  it("stays partial when failures come with filing events only", async () => {
    const db = await memoryDb();
    const res = await runCollector(
      db,
      collector(() => ({
        series: [],
        observations: [],
        filingEvents: [
          {
            accession: "0000000000-26-000001",
            ticker: "T",
            company: "Test",
            form: "8-K",
            filedAt: "2026-01-01",
            sourceUrl: "https://example.com",
          },
        ],
        failures: [{ key: "other", error: transient("HTTP 503") }],
      })),
      quiet,
    );
    expect(res.status).toBe("partial");
  });
});
