import { describe, expect, it } from "vitest";
import { chartData, flagStepChanges, wrapText } from "./chartGaps";

const p = (periodEnd: string, value = 1) => ({ periodEnd, value });
const breaks = (data: { y: number | null }[]) => data.filter((d) => d.y === null).length;

describe("chartData", () => {
  it("breaks a quarterly line once where a year is missing", () => {
    const data = chartData(
      [p("2023-03-31"), p("2023-06-30"), p("2024-09-30"), p("2024-12-31")],
      "quarterly",
    );
    expect(data).toHaveLength(5);
    expect(breaks(data)).toBe(1);
    const hole = data[2];
    expect(hole?.y).toBeNull();
    expect(hole?.x).toBeGreaterThan(Date.parse("2023-06-30"));
    expect(hole?.x).toBeLessThan(Date.parse("2024-09-30"));
  });

  it("leaves a complete quarterly series whole", () => {
    const data = chartData(
      [p("2023-03-31"), p("2023-06-30"), p("2023-09-30"), p("2023-12-31")],
      "quarterly",
    );
    expect(data).toHaveLength(4);
    expect(breaks(data)).toBe(0);
  });

  it("does not break fiscal quarters about 98 days apart", () => {
    expect(
      breaks(chartData([p("2024-01-27"), p("2024-05-04"), p("2024-08-10")], "quarterly")),
    ).toBe(0);
  });

  it("never breaks irregular or unknown cadences", () => {
    const sparse = [p("2020-01-01"), p("2024-01-01")];
    expect(breaks(chartData(sparse, "irregular"))).toBe(0);
    expect(breaks(chartData(sparse))).toBe(0);
  });

  it("applies the limit for the given cadence", () => {
    const sparse = [p("2024-01-01"), p("2024-03-01")];
    expect(breaks(chartData(sparse, "monthly"))).toBe(0);
    expect(breaks(chartData(sparse, "weekly"))).toBe(1);
  });

  it("carries kind and a mapped value on each item", () => {
    const [a] = chartData(
      [{ ...p("2024-01-01", 5), kind: "estimated" }],
      "monthly",
      (q) => q.value * 2,
    );
    expect(a).toEqual({ x: Date.parse("2024-01-01"), y: 10, kind: "estimated" });
  });
});

describe("flagStepChanges", () => {
  const flags = (ys: (number | null)[]) =>
    flagStepChanges(ys.map((y, x) => ({ x, y }))).map((d) => d.marker === true);

  it("marks the first point, each change and the last point only", () => {
    expect(flags([5, 5, 5, 6, 6, 6, 6])).toEqual([true, false, false, true, false, false, true]);
  });

  it("marks nothing between identical values", () => {
    expect(flags([2, 2, 2, 2])).toEqual([true, false, false, true]);
  });

  it("marks a single point once", () => {
    expect(flags([3])).toEqual([true]);
  });

  it("marks the start of a run after a break, not the break", () => {
    expect(flags([1, 1, null, 1, 1])).toEqual([true, false, false, true, true]);
  });

  it("keeps each point's kind", () => {
    const out = flagStepChanges([{ x: 0, y: 1, kind: "calculated" }]);
    expect(out[0]).toEqual({ x: 0, y: 1, kind: "calculated", marker: true });
  });
});

describe("wrapText", () => {
  it("splits long text into short lines without breaking words", () => {
    const lines = wrapText(
      "CBRE North America primary-market share of under-construction capacity preleased: 78.9%",
      30,
    );
    expect(lines.every((l) => l.length <= 30 || !l.includes(" "))).toBe(true);
    expect(lines.join(" ")).toBe(
      "CBRE North America primary-market share of under-construction capacity preleased: 78.9%",
    );
  });
});
