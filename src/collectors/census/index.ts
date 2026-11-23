import * as XLSX from "xlsx";
import type { ObservationInput, SeriesDef } from "~/domain/types";
import { permanent } from "../errors";
import type { CollectOutput, Collector } from "../types";
import { isoDay, monthEnd, readWorkbook } from "../util";

const BASE_URL = "https://www.census.gov/construction/c30/xlsx";

export type Variant = {
  id: string;
  file: string;
  sheet: string;
  label: string;
  measure: string;
};

export const SAAR: Variant = {
  id: "census.c30.data_center.saar",
  file: "privsatime.xlsx",
  sheet: "Private SA",
  label: "US private data center construction spending (SAAR)",
  measure:
    "Seasonally adjusted annual rate: each month is the spending pace for that month scaled to a full year, so it is not the amount spent in the month.",
};

export const NSA: Variant = {
  id: "census.c30.data_center.nsa",
  file: "privtime.xlsx",
  sheet: "Private NSA",
  label: "US private data center construction spending (monthly, not seasonally adjusted)",
  measure: "Not seasonally adjusted: the amount put in place during the month itself.",
};

const VARIANTS = [SAAR, NSA];

const METHODOLOGY = `US Census Bureau Value of Construction Put in Place (survey C30), private construction, "Data center" category under Office. Census has published it separately since July 2024, with history from January 2014. Published in millions of dollars and converted here to dollars (x 1,000,000). It measures the value of construction work put in place only: land and equipment such as servers and GPUs are excluded. US only. Preliminary months (flag p) are routinely revised in later releases and revised months (flag r) can change again; each change is stored as a new vintage. The whole history is read on every run, so --backfill makes no difference.`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_CELL = /^([A-Z][a-z]{2})-(\d{2})([pr]?)$/;
const RELEASE_LINE = /Construction Spending,\s+([A-Z][a-z]+ \d{1,2}, \d{4})/;
const FLAG_NOTE = { p: "preliminary", r: "revised", "": "final (no revision flag)" } as const;

const clean = (cell: unknown) =>
  String(cell ?? "")
    .replace(/\s+/g, " ")
    .trim();

// Release date printed in the file's "Source: U.S. Census Bureau, Construction
// Spending, <date>." line. Undefined when absent, in which case asOf stays unset.
function releaseDate(rows: unknown[][]) {
  for (const row of rows) {
    const match = RELEASE_LINE.exec(clean(row[0]));
    const ms = match ? Date.parse(`${match[1]} UTC`) : Number.NaN;
    if (!Number.isNaN(ms)) return isoDay(new Date(ms));
  }
  return undefined;
}

export function parseDataCenter(
  workbook: XLSX.WorkBook,
  variant: Variant,
  sourceUrl: string,
): ObservationInput[] {
  const sheet = workbook.Sheets[variant.sheet];
  if (!sheet) throw permanent(`Census workbook has no "${variant.sheet}" sheet`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  const headerAt = rows.findIndex((row) => clean(row[0]) === "Date");
  if (headerAt < 0) throw permanent(`Census ${variant.sheet} sheet has no "Date" header row`);
  const columns = (rows[headerAt] ?? [])
    .map((cell, index) => ({ index, name: clean(cell) }))
    .filter((c) => /^data center/i.test(c.name));
  const found = columns[0];
  if (columns.length !== 1 || !found) {
    throw permanent(
      `Census ${variant.sheet} sheet has ${columns.length} "Data center" columns, expected 1`,
    );
  }
  const column = found.index;
  const asOf = releaseDate(rows);

  const observations: ObservationInput[] = [];
  let previous: number | undefined;
  // Data rows run newest first until the first blank date cell; notes follow.
  for (const row of rows.slice(headerAt + 1)) {
    const date = clean(row[0]);
    if (!date) break;
    const match = DATE_CELL.exec(date);
    const month = match ? MONTHS.indexOf(match[1] ?? "") + 1 : 0;
    const [, , yearText = "", flagText = ""] = match ?? [];
    if (!match || month === 0) throw permanent(`Census date "${date}" is not a month like Sep-26p`);
    // The series starts in 1993, so two-digit years of 90 and above are 19xx.
    const yy = Number(yearText);
    const year = yy >= 90 ? 1900 + yy : 2000 + yy;
    const monthIndex = year * 12 + month;
    if (previous !== undefined && monthIndex !== previous - 1) {
      throw permanent(`Census months are not consecutive at "${date}"`);
    }
    previous = monthIndex;

    const cell = row[column];
    if (clean(cell) === "") continue;
    if (typeof cell !== "number" || !Number.isFinite(cell)) {
      throw permanent(`Census ${variant.sheet} ${date}: "${clean(cell)}" is not a number`);
    }
    const flag = flagText as keyof typeof FLAG_NOTE;
    observations.push({
      seriesId: variant.id,
      periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
      periodEnd: monthEnd(year, month),
      value: cell * 1_000_000,
      kind: "reported",
      sourceUrl,
      note: `Census status: ${FLAG_NOTE[flag]}.`,
      // Only flagged rows are tied to the latest release; final values may be older.
      ...(flag && asOf ? { asOf } : {}),
    });
  }
  if (observations.length === 0) {
    throw permanent(`Census ${variant.sheet} sheet has no data center values`);
  }
  return observations;
}

function seriesDef(variant: Variant, sourceUrl: string): SeriesDef {
  return {
    id: variant.id,
    indicator: "construction",
    label: variant.label,
    entity: "United States",
    source: "U.S. Census Bureau, Construction Spending (C30)",
    sourceUrl,
    unit: "USD",
    currency: "USD",
    methodology: `${METHODOLOGY} ${variant.measure}`,
    cadence: "monthly",
    collector: "census",
  };
}

export const censusCollector: Collector = {
  name: "census",
  description: "US Census Bureau private data center construction spending (C30)",
  async collect({ fetch, log }) {
    const output: CollectOutput = { series: [], observations: [] };
    for (const variant of VARIANTS) {
      const url = `${BASE_URL}/${variant.file}`;
      const response = await fetch(url, { timeoutMs: 60_000 });
      const observations = parseDataCenter(await readWorkbook(response), variant, url);
      output.series.push(seriesDef(variant, url));
      output.observations.push(...observations);
      log(`${variant.id}: ${observations.length} observations`);
    }
    return output;
  },
};
