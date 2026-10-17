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

const eastus2 = readFileSync("test/fixtures/azure/eastus2.json", "utf8");
const TODAY = "2026-10-17";
const H100 = "Standard_ND96isr_H100_v5";
const H200 = "Standard_ND96isr_H200_v5";

function sku(name: string) {
  const s = AZURE_SKUS.find((x) => x.armSkuName === name);
  if (!s) throw new Error(name);
  return s;
}

function byType(items: AzureItem[], name: string) {
  return Object.fromEntries(
    extractPrices(items, sku(name), "eastus2", TODAY).map((p) => [p.priceType, p]),
  );
}

describe("parsePage", () => {
  it("parses a recorded response and rejects schema drift", () => {
    const page = parsePage(JSON.parse(eastus2));
    expect(page.Items.length).toBeGreaterThan(10);
    expect(page.NextPageLink).toBeNull();
    expect(() => parsePage({ Items: [{ retailPrice: "x" }] })).toThrow(/unexpected Azure/);
  });
});

describe("extractPrices", () => {
  const items = parsePage(JSON.parse(eastus2)).Items;

  it("finds every configured SKU in the recorded region", () => {
    for (const { region, skus } of AZURE_REGIONS) {
      for (const name of skus) {
        const prices = extractPrices(items, sku(name), region, TODAY);
        expect(prices.map((p) => p.priceType)).toContain("ondemand");
      }
    }
  });

  it("normalizes Linux prices per GPU and keeps price types apart", () => {
    const h100 = byType(items, H100);
    // Linux on-demand is 98.32/hr; Windows, Low Priority and reservation rows
    // in the same response must not leak into either series.
    expect(Object.keys(h100).sort()).toEqual(["ondemand", "spot"]);
    expect(h100.ondemand?.instancePerHour).toBe(98.32);
    expect(h100.ondemand?.perGpuHour).toBeCloseTo(12.29, 6);
    expect(h100.spot?.instancePerHour).toBe(18.169536);
    expect(h100.spot?.perGpuHour).toBeCloseTo(18.169536 / 8, 6);
    expect(h100.spot?.derivation).not.toMatch(/on-demand price/);

    const h200 = byType(items, H200);
    expect(h200.ondemand?.perGpuHour).toBeCloseTo(84.8 / 8, 6);
    // Azure lists the H200 spot meter at the on-demand price; it is flagged.
    expect(h200.spot?.derivation).toMatch(/listed at the on-demand price/);
  });

  it("ignores future-dated rows and rejects ambiguous ones", () => {
    const onDemand = items.find((i) => i.armSkuName === H100 && i.meterName === "ND96isrH100v5");
    if (!onDemand) throw new Error("fixture lacks H100 on-demand row");
    const future = { ...onDemand, retailPrice: 1, effectiveStartDate: "2027-01-01T00:00:00Z" };
    expect(byType([...items, future], H100).ondemand?.instancePerHour).toBe(98.32);

    const clash = { ...onDemand, retailPrice: 1 };
    expect(() => extractPrices([...items, clash], sku(H100), "eastus2", TODAY)).toThrow(
      /ambiguous/,
    );
  });

  it("fails loudly when a SKU has no on-demand price", () => {
    expect(() => extractPrices([], sku(H200), "eastus2", TODAY)).toThrow(/no Linux on-demand/);
  });
});

describe("azureCollector", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);
  // URLSearchParams encodes the quotes around the region name.
  const routes = { "%27eastus2%27": eastus2 };

  it("writes per-GPU series and snapshots the response", async () => {
    const out = await azureCollector.collect({
      backfill: false,
      now,
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    expect(out.failures).toEqual([]);
    expect(out.series.map((s) => s.id).sort()).toEqual([
      "azure.h100.eastus2.ondemand",
      "azure.h100.eastus2.spot",
      "azure.h200.eastus2.ondemand",
      "azure.h200.eastus2.spot",
    ]);
    expect(out.observations.every((o) => o.kind === "calculated")).toBe(true);
    expect(out.snapshots).toHaveLength(1);

    const db = await memoryDb();
    const res = await runCollector(db, azureCollector, {
      now,
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    expect(res.status).toBe("ok");
    expect(res.inserted).toBe(4);
  });

  it("is partial when one SKU is missing from the response", async () => {
    const page = JSON.parse(eastus2);
    page.Items = page.Items.filter((i: AzureItem) => i.armSkuName !== H200);
    const db = await memoryDb();
    const res = await runCollector(db, azureCollector, {
      now,
      fetch: fakeFetch({ "%27eastus2%27": JSON.stringify(page) }) as never,
      log: () => {},
    });
    expect(res.status).toBe("partial");
    expect(res.failures.map((f) => f.key)).toEqual([`eastus2/${H200}`]);
  });

  it("fails when the region request fails", async () => {
    const db = await memoryDb();
    const res = await runCollector(db, azureCollector, {
      now,
      fetch: fakeFetch({ "%27eastus2%27": 503 }) as never,
      log: () => {},
    });
    expect(res.status).toBe("failed");
    expect(res.error?.errorClass).toBe("transient");
  });

  it("adds effectiveStartDate points in backfill mode", async () => {
    const out = await azureCollector.collect({
      backfill: true,
      now,
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    const h100 = out.observations.filter((o) => o.seriesId === "azure.h100.eastus2.ondemand");
    expect(h100.map((o) => o.periodEnd)).toEqual([TODAY, "2023-12-01"]);
    expect(h100[1]?.note).toMatch(/effective from 2023-12-01/);
  });
});
