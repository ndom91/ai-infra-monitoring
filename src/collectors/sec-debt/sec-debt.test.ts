import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { observations, series } from "~/storage/schema";
import { memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import { secDebtCollector } from ".";
import {
  type DebtFact,
  findFilingFiles,
  memberFallbackLabel,
  memberLabel,
  parseInstance,
  parseLabels,
  readRate,
  slug,
} from "./instance";

const fixture = (name: string) => readFileSync(`test/fixtures/sec_debt/${name}`, "utf8");
const instance = fixture("crwv-instance.xml");
const labels = parseLabels(fixture("crwv-labels.xml"));
const parsed = parseInstance(instance);

const find = (
  instrument: string,
  metric: DebtFact["metric"],
  qualifier?: string,
  periodEnd = "2026-09-30",
) =>
  parsed.facts.filter(
    (f) =>
      f.instrument === instrument &&
      f.metric === metric &&
      f.periodEnd === periodEnd &&
      f.qualifiers.map((q) => q.member.split(":")[1]).join(",") === (qualifier ?? ""),
  );

describe("parseInstance", () => {
  it("maps each DDTL facility to its own instrument", () => {
    const [ddtl21] = find("DDTL2.1FacilityMember", "carrying_amount", "RecourseMember");
    expect(ddtl21?.value).toBe(2_494_000_000);
    expect(ddtl21?.instrumentQName).toBe("crwv:DDTL2.1FacilityMember");
    expect(find("DDTL4.0FacilityMember", "carrying_amount", "NonrecourseMember")[0]?.value).toBe(
      4_583_000_000,
    );
  });

  it("keeps recourse and non-recourse OEM financing apart", () => {
    expect(find("OEMFinancingArrangementsMember", "carrying_amount", "RecourseMember")).toEqual([
      expect.objectContaining({ value: 6_891_000_000 }),
    ]);
    expect(find("OEMFinancingArrangementsMember", "carrying_amount", "NonrecourseMember")).toEqual([
      expect.objectContaining({ value: 770_000_000 }),
    ]);
  });

  it("stores rates in percent and keeps the reference rate as a qualifier", () => {
    const sofr = find(
      "DDTL4.0FacilityMember",
      "stated_rate",
      "SecuredOvernightFinancingRateSofrMember",
    );
    expect(sofr).toEqual([expect.objectContaining({ value: 2.25, filed: "0.0225" })]);
    expect(find("DDTL4.0FacilityMember", "stated_rate", "TreasuryRateMember")[0]?.value).toBe(2);
  });

  it("merges identical repeats and ignores debt-type members", () => {
    // The 9.75% notes state their rate twice, with and without a SeniorNotes
    // member; the debt-type axis must not split them.
    const rates = find("A20319.75SeniorNotesMember", "stated_rate");
    expect(rates).toHaveLength(1);
    expect(rates[0]?.value).toBe(9.75);
    expect(rates[0]?.qualifiers).toEqual([]);
  });

  it("uses a credit facility member when no debt instrument is tagged", () => {
    const [revolver] = find("RevolvingCreditFacilityMember", "carrying_amount", "RecourseMember");
    expect(revolver?.value).toBe(1_200_000_000);
  });

  it("skips facts without an instrument and non-USD amounts", () => {
    expect(parsed.facts.some((f) => f.value === 47_505_000_000)).toBe(false);
    expect(parsed.skipped.aggregate).toBeGreaterThan(0);
    expect(find("A2032EURSeniorNotesMember", "face_amount", undefined, "2026-06-30")).toEqual([]);
    expect(parsed.skipped.unit).toBeGreaterThan(0);
  });

  it("throws on conflicting values for one key", () => {
    const doc = (a: string, b: string) => `<?xml version="1.0"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2031" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:x="http://x">
  <context id="c1"><entity><segment><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:LoanMember</xbrldi:explicitMember></segment></entity><period><instant>2026-09-30</instant></period></context>
  <unit id="usd"><measure>iso4217:USD</measure></unit>
  <us-gaap:DebtInstrumentCarryingAmount contextRef="c1" unitRef="usd">${a}</us-gaap:DebtInstrumentCarryingAmount>
  <us-gaap:DebtInstrumentCarryingAmount contextRef="c1" unitRef="usd">${b}</us-gaap:DebtInstrumentCarryingAmount>
</xbrl>`;
    expect(parseInstance(doc("100", "100.0")).facts).toHaveLength(1);
    expect(() => parseInstance(doc("100", "200"))).toThrow(/conflicting values/);
  });
});

describe("parseInstance category members", () => {
  const doc = (facts: string) => `<?xml version="1.0"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2031" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:x="http://x">
  <context id="c0"><entity><segment><xbrldi:explicitMember dimension="us-gaap:CreditFacilityAxis">us-gaap:LineOfCreditMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:LoanMember</xbrldi:explicitMember></segment></entity><period><instant>2026-09-30</instant></period></context>
  <context id="c1"><entity><segment><xbrldi:explicitMember dimension="us-gaap:CreditFacilityAxis">us-gaap:LineOfCreditMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:LoanMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:LongtermDebtTypeAxis">us-gaap:SecuredDebtMember</xbrldi:explicitMember></segment></entity><period><instant>2026-09-30</instant></period></context>
  <context id="c2"><entity><segment><xbrldi:explicitMember dimension="us-gaap:CreditFacilityAxis">us-gaap:LineOfCreditMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:LoanMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:LongtermDebtTypeAxis">us-gaap:UnsecuredDebtMember</xbrldi:explicitMember></segment></entity><period><instant>2026-09-30</instant></period></context>
  <unit id="usd"><measure>iso4217:USD</measure></unit>
  ${facts}
</xbrl>`;
  const fact = (ctx: string, value: number, decimals = "INF") =>
    `<us-gaap:DebtInstrumentFaceAmount contextRef="${ctx}" unitRef="usd" decimals="${decimals}">${value}</us-gaap:DebtInstrumentFaceAmount>`;

  it("treats a category that repeats the instrument as no qualifier", () => {
    const facts = parseInstance(doc(fact("c0", 5) + fact("c1", 5) + fact("c2", 5))).facts;
    expect(facts).toEqual([expect.objectContaining({ value: 5, qualifiers: [] })]);
  });

  it("keeps only the members that split an instrument into parts", () => {
    const facts = parseInstance(doc(fact("c0", 100) + fact("c1", 30) + fact("c2", 70))).facts;
    expect(
      facts.map((f) => [f.value, f.qualifiers.map((q) => q.member.split(":")[1]).join(",")]),
    ).toEqual([
      [100, ""],
      [30, "SecuredDebtMember"],
      [70, "UnsecuredDebtMember"],
    ]);
  });

  it("treats values that differ only by rounding as one and keeps the precise one", () => {
    const facts = parseInstance(
      doc(fact("c0", 224_200_000, "-5") + fact("c0", 224_211_000, "-3")),
    ).facts;
    expect(facts).toEqual([expect.objectContaining({ value: 224_211_000 })]);
  });
});

describe("rate scale", () => {
  const doc = (facts: [string, string][]) => `<?xml version="1.0"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2031" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:x="http://x">
  ${facts.map(([id, date]) => `<context id="${id}"><entity><segment><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:${id.replace(/\d+$/, "")}Member</xbrldi:explicitMember></segment></entity><period><instant>${date}</instant></period></context>`).join("\n  ")}
  <unit id="number"><measure>xbrli:pure</measure></unit>
</xbrl>`;
  const rate = (
    ctx: string,
    value: string,
    concept = "DebtInstrumentInterestRateEffectivePercentage",
  ) =>
    `<us-gaap:${concept} contextRef="${ctx}" unitRef="number" decimals="2">${value}</us-gaap:${concept}>`;
  const parse = (contexts: [string, string][], facts: string[]) =>
    parseInstance(doc(contexts).replace("</xbrl>", `${facts.join("\n")}\n</xbrl>`));

  it("reads a filed decimal as percent", () => {
    expect(readRate(0.0925)).toEqual({ value: 9.25 });
    expect(readRate(0.15)).toEqual({ value: 15 });
    expect(readRate(0)).toEqual({ value: 0 });
  });

  it("reads a whole percent as filed and says so", () => {
    expect(readRate(10)).toEqual({ value: 10, correction: expect.stringMatching(/whole percent/) });
    expect(readRate(1.5)).toMatchObject({ value: 1.5 });
  });

  it("splits the scales at 1 and rejects what is no rate", () => {
    expect(readRate(1.01)).toMatchObject({ value: 1.01 });
    expect(readRate(0.99)).toEqual({ value: 99 });
    expect(readRate(100)).toMatchObject({ value: 100 });
    expect(readRate(100.5)).toHaveProperty("skip");
  });

  it("does not store a lone 1 as 100% or as 1%", () => {
    expect(readRate(1)).toHaveProperty("skip");
    expect(readRate(1, [1])).toHaveProperty("skip");
  });

  it("uses other facts of the instrument to read values up to 1", () => {
    // 0.25 beside 0.0025 is 0.25%; 1 beside 0.0100 is 1%.
    expect(readRate(0.25, [0.0025, 0.25])).toMatchObject({ value: 0.25 });
    expect(readRate(1, [0.01, 1])).toMatchObject({
      value: 1,
      correction: expect.stringContaining("0.01"),
    });
    // Siblings that agree with the decimal reading change nothing.
    expect(readRate(0.25, [0.2, 0.25])).toEqual({ value: 25 });
    expect(readRate(1, [0.9, 1])).toEqual({ value: 100 });
  });

  it("stores the failing CRWV shape (10 filed as a whole percent) as 10%", () => {
    const { facts, skipped } = parse(
      [
        ["OEM1", "2026-03-31"],
        ["Magnetar1", "2026-03-31"],
      ],
      [rate("OEM1", "10"), rate("Magnetar1", "0.12")],
    );
    expect(facts.map((f) => [f.instrument, f.value, f.filed])).toEqual([
      ["OEMMember", 10, "10"],
      ["MagnetarMember", 12, "0.12"],
    ]);
    expect(facts[0]?.correction).toMatch(/whole percent/);
    expect(facts[1]?.correction).toBeUndefined();
    expect(skipped.rate).toBe(0);
  });

  it("skips and reports a lone 1 and a value above 100", () => {
    const parsedDoc = parse(
      [
        ["A1", "2026-03-31"],
        ["B1", "2026-03-31"],
      ],
      [rate("A1", "1", "DebtInstrumentInterestRateStatedPercentage"), rate("B1", "250")],
    );
    expect(parsedDoc.facts).toEqual([]);
    expect(parsedDoc.skipped.rate).toBe(2);
    expect(parsedDoc.ambiguous).toHaveLength(2);
  });

  it("reads 1 as 1% when the same instrument is filed as 0.0100 on another date", () => {
    const { facts } = parse(
      [
        ["Note1", "2025-12-08"],
        ["Note2", "2026-06-30"],
      ],
      [
        rate("Note1", "1", "DebtInstrumentInterestRateStatedPercentage"),
        rate("Note2", "0.0100", "DebtInstrumentInterestRateStatedPercentage"),
      ],
    );
    expect(facts.map((f) => [f.periodEnd, f.value])).toEqual([
      ["2025-12-08", 1],
      ["2026-06-30", 1],
    ]);
  });
});

describe("labels", () => {
  it("reads standard labels and drops the [Member] suffix", () => {
    expect(memberLabel(labels, "crwv:DDTL2.1FacilityMember")).toBe("DDTL 2.1 Facility");
    expect(memberLabel(labels, "crwv:A20319.75SeniorNotesMember")).toBe("2031 9.75% Senior Notes");
  });

  it("falls back to the member name without guessing digits", () => {
    expect(memberLabel(new Map(), "x:SecuredOvernightFinancingRateSofrMember")).toBe(
      "Secured Overnight Financing Rate Sofr",
    );
    expect(memberFallbackLabel("crwv:A20319.75SeniorNotesMember")).toBe("A20319.75Senior Notes");
  });

  it("builds id segments without dots", () => {
    expect(slug("crwv:DDTL2.1FacilityMember")).toBe("ddtl2_1_facility");
    expect(slug("us-gaap:RecourseMember")).toBe("recourse");
  });
});

describe("findFilingFiles", () => {
  const inline = ["a.htm", "a_htm.xml", "a_lab.xml", "a.xsd"];
  it("prefers the primary document's instance and finds the labels", () => {
    expect(findFilingFiles(inline, "a.htm")).toEqual({
      instance: "a_htm.xml",
      labels: "a_lab.xml",
      hasXbrl: true,
    });
  });

  it("falls back to the schema's instance for filings without inline XBRL", () => {
    expect(findFilingFiles(["x.htm", "x.xml", "x.xsd", "x_lab.xml"], "x.htm").instance).toBe(
      "x.xml",
    );
  });

  it("reports a missing instance and a filing without XBRL", () => {
    expect(findFilingFiles(["x.htm", "x.xsd", "x-xbrl.zip"], "x.htm")).toMatchObject({
      instance: undefined,
      hasXbrl: true,
    });
    expect(findFilingFiles(["x.htm", "x.txt"], "x.htm")).toMatchObject({ hasXbrl: false });
  });
});

const CRWV = "0001769628";
const submissions = (cik: string, filings: [string, string, string][]) =>
  JSON.stringify({
    filings: {
      recent: {
        accessionNumber: filings.map((f) => f[0]),
        filingDate: filings.map((f) => f[1]),
        form: filings.map((f) => f[2]),
        primaryDocument: filings.map(() => `${cik}.htm`),
      },
    },
  });

const empty = `<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2026"></xbrl>`;
const listing = (stem: string) =>
  JSON.stringify({
    directory: {
      item: [`${stem}.htm`, `${stem}_htm.xml`, `${stem}_lab.xml`, `${stem}.xsd`].map((name) => ({
        name,
      })),
    },
  });

// CRWV serves the trimmed instance, Anthropic has a prospectus, and the other issuers have no debt facts.
function fakeSec(requested: string[] = []) {
  const crwvFilings: [string, string, string][] = [
    ["0001769628-26-000465", "2026-11-12", "10-Q"],
    ["0001769628-26-000366", "2026-08-12", "10-Q"],
    ["0001769628-26-000222", "2026-05-08", "10-Q"],
    ["0001769628-26-000111", "2026-02-27", "10-K"],
    ["0001769628-25-000050", "2025-11-13", "10-Q"],
    ["0001769628-25-000010", "2025-08-14", "10-Q"],
  ];
  return async (url: string) => {
    requested.push(url);
    const body = (() => {
      if (url.includes(`CIK${CRWV}`)) return submissions(CRWV, crwvFilings);
      if (url.includes("CIK0002130357")) {
        return submissions("0002130357", [["0001628280-26-074944", "2026-11-19", "424B4"]]);
      }
      const other = /CIK(\d{10})/.exec(url)?.[1];
      if (other) return submissions(other, [[`${other}-26-000001`, "2026-11-01", "10-Q"]]);
      if (url.includes("/000176962826000465/index.json")) return listing("crwv-20260930");
      if (url.includes("/000176962826000465/crwv-20260930_htm.xml")) return instance;
      if (url.includes("/000176962826000465/crwv-20260930_lab.xml"))
        return fixture("crwv-labels.xml");
      if (url.includes("/000176962826000366/index.json")) return listing("crwv-20260630");
      if (url.includes("/000176962826000366/crwv-20260630_htm.xml")) return empty;
      if (url.includes("/000176962826000222/index.json")) return listing("crwv-20260331");
      if (url.includes("/000176962826000222/crwv-20260331_htm.xml")) return empty;
      if (url.endsWith("/index.json")) return listing("other");
      if (url.endsWith("_htm.xml")) return empty;
      throw new Error(`unexpected fetch ${url}`);
    })();
    return new Response(body);
  };
}

describe("sec_debt collector", () => {
  it("writes one series per instrument, qualifier and metric", async () => {
    const db = await memoryDb();
    const summary = await runCollector(db, secDebtCollector, {
      fetch: fakeSec(),
      backfill: true,
      log: () => {},
    });
    expect(summary.status).toBe("ok");
    const rows = await db.select().from(series);
    const obs = await db.select().from(observations);
    const value = (id: string) =>
      obs.find((o) => o.seriesId === id && o.periodEnd === "2026-09-30")?.value;
    expect(value("sec_debt.CRWV.ddtl2_1_facility.recourse.carrying_amount")).toBe(2_494_000_000);
    expect(value("sec_debt.CRWV.oem_financing_arrangements.recourse.carrying_amount")).toBe(
      6_891_000_000,
    );
    expect(value("sec_debt.CRWV.oem_financing_arrangements.nonrecourse.carrying_amount")).toBe(
      770_000_000,
    );
    expect(value("sec_debt.CRWV.a20319_75_senior_notes.stated_rate")).toBe(9.75);
    expect(
      value("sec_debt.CRWV.ddtl4_0_facility.secured_overnight_financing_rate_sofr.stated_rate"),
    ).toBe(2.25);
    const def = rows.find(
      (r) => r.id === "sec_debt.CRWV.ddtl2_1_facility.recourse.carrying_amount",
    );
    expect(def).toMatchObject({
      label: "DDTL 2.1 Facility (Recourse) — carrying amount",
      entity: "CRWV",
      indicator: "credit",
      collector: "sec_debt",
      unit: "USD",
    });
    expect(obs.every((o) => o.kind === "reported")).toBe(true);
    // The same instrument and metric never gets two series.
    expect(rows.filter((r) => r.id.includes("ddtl2_1_facility.")).map((r) => r.id)).toEqual(
      expect.arrayContaining(["sec_debt.CRWV.ddtl2_1_facility.recourse.carrying_amount"]),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("reads only the latest five filings on a routine run", async () => {
    const requested: string[] = [];
    const db = await memoryDb();
    await runCollector(db, secDebtCollector, { fetch: fakeSec(requested), log: () => {} });
    expect(requested.some((u) => u.includes("000176962826000465"))).toBe(true);
    expect(requested.some((u) => u.includes("000176962825000050"))).toBe(true);
    expect(requested.some((u) => u.includes("000176962825000010"))).toBe(false);
    expect(requested.some((u) => u.endsWith("CIK0002130357.json"))).toBe(true);
    expect(requested.some((u) => u.includes("000162828026074944"))).toBe(false);
  });

  it("fails a company whose filing has no instance document, without guessing a URL", async () => {
    const requested: string[] = [];
    const base = fakeSec(requested);
    const db = await memoryDb();
    const summary = await runCollector(db, secDebtCollector, {
      fetch: async (url: string) => {
        if (url.includes("/000176962826000465/index.json")) {
          return new Response(
            JSON.stringify({ directory: { item: [{ name: "crwv-20260930.xsd" }] } }),
          );
        }
        return base(url);
      },
      log: () => {},
    });
    // CRWV is the only company the fixture serves, so nothing was collected.
    expect(summary.status).toBe("failed");
    expect(summary.error?.message).toMatch(/no XBRL instance document/);
    expect(requested.some((u) => u.endsWith("crwv-20260930_htm.xml"))).toBe(false);
    expect(await db.select().from(series)).toEqual([]);
  });
});
