import { describe, expect, it } from "vitest";
import { latestObservations } from "~/storage/queries";
import { collectorRuns, observations, series } from "~/storage/schema";
import { memoryDb } from "../../test/helpers";
import { derivedConcepts, derivedInputIds, derivedViews } from "./derived";
import { groupBySeries } from "./views";

const NOW = new Date("2026-11-24T12:00:00Z");

describe("derivedConcepts", () => {
  it("lists what the metrics read", () => {
    expect([...derivedConcepts()].sort()).toEqual(
      [
        "ar",
        "capex",
        "cogs",
        "debt",
        "finance_leases",
        "interest_paid",
        "inventory",
        "ocf",
        "revenue",
        "rpo",
      ].sort(),
    );
  });
});

// A quarterly series with values that differ every quarter.
function quarterEnds(from: string, to: string, ends: string[]) {
  const out: string[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const md of ends) {
      const d = `${y}-${md}`;
      if (d >= from && d <= to) out.push(d);
    }
  }
  return out;
}

const CALENDAR = ["03-31", "06-30", "09-30", "12-31"];
// Oracle-style fiscal quarters.
const FISCAL = ["02-28", "05-31", "08-31", "11-30"];

type Spec = { ticker: string; ends: string[]; stops?: Record<string, string> };

async function seed(specs: Spec[]) {
  const db = await memoryDb();
  const [run] = await db
    .insert(collectorRuns)
    .values({ collector: "sec", startedAt: "2026-11-01T00:00:00Z", status: "ok" })
    .returning();
  for (const spec of specs) {
    for (const concept of derivedConcepts()) {
      const id = `sec.${spec.ticker}.${concept}`;
      await db.insert(series).values({
        id,
        indicator: "capex_cashflow",
        label: id,
        entity: spec.ticker,
        source: "test",
        sourceUrl: "https://example.test",
        unit: "USD",
        methodology: "test",
        cadence: "quarterly",
        collector: "sec",
        updatedAt: "2026-11-01T00:00:00Z",
      });
      const last = spec.stops?.[concept] ?? "2026-09-30";
      const ends = quarterEnds("2012-01-01", last, spec.ends);
      await db.insert(observations).values(
        ends.map((periodEnd, i) => ({
          seriesId: id,
          periodStart: periodEnd,
          periodEnd,
          // Rising with wobble, so growth, ratios and sums all differ per quarter.
          value: 100 + i * 7 + ((i * 37) % 11),
          kind: "reported" as const,
          collectedAt: "2026-11-01T00:00:00Z",
          runId: run?.id ?? 1,
        })),
      );
    }
  }
  return db;
}

describe("loading only the concepts the derived metrics read", () => {
  it("gives the same derived series as loading every concept", async () => {
    const specs: Spec[] = [
      { ticker: "CURR", ends: CALENDAR },
      { ticker: "FISC", ends: FISCAL },
      { ticker: "OLDI", ends: CALENDAR, stops: { interest_paid: "2016-12-31", rpo: "2019-12-31" } },
    ];
    const db = await seed(specs);
    // A series no derived metric reads.
    await db.insert(series).values({
      id: "sec.CURR.unrelated",
      indicator: "capex_cashflow",
      label: "x",
      entity: "CURR",
      source: "test",
      sourceUrl: "https://example.test",
      unit: "USD",
      methodology: "test",
      cadence: "quarterly",
      collector: "sec",
      updatedAt: "2026-11-01T00:00:00Z",
    });
    const tickers = specs.map((s) => s.ticker);
    const ctx = { now: NOW, visibleFrom: "2021-11-24", lastRunStatus: "ok" as const };
    const filtered = await latestObservations(db, {
      indicators: ["capex_cashflow"],
      collectors: ["sec"],
      seriesIds: derivedInputIds(tickers),
    });
    const everything = await latestObservations(db, {
      indicators: ["capex_cashflow"],
      collectors: ["sec"],
    });
    expect(filtered.length).toBe(everything.length);
    const result = derivedViews(tickers, groupBySeries(filtered), ctx);
    expect(result.length).toBeGreaterThan(20);
    expect(result).toEqual(derivedViews(tickers, groupBySeries(everything), ctx));
  });
});
