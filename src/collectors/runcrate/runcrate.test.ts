import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import { extractPrices, parseFeed, runcrateCollector } from ".";

const feed = readFileSync("test/fixtures/runcrate/gpu-pricing-2026-11-08.json", "utf8");
const TODAY = "2026-11-08";

describe("parseFeed", () => {
  it("parses a recorded feed and rejects malformed payloads", () => {
    expect(parseFeed(feed).find((gpu) => gpu.gpu_type === "H200")).toMatchObject({
      vram: "141GB",
      available_options: 10,
    });
    expect(() => parseFeed("not json")).toThrow(/not valid JSON/);
    expect(() => parseFeed("{}")).toThrow(/unexpected Runcrate/);
  });
});

describe("extractPrices", () => {
  it("keeps orderable tracked types and drops H100, H200 NVL and out-of-stock types", () => {
    const prices = extractPrices(parseFeed(feed));
    expect(prices.map((price) => [price.cohort, price.perGpuHour])).toEqual([
      ["h200", 5.13],
      ["rtx5090", 0.72],
    ]);
    expect(prices.every((price) => price.observationKind === "reported")).toBe(true);
    expect(prices.every((price) => price.priceType === "ondemand")).toBe(true);
  });

  it("rejects a non-positive price", () => {
    expect(() =>
      extractPrices([
        { gpu_type: "H200", name: "H200", vram: "141GB", min_price_hr: 0, available_options: 3 },
      ]),
    ).toThrow(/invalid Runcrate price/);
  });
});

describe("runcrateCollector", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("writes one series per tracked type and snapshots the feed", async () => {
    const out = await runcrateCollector.collect({
      backfill: false,
      now,
      fetch: fakeFetch({ "runcrate.ai/api/gpu-pricing": feed }) as never,
      log: () => {},
    });
    expect(out.series.map((series) => series.id).sort()).toEqual([
      "runcrate.h200.global.ondemand",
      "runcrate.rtx5090.global.ondemand",
    ]);
    expect(out.snapshots).toHaveLength(1);

    const db = await memoryDb();
    const result = await runCollector(db, runcrateCollector, {
      now,
      fetch: fakeFetch({ "runcrate.ai/api/gpu-pricing": feed }) as never,
      log: () => {},
    });
    expect(result.status).toBe("ok");
    expect(result.inserted).toBe(2);
  });
});
