import { describe, expect, it } from "vitest";
import { memoryDb } from "../../test/helpers";
import { latestObservations, mergeObservationRows } from "./queries";
import { collectorRuns, observations, series } from "./schema";

const narrow = (seriesId: string, periodEnd: string) => ({
  seriesId,
  periodEnd,
  value: 1,
  kind: "reported" as const,
});
const wide = (seriesId: string, periodEnd: string) => ({
  ...narrow(seriesId, periodEnd),
  id: 7,
  sourceUrl: "https://example.test",
});

describe("mergeObservationRows", () => {
  it("swaps in the wide row for the same period and keeps the order", () => {
    const rows = mergeObservationRows(
      [narrow("a", "2025-01-01"), narrow("a", "2025-02-01"), narrow("b", "2025-01-01")],
      [wide("a", "2025-02-01"), wide("b", "2025-01-01")],
    );
    expect(rows.map((r) => [r.seriesId, r.periodEnd, "id" in r])).toEqual([
      ["a", "2025-01-01", false],
      ["a", "2025-02-01", true],
      ["b", "2025-01-01", true],
    ]);
  });

  it("appends the rows of series that have no narrow rows, in period order", () => {
    const rows = mergeObservationRows(
      [narrow("a", "2025-01-01")],
      [wide("m", "2025-03-01"), wide("m", "2025-01-01")],
    );
    expect(rows.map((r) => `${r.seriesId}:${r.periodEnd}`)).toEqual([
      "a:2025-01-01",
      "m:2025-01-01",
      "m:2025-03-01",
    ]);
  });

  it("restores the order when data changed between the two statements", () => {
    const rows = mergeObservationRows(
      [narrow("a", "2025-01-01"), narrow("b", "2025-01-01")],
      [wide("a", "2025-02-01")],
    );
    expect(rows.map((r) => `${r.seriesId}:${r.periodEnd}`)).toEqual([
      "a:2025-01-01",
      "a:2025-02-01",
      "b:2025-01-01",
    ]);
  });
});

describe("latestObservations", () => {
  async function seeded() {
    const db = await memoryDb();
    const [run] = await db
      .insert(collectorRuns)
      .values({ collector: "sec", startedAt: "2026-01-01T00:00:00Z", status: "ok" })
      .returning();
    const def = (id: string, collector: string, indicator = "capex_cashflow") => ({
      id,
      indicator,
      label: id,
      entity: "T",
      source: "s",
      sourceUrl: "https://example.test",
      unit: "USD",
      methodology: "m",
      cadence: "quarterly",
      collector,
      updatedAt: "x",
    });
    await db
      .insert(series)
      .values([def("sec.T.a", "sec"), def("sec.T.b", "sec"), def("man.T.m", "manual")]);
    const obs = (
      seriesId: string,
      periodEnd: string,
      value: number,
      collectedAt: string,
      isLatest = true,
    ) => ({
      seriesId,
      periodStart: periodEnd,
      periodEnd,
      value,
      kind: "reported" as const,
      sourceUrl: `https://example.test/${value}`,
      collectedAt,
      runId: run?.id ?? 1,
      isLatest,
    });
    await db.insert(observations).values([
      obs("sec.T.a", "2025-03-31", 1, "2025-04-01"),
      // Newest period has two vintages; only the later one is latest.
      obs("sec.T.a", "2025-06-30", 2, "2025-07-01", false),
      obs("sec.T.a", "2025-06-30", 3, "2025-08-01"),
      obs("sec.T.b", "2025-03-31", 4, "2025-04-01"),
      obs("man.T.m", "2025-01-01", 5, "2025-04-01"),
      obs("man.T.m", "2025-02-01", 6, "2025-04-01"),
    ]);
    return db;
  }

  it("returns the latest vintage of the newest period as the wide last row", async () => {
    const db = await seeded();
    const rows = await latestObservations(db, { indicators: ["capex_cashflow"] });
    const a = rows.filter((r) => r.seriesId === "sec.T.a");
    expect(a.map((r) => [r.periodEnd, r.value])).toEqual([
      ["2025-03-31", 1],
      ["2025-06-30", 3],
    ]);
    expect(a[0]).not.toHaveProperty("sourceUrl");
    expect(a[1]?.sourceUrl).toBe("https://example.test/3");
    // Manual series come whole and wide.
    const m = rows.filter((r) => r.seriesId === "man.T.m");
    expect(m.map((r) => r.value)).toEqual([5, 6]);
    expect(m.every((r) => "sourceUrl" in r)).toBe(true);
  });

  it("keeps the newest row only when it is not before `since`", async () => {
    const db = await seeded();
    const rows = await latestObservations(db, { indicators: ["capex_cashflow"] }, "2025-05-01");
    expect(rows.filter((r) => r.seriesId === "sec.T.a").map((r) => r.value)).toEqual([3]);
    expect(rows.some((r) => r.seriesId === "sec.T.b")).toBe(false);
  });

  it("applies the filters together with an id list", async () => {
    const db = await seeded();
    const ids = ["sec.T.a", "sec.T.b", "man.T.m"];
    const sec = await latestObservations(db, {
      indicators: ["capex_cashflow"],
      collectors: ["sec"],
      seriesIds: ids,
    });
    expect(new Set(sec.map((r) => r.seriesId))).toEqual(new Set(["sec.T.a", "sec.T.b"]));
    const other = await latestObservations(db, { indicators: ["credit"], seriesIds: ids });
    expect(other).toEqual([]);
    // No indicators: the id list alone.
    const all = await latestObservations(db, { indicators: [], seriesIds: ids });
    expect(new Set(all.map((r) => r.seriesId)).size).toBe(3);
  });
});
