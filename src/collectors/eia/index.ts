import * as XLSX from "xlsx";
import { permanent } from "../errors";
import type { CollectOutput, Collector } from "../types";

export const EIA_SALES_REVENUE_URL =
  "https://www.eia.gov/electricity/data/eia861m/xls/sales_revenue.xlsx";

const STATES = new Map([
  ["VA", "Virginia"],
  ["TX", "Texas"],
  ["AZ", "Arizona"],
  ["IL", "Illinois"],
  ["GA", "Georgia"],
]);

type Row = [number, number, string, string, ...number[]];

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function parseSalesRevenue(workbook: XLSX.WorkBook, sourceUrl = EIA_SALES_REVENUE_URL) {
  const sheet = workbook.Sheets["Monthly-States"];
  if (!sheet) throw permanent("EIA workbook has no Monthly-States sheet");
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, range: 3, defval: null });
  const series = [
    {
      id: "eia.commercial_sales",
      label: "Commercial electricity sales",
      unit: "MWh",
      field: 9,
      definition: "Commercial electricity sales reported by EIA Form EIA-861M, in megawatt-hours.",
    },
    {
      id: "eia.commercial_price",
      label: "Commercial electricity price",
      unit: "cents/kWh",
      field: 11,
      definition:
        "Average commercial retail electricity price reported by EIA Form EIA-861M, in cents per kWh.",
    },
  ];
  const output: CollectOutput = { series: [], observations: [] };
  for (const metric of series) {
    for (const [state] of STATES) {
      output.series.push({
        id: `${metric.id}.${state}`,
        indicator: "power_grid",
        label: `${state} ${metric.label}`,
        entity: "Selected US data-center-market states",
        source: "U.S. Energy Information Administration",
        sourceUrl,
        unit: metric.unit,
        methodology: `${metric.definition} State-wide commercial data is power-system context, not data-center-specific demand.`,
        cadence: "monthly",
        collector: "eia",
      });
      for (const row of rows) {
        const [year, month, rowState] = row;
        const value = row[metric.field];
        if (
          rowState !== state ||
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          typeof value !== "number"
        )
          continue;
        output.observations.push({
          seriesId: `${metric.id}.${state}`,
          periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
          periodEnd: monthEnd(year, month),
          value,
          kind: "reported",
          sourceUrl,
        });
      }
    }
  }
  if (output.observations.length === 0)
    throw permanent("EIA workbook has no selected state observations");
  return output;
}

export const eiaCollector: Collector = {
  name: "eia",
  description:
    "EIA monthly commercial electricity sales and prices in major data-center-market states",
  async collect({ fetch, log }) {
    const response = await fetch(EIA_SALES_REVENUE_URL, { timeoutMs: 120_000 });
    const data = Buffer.from(await response.arrayBuffer());
    const output = parseSalesRevenue(XLSX.read(data, { type: "buffer" }));
    log(`${output.series.length} series, ${output.observations.length} observations`);
    return output;
  },
};
