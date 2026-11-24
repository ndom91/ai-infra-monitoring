import { describe, expect, it } from "vitest";
import {
  chipName,
  offerLabel,
  priceLadder,
  priceRange,
  priceSpread,
  rentalCohorts,
} from "./market";

const s = (id: string, entity: string, value: number | null, periodEnd = "2026-11-23") => ({
  id,
  entity,
  sourceUrl: `https://example.test/${id}`,
  freshness: "current" as const,
  latest: value == null ? null : { periodEnd, value },
});

describe("market helpers", () => {
  it("groups cohorts in name order and tags consumer chips", () => {
    const c = rentalCohorts([
      s("salad.rtx5090.global.priority_high", "RTX 5090 32GB", 0.6),
      s("aws.h200.us-east-1.ondemand", "H200 141GB SXM", 7.91),
      s("aws.h100.us-east-1.ondemand", "H100 80GB SXM", 6.88),
    ]);
    expect(c.map((x) => [x.chip, x.kind])).toEqual([
      ["H100", "datacenter"],
      ["H200", "datacenter"],
      ["RTX 5090", "consumer"],
    ]);
    expect(chipName("RTX 4090 24GB")).toBe("RTX 4090");
  });

  it("labels offers by seller and tier", () => {
    expect(offerLabel({ id: "aws.h100.us-east-1.ondemand" })).toBe("AWS on-demand");
    expect(offerLabel({ id: "azure.h100.eastus2.spot" })).toBe("Azure spot");
    expect(offerLabel({ id: "salad.rtx4090.global.priority_high" })).toBe("Salad high priority");
    expect(offerLabel({ id: "runcrate.h200.global.ondemand" })).toBe("Runcrate on-demand");
  });

  it("sorts the ladder cheapest first, keeps ties in order, drops unpriced series", () => {
    const rows = priceLadder([
      s("azure.h100.eastus2.ondemand", "H100", 12.29),
      s("aws.h100.us-east-1.ondemand", "H100", 6.88),
      s("azure.h100.eastus2.spot", "H100", 2.27),
      s("runcrate.h100.global.ondemand", "H100", null),
      s("azure.h100.westus.ondemand", "H100", 12.29),
    ]);
    expect(rows.map((r) => r.id)).toEqual([
      "azure.h100.eastus2.spot",
      "aws.h100.us-east-1.ondemand",
      "azure.h100.eastus2.ondemand",
      "azure.h100.westus.ondemand",
    ]);
    expect(rows[0]?.region).toBe("eastus2");
  });

  it("measures the spread only with two or more prices", () => {
    const rows = priceLadder([
      s("azure.h100.eastus2.spot", "H100", 2.27),
      s("azure.h100.eastus2.ondemand", "H100", 12.29),
    ]);
    expect(priceSpread(rows)?.gap).toBeCloseTo(-0.815, 3);
    expect(priceSpread(rows.slice(0, 1))).toBeNull();
    expect(priceSpread([])).toBeNull();
  });

  it("states the consumer price range with the oldest date", () => {
    const rows = priceLadder([
      s("salad.rtx5090.global.priority_high", "RTX", 0.72, "2026-11-23"),
      s("salad.rtx5090.global.priority_lowest", "RTX", 0.25, "2026-11-20"),
    ]);
    expect(priceRange(rows)).toEqual({ text: "$0.25–$0.72", count: 2, oldest: "2026-11-20" });
    expect(priceRange([])).toBeNull();
  });
});
