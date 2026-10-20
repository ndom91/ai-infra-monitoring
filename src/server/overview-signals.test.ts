import { describe, expect, it } from "vitest";
import { groupAlertSignals, riskReadFromAlerts } from "./overview-signals";

const warning = {
  ruleId: "gpu-price-fall",
  seriesId: "aws.h100",
  triggeredAt: "2026-10-06",
  severity: "warning" as const,
  message: "GPU price fell.",
};

describe("overview signals", () => {
  it("groups repeated rule and series events, retaining the newest wording", () => {
    const signals = groupAlertSignals([
      warning,
      { ...warning, triggeredAt: "2026-09-30", message: "Earlier GPU price fall." },
    ]);
    expect(signals).toEqual([{ ...warning, firstTriggeredAt: "2026-09-30", occurrences: 2 }]);
  });

  it("describes recent warning history without treating past events as resolved state", () => {
    const read = riskReadFromAlerts([
      warning,
      {
        ...warning,
        ruleId: "stress-breadth",
        seriesId: null,
        severity: "critical",
        triggeredAt: "2026-10-07",
      },
    ]);
    expect(read.label).toBe("Elevated");
    expect(read.detail).toContain("1 critical and 1 warning");
  });
});
