import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import { extractPrices, parseGpuPrices, saladCollector } from ".";

const pricing = readFileSync("test/fixtures/salad/pricing-2026-10-19.html", "utf8");
const TODAY = "2026-10-19";

describe("parseGpuPrices", () => {
  it("parses a recorded pricing page and rejects a missing embedded payload", () => {
    const gpus = parseGpuPrices(pricing);
    expect(gpus.find((gpu) => gpu.name === "RTX 5090")).toMatchObject({
      vram_gb: 32,
      high: 0.5,
      lowest: 0.25,
    });
    expect(() => parseGpuPrices("<html></html>")).toThrow(/lacks gpu-prices/);
  });
});

describe("extractPrices", () => {
  it("keeps RTX models and priority tiers as separate reported prices", () => {
    const prices = extractPrices(parseGpuPrices(pricing));
    expect(prices).toHaveLength(8);
    expect(prices.filter((price) => price.cohort === "rtx5090")).toMatchObject([
      { priceType: "priority_high", perGpuHour: 0.5 },
      { priceType: "priority_medium", perGpuHour: 0.417 },
      { priceType: "priority_low", perGpuHour: 0.333 },
      { priceType: "priority_lowest", perGpuHour: 0.25 },
    ]);
    expect(prices.every((price) => price.observationKind === "reported")).toBe(true);
  });
});

describe("saladCollector", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("writes individual priority-tier series and snapshots the page", async () => {
    const out = await saladCollector.collect({
      backfill: false,
      now,
      fetch: fakeFetch({ "salad.com/pricing": pricing }) as never,
      log: () => {},
    });
    expect(out.series.map((series) => series.id).sort()).toEqual([
      "salad.rtx4090.community.priority_high",
      "salad.rtx4090.community.priority_low",
      "salad.rtx4090.community.priority_lowest",
      "salad.rtx4090.community.priority_medium",
      "salad.rtx5090.community.priority_high",
      "salad.rtx5090.community.priority_low",
      "salad.rtx5090.community.priority_lowest",
      "salad.rtx5090.community.priority_medium",
    ]);
    expect(out.observations.every((observation) => observation.kind === "reported")).toBe(true);
    expect(out.snapshots).toHaveLength(1);

    const db = await memoryDb();
    const result = await runCollector(db, saladCollector, {
      now,
      fetch: fakeFetch({ "salad.com/pricing": pricing }) as never,
      log: () => {},
    });
    expect(result.status).toBe("ok");
    expect(result.inserted).toBe(8);
  });
});
