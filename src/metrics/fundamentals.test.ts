import { describe, expect, it } from "vitest";
import {
  capexToOcf,
  debtToOcf,
  fcfAfterCapex,
  growthYoY,
  interestCoverage,
  type QuarterPoint,
  rpoConversion,
  ttm,
} from "./fundamentals";

const CAL_ENDS = [
  "2024-03-31",
  "2024-06-30",
  "2024-09-30",
  "2024-12-31",
  "2025-03-31",
  "2025-06-30",
  "2025-09-30",
  "2025-12-31",
];

function series(values: number[], ends = CAL_ENDS): QuarterPoint[] {
  return values.map((value, i) => ({ periodEnd: ends[i] as string, value }));
}

describe("ttm", () => {
  it("sums four consecutive quarters", () => {
    expect(ttm(series([1, 2, 3, 4, 5, 6]))).toEqual([
      { periodEnd: "2024-12-31", value: 10 },
      { periodEnd: "2025-03-31", value: 14 },
      { periodEnd: "2025-06-30", value: 18 },
    ]);
  });

  it("sorts input before summing", () => {
    const pts = series([1, 2, 3, 4]).reverse();
    expect(ttm(pts)).toEqual([{ periodEnd: "2024-12-31", value: 10 }]);
  });

  it("returns nothing across a missing quarter instead of interpolating", () => {
    const pts = series([1, 2, 3, 4, 5, 6, 7, 8]).filter((p) => p.periodEnd !== "2025-03-31");
    // Every window after 2024-12-31 spans the missing 2025-03-31 quarter.
    expect(ttm(pts)).toEqual([{ periodEnd: "2024-12-31", value: 10 }]);
  });

  it("handles non-calendar fiscal quarters (Oracle, May year-end)", () => {
    const ends = ["2025-05-31", "2025-08-31", "2025-11-30", "2026-02-28"];
    expect(ttm(series([1, 1, 1, 1], ends))).toEqual([{ periodEnd: "2026-02-28", value: 4 }]);
  });

  it("needs at least four points", () => {
    expect(ttm(series([1, 2, 3]))).toEqual([]);
    expect(ttm([])).toEqual([]);
  });
});

describe("capexToOcf", () => {
  it("aligns by periodEnd and skips non-positive OCF", () => {
    const capex = series([50, 60, 70]);
    const ocf = [
      { periodEnd: "2024-03-31", value: 100 },
      { periodEnd: "2024-06-30", value: -20 },
      { periodEnd: "2024-12-31", value: 140 },
    ];
    expect(capexToOcf(capex, ocf)).toEqual([{ periodEnd: "2024-03-31", value: 0.5 }]);
  });
});

describe("fcfAfterCapex", () => {
  it("subtracts capex from OCF and allows negative results", () => {
    expect(fcfAfterCapex(series([100, 50]), series([30, 80]))).toEqual([
      { periodEnd: "2024-03-31", value: 70 },
      { periodEnd: "2024-06-30", value: -30 },
    ]);
  });

  it("drops periods missing either input", () => {
    expect(fcfAfterCapex(series([100, 50]), series([30]))).toEqual([
      { periodEnd: "2024-03-31", value: 70 },
    ]);
  });
});

describe("interestCoverage", () => {
  it("adds interest back to OCF and divides by interest paid", () => {
    expect(interestCoverage(series([90, 10]), series([10, 0]))).toEqual([
      { periodEnd: "2024-03-31", value: 10 },
    ]);
  });
});

describe("debtToOcf", () => {
  it("divides debt plus finance leases by TTM OCF", () => {
    const ocf = series([25, 25, 25, 25, 30]);
    const debt = series([0, 0, 0, 800, 900]);
    const leases = series([0, 0, 0, 200, 260]);
    expect(debtToOcf(debt, leases, ocf)).toEqual([
      { periodEnd: "2024-12-31", value: 10 },
      { periodEnd: "2025-03-31", value: 1160 / 105 },
    ]);
  });

  it("requires the finance lease balance and positive TTM OCF", () => {
    const ocf = series([-25, -25, -25, -25, 100, 100, 100, 100]);
    const debt = series([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(debtToOcf(debt, [], ocf)).toEqual([]);
    expect(
      debtToOcf(debt, series([0, 0, 0, 0, 0, 0, 0, 0]), ocf).map((p) => p.periodEnd),
      // TTM OCF at 2024-12-31 is -100 and is skipped; from 2025-03-31 it
      // turns positive (-75 + 100 = 25).
    ).toEqual(["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"]);
  });
});

describe("rpoConversion", () => {
  it("divides TTM revenue by RPO from one year earlier", () => {
    const revenue = series([10, 10, 10, 10, 20, 20, 20, 20]);
    const rpo = series([100, 100, 100, 200, 300]);
    expect(rpoConversion(revenue, rpo)).toEqual([
      // 2024-12-31 has no RPO a year earlier.
      // TTM 2025-03-31 = 10*3 + 20 = 50; RPO 2024-03-31 = 100.
      { periodEnd: "2025-03-31", value: 0.5 },
      { periodEnd: "2025-06-30", value: 0.6 },
      { periodEnd: "2025-09-30", value: 0.7 },
      { periodEnd: "2025-12-31", value: 80 / 200 },
    ]);
  });

  it("skips periods without a prior-year RPO", () => {
    const revenue = series([10, 10, 10, 10, 10]);
    // 2024-12-31 has no RPO a year earlier; 2025-03-31 maps to an RPO of 0.
    expect(rpoConversion(revenue, series([0, 5]))).toEqual([]);
  });
});

describe("growthYoY", () => {
  it("compares with the same quarter a year earlier", () => {
    const out = growthYoY(series([100, 100, 100, 100, 125, 50]));
    expect(out).toEqual([
      { periodEnd: "2025-03-31", value: 0.25 },
      { periodEnd: "2025-06-30", value: -0.5 },
    ]);
  });

  it("tolerates 52/53-week years and skips non-positive bases", () => {
    const pts = [
      { periodEnd: "2023-12-30", value: 0 },
      { periodEnd: "2024-12-28", value: 100 },
      // 53-week year: 371 days after the prior year-end.
      { periodEnd: "2026-01-03", value: 150 },
    ];
    expect(growthYoY(pts)).toEqual([{ periodEnd: "2026-01-03", value: 0.5 }]);
  });
});
