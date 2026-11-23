import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fixture from "../../../test/fixtures/census/c30-data-center-2026-11-02.json";
import { NSA, parseDataCenter, SAAR } from ".";

const URL = "https://www.census.gov/construction/c30/xlsx/privsatime.xlsx";
const saar = SAAR;
const nsa = NSA;

type Rows = unknown[][];

function workbook(rows: Rows, sheet: string) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return wb;
}

const saarRows = () => structuredClone(fixture.saar.rows) as Rows;

describe("parseDataCenter", () => {
  it("finds the Data center column by header, in dollars", () => {
    const out = parseDataCenter(workbook(saarRows(), "Private SA"), saar, URL);
    const latest = out.find((o) => o.periodEnd === "2026-09-30");
    expect(latest).toMatchObject({
      seriesId: "census.c30.data_center.saar",
      periodStart: "2026-09-01",
      value: 96_462_000_000,
      kind: "reported",
    });
    expect(out.find((o) => o.periodEnd === "2026-08-31")?.value).toBe(88_815_000_000);
  });

  it("reads the NSA sheet", () => {
    const out = parseDataCenter(workbook(fixture.nsa.rows as Rows, "Private NSA"), nsa, URL);
    expect(out.find((o) => o.periodEnd === "2026-09-30")?.value).toBe(8_517_000_000);
  });

  it("matches the header after line breaks and footnote digits", () => {
    const rows = saarRows();
    rows[3] = ["Date", "Office", "General", "Data\r\n center2", "Financial"];
    const out = parseDataCenter(workbook(rows, "Private SA"), saar, URL);
    expect(out[0]?.value).toBe(96_462_000_000);
  });

  it("records preliminary, revised and final status in notes", () => {
    const out = parseDataCenter(workbook(saarRows(), "Private SA"), saar, URL);
    const note = (end: string) => out.find((o) => o.periodEnd === end)?.note;
    expect(note("2026-09-30")).toContain("preliminary");
    expect(note("2026-08-31")).toContain("revised");
    expect(note("2026-06-30")).toContain("final");
  });

  it("sets asOf from the release date only on flagged rows", () => {
    const out = parseDataCenter(workbook(saarRows(), "Private SA"), saar, URL);
    const asOf = (end: string) => out.find((o) => o.periodEnd === end)?.asOf;
    expect(asOf("2026-09-30")).toBe("2026-11-02");
    expect(asOf("2026-07-31")).toBe("2026-11-02");
    expect(asOf("2026-06-30")).toBeUndefined();
  });

  it("leaves asOf unset when the file states no release date", () => {
    const rows = saarRows().filter((r) => !String(r[0] ?? "").startsWith("Source:"));
    const out = parseDataCenter(workbook(rows, "Private SA"), saar, URL);
    expect(out.every((o) => o.asOf === undefined)).toBe(true);
  });

  it("skips the empty pre-2014 cells", () => {
    const out = parseDataCenter(workbook(saarRows(), "Private SA"), saar, URL);
    expect(out.at(-1)?.periodStart).toBe("2014-01-01");
    expect(out.some((o) => o.periodEnd < "2014-01-01")).toBe(false);
    expect(out).toHaveLength(153);
  });

  it("throws a permanent error when the column is missing", () => {
    const rows = saarRows();
    rows[3] = ["Date", "Office", "General", "Hospital", "Financial"];
    expect(() => parseDataCenter(workbook(rows, "Private SA"), saar, URL)).toThrow(
      /"Data center" columns/,
    );
  });

  it("throws a permanent error when the Date header or sheet is missing", () => {
    const rows = saarRows();
    (rows[3] as unknown[])[0] = "Month";
    expect(() => parseDataCenter(workbook(rows, "Private SA"), saar, URL)).toThrow(/"Date" header/);
    expect(() => parseDataCenter(workbook(saarRows(), "Other"), saar, URL)).toThrow(
      /no "Private SA"/,
    );
  });

  it("throws on an unparseable date or non-numeric value", () => {
    const badDate = saarRows();
    (badDate[5] as unknown[])[0] = "Aug 2026";
    expect(() => parseDataCenter(workbook(badDate, "Private SA"), saar, URL)).toThrow(
      /not a month/,
    );
    const badValue = saarRows();
    (badValue[5] as unknown[])[3] = "(NA)";
    expect(() => parseDataCenter(workbook(badValue, "Private SA"), saar, URL)).toThrow(
      /not a number/,
    );
  });

  it("throws when months are not consecutive", () => {
    const rows = saarRows();
    rows.splice(5, 1);
    expect(() => parseDataCenter(workbook(rows, "Private SA"), saar, URL)).toThrow(/consecutive/);
  });
});
