import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import {
  AZURE_REGIONS,
  AZURE_SKUS,
  type AzureItem,
  azureCollector,
  extractPrices,
  parsePage,
} from ".";

const eastus = readFileSync("test/fixtures/azure/eastus.json", "utf8");
const eastus2 = readFileSync("test/fixtures/azure/eastus2.json", "utf8");
const TODAY = "2026-10-17";

function sku(name: string) {
  const s = AZURE_SKUS.find((x) => x.armSkuName === name);
  if (!s) throw new Error(name);
  return s;
}

function byType(items: AzureItem[], name: string, region: string) {
  return Object.fromEntries(
    extractPrices(items, sku(name), region, TODAY).map((p) => [p.priceType, p]),
  );
}

describe("parsePage", () => {
  it("parses a recorded response and rejects schema drift", () => {
    const page = parsePage(JSON.parse(eastus));
    expect(page.Items.length).toBeGreaterThan(20);
    expect(page.NextPageLink).toBeNull();
    expect(() => parsePage({ Items: [{ retailPrice: "x" }] })).toThrow(/unexpected Azure/);
  });
});

describe("extractPrices", () => {
  const items = parsePage(JSON.parse(eastus)).Items;

  it("finds every configured SKU in the recorded regions", () => {
    const pages = { eastus, eastus2 };
    for (const { region, skus } of AZURE_REGIONS) {
      const regionItems = parsePage(JSON.parse(pages[region as keyof typeof pages])).Items;
      for (const name of skus) {
        const prices = extractPrices(regionItems, sku(name), region, TODAY);
        expect(prices.map((p) => p.priceType)).toContain("ondemand");
      }
    }
  });

  it("normalizes Linux prices per GPU and keeps price types apart", () => {
    const h100 = byType(items, "Standard_ND96isr_H100_v5", "eastus");
    // Linux on-demand is 98.32/hr; the Windows meter (102.736) must be ignored.
    expect(h100.ondemand?.instancePerHour).toBe(98.32);
    expect(h100.ondemand?.perGpuHour).toBeCloseTo(12.29, 6);
    expect(h100.spot?.instancePerHour).toBe(18.169536);
    // 1-year reservation is a term total: 551221 USD / 8760 h / 8 GPUs.
    expect(h100.reserved1y?.perGpuHour).toBeCloseTo(551221 / 8760 / 8, 6);
    expect(h100.reserved1y?.instancePerHour).toBeUndefined();
    expect(h100.savings1y).toBeUndefined();

    const a100 = byType(items, "Standard_ND96amsr_A100_v4", "eastus");
    expect(a100.ondemand?.perGpuHour).toBeCloseTo(32.77 / 8, 6);
    expect(a100.savings1y?.instancePerHour).toBe(28.244463);
    // Legacy "Low Priority" meters are neither on-demand nor spot.
    expect(a100.spot?.instancePerHour).toBe(8.441552);

    const gb200 = byType(items, "Standard_ND128isr_NDR_GB200_v6", "eastus");
    expect(gb200.ondemand?.perGpuHour).toBeCloseTo(108.16 / 4, 6);
    expect(gb200.spot?.derivation).toMatch(/listed at the on-demand price/);
    expect(h100.spot?.derivation).not.toMatch(/on-demand price/);
  });

  it("ignores future-dated rows and rejects ambiguous ones", () => {
    const onDemand = items.find(
      (i) => i.armSkuName === "Standard_ND96isr_H100_v5" && i.meterName === "ND96isrH100v5",
    );
    if (!onDemand) throw new Error("fixture lacks H100 on-demand row");
    const future = { ...onDemand, retailPrice: 1, effectiveStartDate: "2027-01-01T00:00:00Z" };
    const withFuture = byType([...items, future], "Standard_ND96isr_H100_v5", "eastus");
    expect(withFuture.ondemand?.instancePerHour).toBe(98.32);

    const clash = { ...onDemand, retailPrice: 1 };
    expect(() =>
      extractPrices([...items, clash], sku("Standard_ND96isr_H100_v5"), "eastus", TODAY),
    ).toThrow(/ambiguous/);
  });

  it("fails loudly when a SKU has no on-demand price", () => {
    expect(() => extractPrices([], sku("Standard_ND96isr_H200_v5"), "eastus", TODAY)).toThrow(
      /no Linux on-demand/,
    );
  });
});

describe("azureCollector", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);
  // URLSearchParams encodes the quotes around the region name.
  const routes = { "%27eastus%27": eastus, "%27eastus2%27": eastus2 };

  it("writes per-GPU and instance series and snapshots each response", async () => {
    const db = await memoryDb();
    const res = await runCollector(db, azureCollector, {
      now,
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    expect(res.status).toBe("ok");
    expect(res.inserted).toBeGreaterThan(40);
  });

  it("is partial when one region fails", async () => {
    const db = await memoryDb();
    const res = await runCollector(db, azureCollector, {
      now,
      fetch: fakeFetch({ ...routes, "%27eastus2%27": 503 }) as never,
      log: () => {},
    });
    expect(res.status).toBe("partial");
    expect(res.failures.map((f) => f.key)).toEqual(["eastus2"]);
  });

  it("adds effectiveStartDate points in backfill mode", async () => {
    const out = await azureCollector.collect({
      backfill: true,
      now,
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    const h100 = out.observations.filter((o) => o.seriesId === "azure.h100.eastus.ondemand");
    expect(h100.map((o) => o.periodEnd)).toEqual([TODAY, "2023-12-01"]);
    expect(h100[1]?.note).toMatch(/effective from 2023-12-01/);
  });
});
