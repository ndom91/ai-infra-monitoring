import { describe, expect, it } from "vitest";
import { COLLECTORS } from "~/collectors/registry";
import { COLLECTOR_CADENCE } from "./collector-cadence";

describe("COLLECTOR_CADENCE", () => {
  it("has an entry for every registered collector", () => {
    const missing = COLLECTORS.map((c) => c.name).filter((n) => !(n in COLLECTOR_CADENCE));
    expect(missing).toEqual([]);
  });

  it("has no entries for unknown collectors", () => {
    const names = new Set(COLLECTORS.map((c) => c.name));
    expect(Object.keys(COLLECTOR_CADENCE).filter((n) => !names.has(n))).toEqual([]);
  });
});
