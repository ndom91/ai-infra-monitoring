import { describe, expect, it } from "vitest";
import { SEC_FILING_COMPANIES } from "~/domain/companies";
import { observations } from "~/storage/schema";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import {
  type Form4Filing,
  makeSecInsiderCollector,
  monthlySales,
  parseForm4,
  rawXmlName,
  routineWindowStart,
} from ".";

const row = (
  code: string,
  ad: string,
  shares: number,
  price: string | null,
  date = "2026-11-04",
) => `
  <nonDerivativeTransaction>
    <securityTitle><value>Common</value></securityTitle>
    <transactionDate><value>${date}</value></transactionDate>
    <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>${code}</transactionCode></transactionCoding>
    <transactionAmounts>
      <transactionShares><value>${shares}</value></transactionShares>
      <transactionPricePerShare>${price === null ? '<footnoteId id="F1"/>' : `<value>${price}</value>`}</transactionPricePerShare>
      <transactionAcquiredDisposedCode><value>${ad}</value></transactionAcquiredDisposedCode>
    </transactionAmounts>
    <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
  </nonDerivativeTransaction>`;

const doc = (rows: string[], flag?: "0" | "1", type = "4") => `<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0609</schemaVersion>
  <documentType>${type}</documentType>
  <reportingOwner><reportingOwnerId><rptOwnerCik>0001234567</rptOwnerCik></reportingOwnerId></reportingOwner>
  ${flag === undefined ? "" : `<aff10b5One>${flag}</aff10b5One>`}
  <nonDerivativeTable>${rows.join("")}</nonDerivativeTable>
  <derivativeTable>${row("S", "D", 999, "1").replaceAll("nonDerivativeTransaction", "derivativeTransaction")}</derivativeTable>
</ownershipDocument>`;

const mixed = doc([row("S", "D", 100, "50.5"), row("A", "A", 1000, "0"), row("S", "D", 200, null)]);

describe("parseForm4", () => {
  it("counts only priced open-market sales", () => {
    const parsed = parseForm4(mixed);
    expect(parsed.sales).toHaveLength(1);
    expect(parsed.sales[0]).toMatchObject({
      shares: 100,
      price: 50.5,
      transactionDate: "2026-11-04",
    });
    expect(parsed.skippedNoPrice).toBe(1);
    expect(parsed.tenB5One).toBeUndefined();
  });

  it("reads the 10b5-1 flag and ignores the derivative table", () => {
    expect(parseForm4(doc([row("S", "D", 1, "2")], "1")).tenB5One).toBe(true);
    expect(parseForm4(doc([row("S", "D", 1, "2")], "0")).tenB5One).toBe(false);
    expect(parseForm4(doc([row("S", "D", 1, "2")], "0")).sales).toHaveLength(1);
  });

  it("rejects non-XML bodies", () => {
    expect(() => parseForm4("<html>blocked</html>")).toThrow();
  });
});

describe("rawXmlName", () => {
  it("strips the XSL rendering directory", () => {
    expect(rawXmlName("xslF345X06/wk-form4_1793999520.xml")).toBe("wk-form4_1793999520.xml");
    expect(rawXmlName("form4.xml")).toBe("form4.xml");
    expect(rawXmlName("ownership.htm")).toBeUndefined();
    expect(rawXmlName(undefined)).toBeUndefined();
  });
});

const filing = (accession: string, filedAt: string, xml: string, form = "4"): Form4Filing => ({
  accession,
  form,
  filedAt,
  parsed: parseForm4(xml),
});

describe("monthlySales", () => {
  it("aggregates by transaction month and splits 10b5-1 sales", () => {
    const months = monthlySales([
      filing("a", "2026-11-06", doc([row("S", "D", 100, "10")], "1")),
      filing("b", "2026-11-09", doc([row("S", "D", 50, "20")], "0")),
      filing("c", "2026-11-02", doc([row("S", "D", 10, "10", "2026-10-30")], "0")),
    ]);
    expect(months).toEqual([
      expect.objectContaining({ month: "2026-10", totalUsd: 100, tenB5OneUsd: 0, filings: 1 }),
      expect.objectContaining({
        month: "2026-11",
        totalUsd: 2000,
        tenB5OneUsd: 1000,
        tenB5OneKnown: true,
        filings: 2,
        transactions: 2,
        asOf: "2026-11-09",
      }),
    ]);
  });

  it("marks the plan split unknown when a filing lacks the flag", () => {
    const [month] = monthlySales([filing("a", "2026-11-06", doc([row("S", "D", 1, "10")]))]);
    expect(month?.tenB5OneKnown).toBe(false);
  });

  it("does not double count rows repeated by an amendment", () => {
    const original = doc([row("S", "D", 100, "10"), row("S", "D", 100, "10")]);
    const amended = doc(
      [row("S", "D", 100, "10"), row("S", "D", 100, "10"), row("S", "D", 5, "10")],
      "0",
      "4/A",
    );
    const [month] = monthlySales([
      filing("amend", "2026-11-12", amended, "4/A"),
      filing("orig", "2026-11-06", original),
    ]);
    expect(month).toMatchObject({ totalUsd: 2050, transactions: 3, filings: 2 });
  });

  it("drops months before the first whole month", () => {
    const months = monthlySales(
      [filing("a", "2026-11-02", doc([row("S", "D", 10, "10", "2026-10-30")]))],
      "2026-11",
    );
    expect(months).toEqual([]);
  });
});

describe("routineWindowStart", () => {
  it("starts at the first day of the month 120 days back", () => {
    expect(routineWindowStart(new Date("2026-11-23T00:00:00Z"))).toBe("2026-07-01");
  });
});

describe("sec insider collector", () => {
  it("writes calculated monthly series from filings", async () => {
    const db = await memoryDb();
    const submissions = (cik: number) =>
      JSON.stringify({
        filings: {
          recent: {
            accessionNumber: ["0000000001-26-000001", "0000000001-26-000002"],
            filingDate: ["2026-11-06", "2026-11-05"],
            form: ["4", "8-K"],
            primaryDocument: ["xslF345X06/wk-form4_1.xml", "x.htm"],
          },
        },
        cik,
      });
    const routes: Record<string, string> = {
      "wk-form4_1.xml": mixed.replace("<ownershipDocument>", "<ownershipDocument>"),
    };
    for (const { cik } of SEC_FILING_COMPANIES) {
      routes[`CIK${String(cik).padStart(10, "0")}`] = submissions(cik);
    }
    const result = await runCollector(db, makeSecInsiderCollector(0), {
      fetch: fakeFetch(routes),
      log: () => {},
      now: new Date("2026-11-23T00:00:00Z"),
    });
    expect(result.status).toBe("ok");
    const rows = await db.select().from(observations);
    const nvda = rows.filter((r) => r.seriesId === "insider.NVDA.open_market_sales_usd");
    expect(nvda).toHaveLength(1);
    expect(nvda[0]).toMatchObject({
      value: 5050,
      kind: "calculated",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    expect(rows.some((r) => r.seriesId.endsWith("_10b5_1_usd"))).toBe(false);
  });
});
