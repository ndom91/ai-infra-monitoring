import { describe, expect, it } from "vitest";
import {
  debtToOcf,
  growthYoY,
  memoizedTtm,
  type QuarterPoint,
  rpoConversion,
  ttm,
} from "./fundamentals";

// Inputs that are easy to get wrong when the helpers are optimised: unsorted
// input, duplicate period ends, gaps, fiscal quarters that do not end on
// calendar quarter ends, and the edges of the quarter and year gap bands.
// The expected values were produced by the implementation before it was
// rewritten for speed.
const p = (periodEnd: string, value: number): QuarterPoint => ({ periodEnd, value });

describe("derived metrics on tricky inputs", () => {
  it("ttm unsorted with a duplicate period end", () => {
    expect(
      ttm([
        p("2025-03-31", 5),
        p("2024-06-30", 2),
        p("2024-03-31", 1),
        p("2024-09-30", 3),
        p("2024-12-31", 4),
        p("2024-12-31", 40),
        p("2025-06-30", 6),
      ]),
    ).toEqual([{ periodEnd: "2024-12-31", value: 10 }]);
  });

  it("ttm across a gap then recovery", () => {
    expect(
      ttm([
        p("2023-03-31", 1),
        p("2023-06-30", 1),
        p("2023-09-30", 1),
        p("2023-12-31", 1),
        p("2024-06-30", 1),
        p("2024-09-30", 1),
        p("2024-12-31", 1),
        p("2025-03-31", 1),
        p("2025-06-30", 1),
      ]),
    ).toEqual([
      { periodEnd: "2023-12-31", value: 4 },
      { periodEnd: "2025-03-31", value: 4 },
      { periodEnd: "2025-06-30", value: 4 },
    ]);
  });

  it("ttm on 52/53-week fiscal quarters", () => {
    expect(
      ttm([
        p("2024-06-29", 1),
        p("2024-09-28", 2),
        p("2024-12-28", 3),
        p("2025-03-29", 4),
        p("2025-06-28", 5),
        p("2025-09-27", 6),
      ]),
    ).toEqual([
      { periodEnd: "2025-03-29", value: 10 },
      { periodEnd: "2025-06-28", value: 14 },
      { periodEnd: "2025-09-27", value: 18 },
    ]);
  });

  it("ttm quarter gap bounds", () => {
    expect(
      ttm([
        p("2024-01-01", 1),
        p("2024-03-21", 1),
        p("2024-06-29", 1),
        p("2024-10-07", 1),
        p("2025-01-15", 1),
      ]),
    ).toEqual([
      { periodEnd: "2024-10-07", value: 4 },
      { periodEnd: "2025-01-15", value: 4 },
    ]);
  });

  it("growthYoY fiscal ends that do not sit on calendar quarter ends", () => {
    expect(
      growthYoY([
        p("2024-05-31", 100),
        p("2024-08-31", 110),
        p("2024-11-30", 120),
        p("2025-02-28", 130),
        p("2025-05-31", 150),
        p("2025-08-31", 99),
        p("2025-11-30", 0),
        p("2026-02-28", 180),
      ]),
    ).toEqual([
      { periodEnd: "2025-05-31", value: 0.5 },
      { periodEnd: "2025-08-31", value: -0.09999999999999998 },
      { periodEnd: "2025-11-30", value: -1 },
      { periodEnd: "2026-02-28", value: 0.3846153846153846 },
    ]);
  });

  it("growthYoY year bounds and a non-positive prior", () => {
    expect(
      growthYoY([
        p("2023-01-01", 10),
        p("2023-12-26", 20),
        p("2024-01-01", 30),
        p("2024-01-10", 0),
        p("2025-01-01", 40),
        p("2025-01-10", 50),
      ]),
    ).toEqual([
      { periodEnd: "2023-12-26", value: 1 },
      { periodEnd: "2024-01-01", value: 2 },
      { periodEnd: "2024-01-10", value: -1 },
    ]);
  });

  it("growthYoY picks the latest point in the one-year band", () => {
    expect(growthYoY([p("2023-12-01", 10), p("2023-12-20", 20), p("2025-01-01", 40)])).toEqual([
      { periodEnd: "2025-01-01", value: 1 },
    ]);
  });

  it("growthYoY unsorted with duplicates", () => {
    expect(
      growthYoY([
        p("2025-03-31", 150),
        p("2024-03-31", 100),
        p("2024-03-31", 125),
        p("2024-06-30", 80),
        p("2025-06-30", 120),
      ]),
    ).toEqual([
      { periodEnd: "2025-03-31", value: 0.19999999999999996 },
      { periodEnd: "2025-06-30", value: 0.5 },
    ]);
  });

  it("rpoConversion unsorted RPO, fiscal quarters", () => {
    expect(
      rpoConversion(
        [
          p("2024-05-31", 10),
          p("2024-08-31", 10),
          p("2024-11-30", 10),
          p("2025-02-28", 10),
          p("2025-05-31", 20),
          p("2025-08-31", 20),
        ],
        [p("2025-02-28", 400), p("2024-05-31", 200), p("2024-08-31", 0), p("2024-11-30", 300)],
      ),
    ).toEqual([{ periodEnd: "2025-05-31", value: 0.25 }]);
  });

  it("debtToOcf with a duplicate and a gap in OCF", () => {
    expect(
      debtToOcf(
        [p("2024-12-31", 100), p("2025-03-31", 100), p("2025-06-30", 100)],
        [p("2024-12-31", 20), p("2025-03-31", 20), p("2025-06-30", 20)],
        [
          p("2024-03-31", 5),
          p("2024-06-30", 5),
          p("2024-09-30", 5),
          p("2024-12-31", 5),
          p("2024-12-31", 50),
          p("2025-03-31", 5),
          p("2025-06-30", 5),
        ],
      ),
    ).toEqual([{ periodEnd: "2024-12-31", value: 6 }]);
  });

  it("shares one trailing sum per input within a derivation", () => {
    const quarters = [
      p("2024-03-31", 1),
      p("2024-06-30", 2),
      p("2024-09-30", 3),
      p("2024-12-31", 4),
    ];
    const memo = memoizedTtm();
    expect(memo(quarters)).toBe(memo(quarters));
    expect(memo(quarters)).toEqual(ttm(quarters));
    expect(memo([...quarters])).not.toBe(memo(quarters));
  });

  it("does not modify its input", () => {
    const unsorted = [
      p("2025-03-31", 5),
      p("2024-12-31", 4),
      p("2024-09-30", 3),
      p("2024-06-30", 2),
      p("2024-03-31", 1),
    ];
    const copy = structuredClone(unsorted);
    ttm(unsorted);
    growthYoY(unsorted);
    expect(unsorted).toEqual(copy);
  });
});
