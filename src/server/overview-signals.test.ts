import { describe, expect, it } from "vitest";
import {
  groupAlertSignals,
  riskReadFromAlerts,
  stepAlertDetail,
  stepOfAlert,
  stepReads,
} from "./overview-signals";

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

describe("step reads", () => {
  const alert = (
    ruleId: string,
    seriesId: string | null,
    severity: "info" | "warning" | "critical",
  ) => ({
    ruleId,
    seriesId,
    severity,
    triggeredAt: "2026-11-05",
    message: ruleId,
  });

  it("places alerts by series prefix, then by rule id", () => {
    expect(stepOfAlert({ ruleId: "x", seriesId: "fred.BAMLH0A3HYC" })).toBe("borrow");
    expect(stepOfAlert({ ruleId: "x", seriesId: "azure.h100.eastus2.spot" })).toBe("rent");
    expect(stepOfAlert({ ruleId: "x", seriesId: "cbre.na_primary.vacancy" })).toBe("fill");
    expect(stepOfAlert({ ruleId: "multi_indicator_deterioration", seriesId: null })).toBe("borrow");
    expect(stepOfAlert({ ruleId: "unknown", seriesId: null })).toBeNull();
  });

  it("reads each step from its own alerts, consistent with the overall read", () => {
    const alerts = [
      alert("multi_indicator_deterioration", null, "critical"),
      alert("ccc_oas_widening", "fred.BAMLH0A3HYC", "warning"),
      alert("gpu_list_price_cut", "aws.h100.us-east-1.ondemand", "info"),
    ];
    expect(riskReadFromAlerts(alerts).label).toBe("Elevated");
    expect(stepReads(alerts)).toEqual({
      borrow: "Elevated",
      build: "No recent warnings",
      rent: "No recent warnings",
      fill: "No recent warnings",
    });
  });

  it("maps every rule in the alert config to a step", async () => {
    const { parse } = await import("yaml");
    const { readFileSync } = await import("node:fs");
    const config = parse(readFileSync("data/alerts.config.yaml", "utf8")) as {
      rules: { id: string; series?: string }[];
    };
    for (const rule of config.rules) {
      expect(
        stepOfAlert({ ruleId: rule.id, seriesId: rule.series ?? null }),
        rule.id,
      ).not.toBeNull();
    }
  });
});

describe("stepAlertDetail", () => {
  const alert = (
    ruleId: string,
    seriesId: string | null,
    triggeredAt: string,
    severity = "warning",
  ) => ({
    ruleId,
    seriesId,
    triggeredAt,
    severity: severity as "critical" | "warning" | "info",
    message: "m",
  });

  it("counts a step's warning and critical alerts and spans their dates", () => {
    const signals = groupAlertSignals([
      alert("multi_indicator_deterioration", null, "2026-11-06", "critical"),
      alert("ccc_oas_widening", "fred.BAMLH0A3HYC", "2026-11-05"),
      alert("hy_oas_widening", "fred.BAMLH0A0HYM2", "2026-11-05"),
      // Repeats of one rule and series count once, from their first firing.
      alert("hy_oas_widening", "fred.BAMLH0A0HYM2", "2026-11-04"),
      // Info alerts and other steps' alerts are left out.
      alert("hy_oas_elevated", "fred.BAMLH0A0HYM2", "2026-11-10", "info"),
      alert("gpu_list_price_cut", "aws.h100.us-east-1.ondemand", "2026-11-12"),
    ]);
    expect(stepAlertDetail(signals, "borrow")).toBe("3 alerts · 4–6 Nov");
    expect(stepAlertDetail(signals, "rent")).toBe("1 alert · 12 Nov");
  });

  it("gives no detail for a step without warnings", () => {
    expect(stepAlertDetail([], "fill")).toBeUndefined();
  });
});
