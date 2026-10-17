import { describe, expect, it } from "vitest";
import type { Rule } from "./config";
import { type EvalSeries, evaluateBreadthRules, evaluateSeriesRules } from "./evaluate";
import { applyCooldown } from "./run";

function series(id: string, values: [string, number][]): EvalSeries {
  return {
    id,
    label: id,
    unit: "%",
    source: "Test",
    sourceUrl: "https://example.com",
    points: values.map(([periodEnd, value], i) => ({
      id: i + 1,
      periodEnd,
      value,
      sourceUrl: null,
    })),
  };
}

const widening: Rule = {
  id: "widen",
  type: "change",
  series: "fred.*",
  window_days: 90,
  threshold: 0.75,
  relative: false,
  direction: "up",
  severity: "warning",
  description: "test",
  cooldown_days: 30,
};

describe("alert evaluation", () => {
  it("fires a change rule with the exact triggering observations", () => {
    const s = series("fred.HY", [
      ["2026-01-01", 3.0],
      ["2026-04-01", 3.9],
    ]);
    const [hit] = evaluateSeriesRules([widening], [s]);
    expect(hit?.triggeredAt).toBe("2026-04-01");
    expect(hit?.evidence.observations.map((o) => o.value)).toEqual([3.0, 3.9]);
    expect(evaluateSeriesRules([widening], [series("other", [])])).toEqual([]);
  });

  it("does not fire below threshold or in the wrong direction", () => {
    const s = series("fred.HY", [
      ["2026-01-01", 3.9],
      ["2026-04-01", 3.0],
    ]);
    expect(evaluateSeriesRules([widening], [s])).toEqual([]);
  });

  it("fires relative decline rules", () => {
    const rule: Rule = {
      ...widening,
      id: "drop",
      series: "vast.*",
      threshold: 0.2,
      relative: true,
      direction: "down",
    };
    const s = series("vast.h100", [
      ["2026-01-01", 2.0],
      ["2026-04-01", 1.5],
    ]);
    expect(evaluateSeriesRules([rule], [s])).toHaveLength(1);
  });

  it("applies cooldowns per rule and series", () => {
    const [a] = evaluateSeriesRules(
      [widening],
      [
        series("fred.HY", [
          ["2026-01-01", 3],
          ["2026-04-01", 4],
        ]),
      ],
    );
    if (!a) throw new Error("expected candidate");
    const later = { ...a, triggeredAt: "2026-04-15" };
    const muchLater = { ...a, triggeredAt: "2026-06-01" };
    expect(applyCooldown([a, later, muchLater], [])).toEqual([a, muchLater]);
  });

  it("fires breadth rules when enough distinct rules fired", () => {
    const breadth: Rule = {
      id: "broad",
      type: "breadth",
      rules: ["a", "b", "c"],
      min_rules: 2,
      window_days: 60,
      severity: "critical",
      description: "test",
      cooldown_days: 30,
    };
    const ev = (ruleId: string, triggeredAt: string) => ({
      ruleId,
      triggeredAt,
      evidence: { observations: [], params: {} },
    });
    expect(
      evaluateBreadthRules([breadth], [ev("a", "2026-03-01"), ev("a", "2026-03-05")], "2026-03-10"),
    ).toEqual([]);
    const [hit] = evaluateBreadthRules(
      [breadth],
      [ev("a", "2026-03-01"), ev("b", "2026-03-05"), ev("c", "2025-01-01")],
      "2026-03-10",
    );
    expect(hit?.evidence.params.rules_fired).toBe("a,b");
  });
});

describe("breadth freshness", () => {
  it("does not re-fire on stale events alone", () => {
    const breadth: Rule = {
      id: "broad",
      type: "breadth",
      rules: ["a", "b"],
      min_rules: 2,
      window_days: 60,
      severity: "critical",
      description: "test",
      cooldown_days: 30,
    };
    const ev = (ruleId: string, triggeredAt: string) => ({
      ruleId,
      triggeredAt,
      evidence: { observations: [], params: {} },
    });
    const events = [ev("a", "2026-03-01"), ev("b", "2026-03-02")];
    expect(evaluateBreadthRules([breadth], events, "2026-03-05")).toHaveLength(1);
    expect(evaluateBreadthRules([breadth], events, "2026-04-10")).toEqual([]);
  });
});
