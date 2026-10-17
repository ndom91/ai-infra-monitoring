import { describe, expect, it } from "vitest";
import { changeFromPrior, changeOver, resampleAt, valueAtOrBefore } from "./changes";

const daily = [
  { periodEnd: "2026-01-01", value: 3 },
  { periodEnd: "2026-04-01", value: 4 },
  { periodEnd: "2026-06-30", value: 3.5 },
  { periodEnd: "2026-07-01", value: 5 },
];

describe("changes", () => {
  it("finds the latest point on or before a date", () => {
    expect(valueAtOrBefore(daily, "2026-05-01")?.value).toBe(4);
    expect(valueAtOrBefore(daily, "2025-12-31")).toBeUndefined();
  });

  it("computes change over a window", () => {
    const c = changeOver(daily, 91);
    expect(c?.from.periodEnd).toBe("2026-04-01");
    expect(c?.delta).toBe(1);
    expect(c?.pct).toBeCloseTo(0.25);
  });

  it("refuses comparisons across gaps", () => {
    const gappy = [
      { periodEnd: "2025-01-01", value: 1 },
      { periodEnd: "2026-07-01", value: 2 },
    ];
    expect(changeOver(gappy, 91)).toBeNull();
  });

  it("compares with the prior reporting period", () => {
    expect(changeFromPrior(daily)?.delta).toBe(1.5);
    expect(changeFromPrior(daily.slice(0, 1))).toBeNull();
  });
});

describe("resampleAt", () => {
  it("takes the last value on or before each date and skips gaps", () => {
    const pts = [
      { periodEnd: "2026-03-30", value: 1 },
      { periodEnd: "2026-03-31", value: 2 },
      { periodEnd: "2026-05-01", value: 3 },
    ];
    expect(resampleAt(pts, ["2026-03-31", "2026-06-30", "2025-12-31"])).toEqual([
      { periodEnd: "2026-03-31", value: 2 },
    ]);
  });
});
