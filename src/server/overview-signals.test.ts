import { describe, expect, it } from "vitest";
import {
  figureTone,
  groupAlertSignals,
  type OverviewAlert,
  riskReadFromAlerts,
  stepOfAlert,
  stepReads,
  toneOfSeverity,
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

describe("figureTone", () => {
  const CCC = "fred.BAMLH0A3HYC";
  const HY = "fred.BAMLH0A0HYM2";
  const alert = (a: Partial<OverviewAlert>): OverviewAlert => ({
    ruleId: "r",
    seriesId: null,
    triggeredAt: "2026-11-24",
    severity: "warning",
    message: "m",
    ...a,
  });
  // The shape of the alert history on 26 Nov 2026: the cluster rule fired
  // (critical, no series), plus one warning each on CCC and all junk-rated.
  const today = [
    alert({ ruleId: "multi_indicator_deterioration", severity: "critical", ruleSeries: null }),
    alert({ ruleId: "ccc_oas_widening", seriesId: CCC, ruleSeries: CCC }),
    alert({ ruleId: "hy_oas_widening", seriesId: HY, ruleSeries: HY }),
  ];

  it("takes the warnings about each spread, not the cluster rule that names no series", () => {
    expect(figureTone(CCC, today)).toBe("warning");
    expect(figureTone(HY, today)).toBe("warning");
    expect(figureTone("fred.BAMLC0A4CBBB", today)).toBeNull();
  });

  it("returns the highest severity about the series", () => {
    const alerts = [
      alert({ seriesId: HY, severity: "warning" }),
      alert({ seriesId: HY, severity: "critical" }),
    ];
    expect(figureTone(HY, alerts)).toBe("critical");
  });

  it("counts an alert whose rule reads the series, even without a series id", () => {
    expect(figureTone("aws.h100.us-east-1", [alert({ ruleSeries: "aws.*" })])).toBe("warning");
    expect(figureTone("azure.h100", [alert({ ruleSeries: "aws.*" })])).toBeNull();
  });

  it("never colours a figure for info alerts", () => {
    expect(figureTone(HY, [alert({ seriesId: HY, severity: "info" })])).toBeNull();
  });

  it("maps severities to figure tones, leaving calm figures untoned", () => {
    expect(toneOfSeverity("critical")).toBe("worsening");
    expect(toneOfSeverity("warning")).toBe("mixed");
    expect(toneOfSeverity(null)).toBeUndefined();
  });
});
