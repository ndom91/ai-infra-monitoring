import { describe, expect, it } from "vitest";
import { RUN_STATUS } from "./collector-run";

describe("RUN_STATUS", () => {
  it("describes a partial run as partly failed, not as stale data", () => {
    expect(RUN_STATUS.partial.label).toBe("Partly failed");
    for (const { label } of Object.values(RUN_STATUS)) {
      expect(label.toLowerCase()).not.toContain("stale");
    }
  });

  it("covers every status a run can have", () => {
    expect(Object.keys(RUN_STATUS).sort()).toEqual(["failed", "ok", "partial", "running"]);
  });
});
