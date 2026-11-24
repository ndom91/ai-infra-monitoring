import { describe, expect, it } from "vitest";
import { chartSubtitle, chartTitle, titleRank } from "./infraTitles";

const eia = (measure: string, state: string, label: string) => ({
  id: `eia.${measure}.${state}`,
  label: `${state} ${label}`,
});

describe("chartTitle", () => {
  it("names the two Census variants by what they measure", () => {
    const label = "US private data center construction spending (SAAR)";
    expect(chartTitle({ id: "census.c30.data_center.saar", label })).toBe(
      "Construction spending, annual rate",
    );
    expect(chartTitle({ id: "census.c30.data_center.nsa", label })).toBe(
      "Construction spending, monthly",
    );
  });

  it("drops the state from an EIA label, whichever state it is", () => {
    expect(chartTitle(eia("commercial_price", "VA", "Commercial electricity price"))).toBe(
      "Commercial electricity price",
    );
    expect(chartTitle(eia("commercial_sales", "NJ", "Commercial electricity sales"))).toBe(
      "Commercial electricity sales",
    );
  });

  it("titles broker series by metric", () => {
    expect(chartTitle({ id: "cbre.na_primary.vacancy", label: "x" })).toBe("Vacancy");
  });

  it("falls back to the label for an unknown series", () => {
    expect(chartTitle({ id: "other.thing.metric", label: "Some label" })).toBe("Some label");
  });
});

describe("titleRank", () => {
  it("ranks known metrics before unknown ones", () => {
    expect(titleRank({ id: "cbre.na_primary.vacancy", label: "" })).toBeLessThan(
      titleRank({ id: "eia.commercial_price.VA", label: "" }),
    );
  });
});

describe("chartSubtitle", () => {
  const base = { cadence: "monthly", label: "" };
  it("says Census figures show with either publisher", () => {
    const text = chartSubtitle({
      ...base,
      id: "census.c30.data_center.nsa",
      source: "U.S. Census Bureau, Construction Spending (C30)",
      entity: "United States",
      unit: "USD",
    });
    expect(text).toContain("US Census Bureau");
    expect(text).toContain("either publisher");
  });

  it("puts EIA publisher, scope and unit in the subtitle", () => {
    expect(
      chartSubtitle({
        ...base,
        id: "eia.commercial_price.VA",
        source: "U.S. Energy Information Administration",
        entity: "Selected US data-center-market states",
        unit: "cents/kWh",
      }),
    ).toBe(
      "U.S. Energy Information Administration · Selected US data-center-market states · cents/kWh",
    );
  });

  it("keeps entity and unit for other series", () => {
    expect(
      chartSubtitle({
        ...base,
        id: "cbre.na_primary.vacancy",
        source: "CBRE",
        entity: "North America primary markets",
        unit: "%",
      }),
    ).toBe("North America primary markets · %");
  });
});
