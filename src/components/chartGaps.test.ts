import { describe, expect, it } from "vitest";
import { chartData } from "./chartGaps";

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
