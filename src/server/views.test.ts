import { describe, expect, it } from "vitest";
import { buildView, type ObsPoint, type SeriesDefView } from "./views";

const def = {
  id: "insider.sales",
  cadence: "monthly",
  collector: "sec_insider",
  unit: "USD",
} as unknown as SeriesDefView;

const obs = (periodEnd: string): ObsPoint => ({
  id: 1,
  periodStart: `${periodEnd.slice(0, 8)}01`,
  periodEnd,
  value: 1,
  kind: "calculated",
  asOf: null,
  sourceUrl: null,
  note: null,
});

describe("buildView in-progress flag", () => {
  const now = new Date("2026-11-24T10:00:00Z");

  it("flags a latest period that has not ended yet", () => {
    expect(buildView(def, [obs("2026-10-31"), obs("2026-11-30")], { now }).inProgress).toBe(true);
  });

  it("leaves the flag out once the period has ended", () => {
    const view = buildView(def, [obs("2026-10-31")], { now });
    expect("inProgress" in view).toBe(false);
  });

  it("does not flag a period ending today or an empty series", () => {
    expect(buildView(def, [obs("2026-11-24")], { now }).inProgress).toBeUndefined();
    expect(buildView(def, [], { now }).inProgress).toBeUndefined();
  });
});
