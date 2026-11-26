import { describe, expect, it } from "vitest";
import type { Change } from "~/metrics/changes";
import {
  cashSignal,
  creditMarketSignal,
  rentSignal,
  spaceSignal,
  supplySignal,
} from "./chapterSignals";

const change = (delta: number, pct: number | null = null): Change => ({
  from: { periodEnd: "2025-06-30", value: 0 },
  to: { periodEnd: "2026-06-30", value: delta },
  delta,
  pct,
});

// These rules colour chapter dots, tile dots and now the figures they are
// about, so each branch is pinned here.
describe("chapter signals", () => {
  it("follows the overall read for credit market stress", () => {
    expect(creditMarketSignal("Elevated")).toBe("worsening");
    expect(creditMarketSignal("Watch")).toBe("mixed");
    expect(creditMarketSignal("No recent warnings")).toBe("reassuring");
  });

  it("flags capex above operating cash flow", () => {
    expect(cashSignal(1.4)).toBe("worsening");
    expect(cashSignal(0.8)).toBe("reassuring");
    expect(cashSignal(null)).toBe("context");
  });

  it("warns when construction grows while pre-leasing falls", () => {
    expect(supplySignal(change(500, 0.1), change(-1.5))).toBe("worsening");
    expect(supplySignal(change(2000, 0.43), change(6.1))).toBe("mixed");
    expect(supplySignal(change(100, 0.05), change(0.5))).toBe("reassuring");
    expect(supplySignal(null, change(1))).toBe("context");
  });

  it("warns when vacancy rises by a point or more", () => {
    expect(spaceSignal(change(1))).toBe("worsening");
    expect(spaceSignal(change(-0.2))).toBe("reassuring");
    expect(spaceSignal(null)).toBe("context");
  });

  it("warns when rents fall year over year", () => {
    expect(rentSignal(change(-3))).toBe("worsening");
    expect(rentSignal(change(12))).toBe("reassuring");
    expect(rentSignal(null)).toBe("context");
  });
});
