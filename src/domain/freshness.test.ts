import { describe, expect, it } from "vitest";
import { freshness } from "./freshness";

const now = new Date("2026-10-17T12:00:00Z");

describe("freshness", () => {
  it("is current within the cadence window", () => {
    expect(freshness({ cadence: "weekdays", latestPeriodEnd: "2026-10-15", now })).toBe("current");
    expect(freshness({ cadence: "quarterly", latestPeriodEnd: "2026-06-30", now })).toBe("current");
  });

  it("is stale once the window passes", () => {
    expect(freshness({ cadence: "weekdays", latestPeriodEnd: "2026-10-01", now })).toBe("stale");
    expect(freshness({ cadence: "quarterly", latestPeriodEnd: "2026-03-31", now })).toBe("stale");
  });

  it("is unavailable when old data meets a failing collector", () => {
    expect(
      freshness({
        cadence: "daily",
        latestPeriodEnd: "2026-10-01",
        lastRunStatus: "failed",
        now,
      }),
    ).toBe("unavailable");
    expect(freshness({ cadence: "daily", lastRunStatus: "failed", now })).toBe("unavailable");
  });

  it("handles empty and irregular series", () => {
    expect(freshness({ cadence: "daily", now })).toBe("awaiting");
    expect(freshness({ cadence: "irregular", latestPeriodEnd: "2024-01-01", now })).toBe(
      "historical-only",
    );
  });
});
