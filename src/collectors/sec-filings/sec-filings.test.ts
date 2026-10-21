import { describe, expect, it } from "vitest";
import { filingEvents } from "~/storage/schema";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import { filingEventsFor, filingUrl, makeSecFilingsCollector, parseSubmissions } from ".";

const body = JSON.stringify({
  filings: {
    recent: {
      accessionNumber: ["0000789019-26-000001", "0000789019-26-000002"],
      filingDate: ["2026-10-20", "2026-10-01"],
      form: ["8-K", "4"],
      acceptanceDateTime: ["2026-10-20T12:30:00.000Z", "2026-10-01T12:30:00.000Z"],
      reportDate: ["2026-10-20", "2026-10-01"],
      items: ["2.02,9.01", ""],
      primaryDocument: ["earnings.htm", "xslF345X03/ownership.xml"],
      primaryDocDescription: ["Current report", "Statement of changes in beneficial ownership"],
    },
  },
});

describe("SEC filing events", () => {
  it("keeps relevant filings and links to their primary document", () => {
    const events = filingEventsFor(parseSubmissions(body), {
      ticker: "MSFT",
      name: "Microsoft",
      cik: 789019,
      group: "hyperscaler",
    });
    expect(events).toEqual([
      expect.objectContaining({
        accession: "0000789019-26-000001",
        form: "8-K",
        sourceUrl: filingUrl(789019, "0000789019-26-000001", "earnings.htm"),
      }),
    ]);
  });

  it("deduplicates filing events across collector runs", async () => {
    const db = await memoryDb();
    const collector = makeSecFilingsCollector(0);
    const routes = Object.fromEntries(
      [789019, 1652044, 1018724, 1326801, 1341439, 1769628, 1839341, 1878848, 1144879, 1513845].map(
        (cik) => {
          const padded = String(cik).padStart(10, "0");
          return [`CIK${padded}`, body.replaceAll("0000789019", padded)];
        },
      ),
    );
    const first = await runCollector(db, collector, { fetch: fakeFetch(routes), log: () => {} });
    const second = await runCollector(db, collector, { fetch: fakeFetch(routes), log: () => {} });
    const rows = await db.select().from(filingEvents);
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(rows).toHaveLength(10);
  });
});
