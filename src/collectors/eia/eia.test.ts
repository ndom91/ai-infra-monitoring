import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSalesRevenue } from ".";

describe("parseSalesRevenue", () => {
  it("keeps commercial sales and prices for selected states", () => {
    const workbook = XLSX.utils.book_new();
    const rows = Array.from({ length: 4 }, () => [] as unknown[]);
    rows.push([2026, 7, "VA", "Preliminary", 0, 0, 0, 0, 100, 200, 0, 12.5]);
    rows.push([2026, 7, "NY", "Preliminary", 0, 0, 0, 0, 100, 200, 0, 12.5]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Monthly-States");

    const output = parseSalesRevenue(workbook);

    expect(output.observations).toContainEqual(
      expect.objectContaining({
        seriesId: "eia.commercial_sales.VA",
        periodEnd: "2026-07-31",
        value: 200,
      }),
    );
    expect(output.observations).toContainEqual(
      expect.objectContaining({ seriesId: "eia.commercial_price.VA", value: 12.5 }),
    );
    expect(output.observations).toHaveLength(2);
  });
});
