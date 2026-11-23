import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import {
  companyOutput,
  inferCadence,
  makeSecCollector,
  SEC_COMPANIES,
  secCollector,
  secSeriesId,
} from ".";
import {
  type Fact,
  filingIndexUrl,
  hasPeriodicFilings,
  instants,
  parseCompanyFacts,
  quarterlyFlows,
  usdFacts,
} from "./companyfacts";

const fixture = (t: string) => readFileSync(`test/fixtures/sec/${t}.json`, "utf8");
const msft = parseCompanyFacts(fixture("MSFT"));
const crwv = parseCompanyFacts(fixture("CRWV"));

function fact(
  start: string | undefined,
  end: string,
  val: number,
  filed = "2026-01-01",
  accn = "0000000000-26-000001",
): Fact {
  return { start, end, val, accn, form: "10-Q", filed };
}

describe("parseCompanyFacts", () => {
  it("accepts recorded responses, including a string cik", () => {
    expect(msft.entityName).toBe("MICROSOFT CORPORATION");
    expect(crwv.cik).toBe("0001769628");
  });

  it("rejects schema drift and non-JSON", () => {
    expect(() => parseCompanyFacts("<html>")).toThrow(/not JSON/);
    expect(() => parseCompanyFacts('{"cik":1}')).toThrow(/shape/);
  });
});

describe("quarterlyFlows", () => {
  it("uses 3-month facts directly and derives Q4 as FY minus 9M (MSFT capex)", () => {
    const q = quarterlyFlows(usdFacts(msft, "PaymentsToAcquirePropertyPlantAndEquipment"));
    const byEnd = new Map(q.map((p) => [p.periodEnd, p]));
    expect(byEnd.get("2025-09-30")).toMatchObject({
      periodStart: "2025-07-01",
      value: 19_394_000_000,
      kind: "reported",
      asOf: "2025-10-29",
    });
    expect(byEnd.get("2026-06-30")).toMatchObject({
      periodStart: "2026-04-01",
      value: 115_948_000_000 - 80_146_000_000,
      kind: "calculated",
      asOf: "2026-07-29",
      accn: "0001193125-26-323660",
    });
    expect(byEnd.get("2026-06-30")?.note).toMatch(/minus 2025-07-01\.\.2026-03-31/);
    // MSFT's fiscal year ends in June: dates are real period dates.
    expect(q.every((p) => p.periodEnd >= p.periodStart)).toBe(true);
    const ends = q.map((p) => p.periodEnd);
    expect(new Set(ends).size).toBe(ends.length);
  });

  it("derives cash-flow quarters from year-to-date facts (CRWV OCF)", () => {
    const q = quarterlyFlows(usdFacts(crwv, "NetCashProvidedByUsedInOperatingActivities"));
    const byEnd = new Map(q.map((p) => [p.periodEnd, p]));
    expect(byEnd.get("2026-03-31")).toMatchObject({
      value: 2_984_000_000,
      kind: "reported",
    });
    // 6M 2026 (3,663m) minus Q1 2026 (2,984m).
    expect(byEnd.get("2026-06-30")).toMatchObject({
      periodStart: "2026-04-01",
      value: 679_000_000,
      kind: "calculated",
    });
  });

  it("keeps the most recently filed value for a restated period", () => {
    const q = quarterlyFlows([
      fact("2025-01-01", "2025-03-31", 100, "2025-05-01", "a"),
      fact("2025-01-01", "2025-03-31", 110, "2026-05-01", "b"),
    ]);
    expect(q).toEqual([expect.objectContaining({ value: 110, asOf: "2026-05-01", accn: "b" })]);
  });

  it("falls back to FY minus three quarters when no 9M fact exists", () => {
    const q = quarterlyFlows([
      fact("2025-01-01", "2025-03-31", 10),
      fact("2025-04-01", "2025-06-30", 20),
      fact("2025-07-01", "2025-09-30", 30),
      fact("2025-01-01", "2025-12-31", 100, "2026-02-01", "fy"),
    ]);
    expect(q.at(-1)).toMatchObject({
      periodStart: "2025-10-01",
      periodEnd: "2025-12-31",
      value: 40,
      kind: "calculated",
      asOf: "2026-02-01",
    });
  });

  it("never emits non-quarter durations and leaves gaps unfilled", () => {
    const q = quarterlyFlows([
      fact("2025-01-01", "2025-12-31", 100),
      fact("2025-01-01", "2025-06-30", 40),
    ]);
    expect(q).toEqual([]);
  });
});

describe("instants", () => {
  it("sums component tags only where every component is present", () => {
    const tags = ["FinanceLeaseLiabilityNoncurrent", "FinanceLeaseLiabilityCurrent"];
    const pts = instants(
      tags.map((t) => usdFacts(crwv, t)),
      tags,
    );
    expect(pts.at(-1)).toMatchObject({
      periodStart: "2026-06-30",
      periodEnd: "2026-06-30",
      value: 214_000_000 + 7_000_000,
      kind: "calculated",
    });
    expect(instants([[fact(undefined, "2026-03-31", 1)], []], ["A", "B"])).toEqual([]);
  });
});

describe("companyOutput", () => {
  it("picks the tag with current data and skips concepts without quarters", () => {
    const logs: string[] = [];
    const msftCo = SEC_COMPANIES.find((c) => c.ticker === "MSFT");
    if (!msftCo) throw new Error("MSFT missing");
    const out = companyOutput(msft, msftCo, (m) => logs.push(m));
    const revenue = out.series.find((s) => s.id === "sec.MSFT.revenue");
    // "Revenues" is listed first but MSFT stopped using it in 2010.
    expect(revenue?.methodology).toContain(
      "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    );
    expect(revenue?.indicator).toBe("contract_conversion");
    // InterestPaid is annual-only, so no quarterly series exists.
    expect(out.series.some((s) => s.id === "sec.MSFT.interest_paid")).toBe(false);
    expect(logs).toContain("MSFT: no quarterly data for interest_paid");
    const obs = out.observations.find(
      (o) => o.seriesId === "sec.MSFT.capex" && o.periodEnd === "2025-09-30",
    );
    expect(obs?.sourceUrl).toBe(filingIndexUrl(789019, "0001193125-25-256321"));
    expect(obs?.sourceUrl).toBe(
      "https://www.sec.gov/Archives/edgar/data/789019/000119312525256321/0001193125-25-256321-index.htm",
    );
  });
});

describe("secCollector", () => {
  it("detects 20-F-only filers", () => {
    expect(hasPeriodicFilings(parseCompanyFacts(fixture("NBIS")))).toBe(false);
    expect(hasPeriodicFilings(parseCompanyFacts(fixture("MSFT")))).toBe(true);
  });

  it("persists all companies and records a failing one as partial", async () => {
    const db = await memoryDb();
    const routes: Record<string, string | number> = {};
    for (const c of SEC_COMPANIES) {
      const cik = `CIK${String(c.cik).padStart(10, "0")}`;
      routes[cik] = c.ticker === "MSFT" ? fixture(c.ticker) : fixture("CRWV");
    }
    routes.CIK0001144879 = 503;
    const res = await runCollector(db, makeSecCollector(0), {
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    expect(res.status).toBe("partial");
    expect(res.failures.map((f) => [f.key, f.error.errorClass])).toEqual([["APLD", "transient"]]);
    expect(res.inserted).toBeGreaterThan(50);

    // A second identical run must not create new vintages.
    const again = await runCollector(db, makeSecCollector(0), {
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    expect(again.inserted).toBe(0);
    expect(again.revised).toBe(0);
    expect(secSeriesId("CRWV", "capex")).toBe("sec.CRWV.capex");
    expect(secCollector.name).toBe("sec");
  });
});

describe("late-January fiscal year (DELL)", () => {
  it("derives quarters from real period dates, not fiscal labels", () => {
    // FY2026 ends 2026-01-30; Q1 ends 2025-05-02, Q2 08-01, Q3 10-31.
    const q = quarterlyFlows([
      fact("2025-02-01", "2025-05-02", 20),
      fact("2025-02-01", "2025-08-01", 45),
      fact("2025-02-01", "2025-10-31", 75),
      fact("2025-02-01", "2026-01-30", 110, "2026-03-20", "fy"),
    ]);
    expect(q.map((p) => [p.periodEnd, p.value, p.kind])).toEqual([
      ["2025-05-02", 20, "reported"],
      ["2025-08-01", 25, "calculated"],
      ["2025-10-31", 30, "calculated"],
      ["2026-01-30", 35, "calculated"],
    ]);
    expect(q.at(-1)).toMatchObject({ periodStart: "2025-11-01", asOf: "2026-03-20" });
  });
});

describe("inferCadence", () => {
  const ends = (...d: string[]) => d.map((periodEnd) => ({ periodEnd }));
  it("treats quarter-spaced data as quarterly", () => {
    expect(inferCadence(ends("2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"))).toBe(
      "quarterly",
    );
  });
  it("treats 10-K-only data as annual", () => {
    expect(inferCadence(ends("2023-01-29", "2024-01-28", "2025-01-26"))).toBe("annual");
  });
  it("follows the recent spacing when a company switches to quarterly", () => {
    expect(
      inferCadence(ends("2022-12-31", "2023-12-31", "2024-03-31", "2024-06-30", "2024-09-30")),
    ).toBe("quarterly");
  });
  it("defaults to quarterly with a single point", () => {
    expect(inferCadence(ends("2025-12-31"))).toBe("quarterly");
  });
});
