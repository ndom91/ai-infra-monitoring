import * as v from "valibot";
import type { SeriesDef } from "~/domain/types";
import { classify, permanent } from "../errors";
import {
  type GpuCohort,
  instanceSeriesDef,
  type ListPrice,
  perGpuHour,
  perGpuSeriesDef,
  toObservations,
  utcDate,
} from "../gpu-list-price";
import type { CollectOutput, Collector } from "../types";

// Azure Retail Prices API: public and unauthenticated. Microsoft documents it for
// "your own tools for internal analysis and price comparison across SKUs and regions".
// https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
const API = "https://prices.azure.com/api/retail/prices";
const API_VERSION = "2023-01-01-preview"; // needed for savings plan prices
const DOCS_URL =
  "https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices";

// Azure lists reservations as a USD total for the whole term. Converting to an
// hourly rate assumes 365 days of 24 hours, the convention of Azure's calculator.
const HOURS_PER_YEAR = 8760;

type AzureSku = { armSkuName: string; cohort: GpuCohort; gpus: number };

// GPU counts come from the Azure VM size docs, not from the price feed.
export const AZURE_SKUS: AzureSku[] = [
  { armSkuName: "Standard_ND96asr_v4", cohort: "a100_40gb", gpus: 8 },
  { armSkuName: "Standard_ND96amsr_A100_v4", cohort: "a100_80gb", gpus: 8 },
  { armSkuName: "Standard_ND96isr_H100_v5", cohort: "h100", gpus: 8 },
  { armSkuName: "Standard_ND96isr_H200_v5", cohort: "h200", gpus: 8 },
  { armSkuName: "Standard_ND128isr_NDR_GB200_v6", cohort: "gb200", gpus: 4 },
];

// Fixed reference regions. eastus has the A100 40GB SKU but no H200, eastus2
// has the H200, so both are tracked. A SKU listed here that disappears from its
// region shows up as a failure instead of silently vanishing.
export const AZURE_REGIONS: { region: string; skus: string[] }[] = [
  {
    region: "eastus",
    skus: [
      "Standard_ND96asr_v4",
      "Standard_ND96amsr_A100_v4",
      "Standard_ND96isr_H100_v5",
      "Standard_ND128isr_NDR_GB200_v6",
    ],
  },
  {
    region: "eastus2",
    skus: [
      "Standard_ND96amsr_A100_v4",
      "Standard_ND96isr_H100_v5",
      "Standard_ND96isr_H200_v5",
      "Standard_ND128isr_NDR_GB200_v6",
    ],
  },
];

const MAX_PAGES = 5;

const ItemSchema = v.object({
  currencyCode: v.string(),
  retailPrice: v.pipe(v.number(), v.finite()),
  armRegionName: v.string(),
  armSkuName: v.string(),
  meterName: v.string(),
  productName: v.string(),
  type: v.string(),
  effectiveStartDate: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T/)),
  unitOfMeasure: v.string(),
  isPrimaryMeterRegion: v.boolean(),
  reservationTerm: v.optional(v.string()),
  savingsPlan: v.optional(
    v.array(v.object({ retailPrice: v.pipe(v.number(), v.finite()), term: v.string() })),
  ),
});
export type AzureItem = v.InferOutput<typeof ItemSchema>;

const PageSchema = v.object({
  Items: v.array(ItemSchema),
  NextPageLink: v.nullish(v.string()),
});

export function regionUrl(region: string, skus: string[]) {
  const skuFilter = skus.map((s) => `armSkuName eq '${s}'`).join(" or ");
  const filter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and (${skuFilter})`;
  const params = new URLSearchParams({ "api-version": API_VERSION, $filter: filter });
  return `${API}?${params}`;
}

export function parsePage(json: unknown) {
  const r = v.safeParse(PageSchema, json);
  if (!r.success) {
    throw permanent(
      `unexpected Azure Retail Prices payload: ${r.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return r.output;
}

// Windows meters carry a licence surcharge; Linux meters have no OS suffix.
function isLinux(item: AzureItem) {
  return !/\bWindows\b/.test(item.productName);
}

type Effective = { price: number; effectiveDate: string };

// Picks the row in force on `today`. Azure can publish future-dated rows, and
// two rows in force on the same date with different prices is ambiguous.
function current(items: AzureItem[], today: string, value: (i: AzureItem) => number | undefined) {
  const live = items.filter((i) => i.effectiveStartDate.slice(0, 10) <= today);
  if (live.length === 0) return undefined;
  const latest = live.reduce((a, b) => (b.effectiveStartDate > a.effectiveStartDate ? b : a));
  const sameDay = live.filter((i) => i.effectiveStartDate === latest.effectiveStartDate);
  const prices = new Set(sameDay.map(value));
  if (prices.size > 1) {
    throw permanent(
      `ambiguous Azure prices for ${latest.armSkuName} ${latest.meterName} on ${latest.effectiveStartDate}: ${[...prices].join(", ")}`,
    );
  }
  const price = value(latest);
  if (price === undefined) return undefined;
  return { price, effectiveDate: latest.effectiveStartDate.slice(0, 10) } satisfies Effective;
}

export type AzurePricePoint = ListPrice & { effectiveDate: string };

// Extracts on-demand, spot, 1-year savings plan and 1-year reservation prices
// for one SKU in one region. On-demand must exist; the others are optional
// because Azure does not offer every commitment type for every SKU.
export function extractPrices(
  items: AzureItem[],
  sku: AzureSku,
  region: string,
  today: string,
): AzurePricePoint[] {
  const rows = items.filter(
    (i) => i.armSkuName === sku.armSkuName && i.armRegionName === region && i.isPrimaryMeterRegion,
  );
  for (const r of rows) {
    if (r.currencyCode !== "USD") throw permanent(`non-USD Azure price: ${r.currencyCode}`);
  }
  const hourly = rows.filter((r) => r.unitOfMeasure === "1 Hour");
  const consumption = hourly.filter((r) => r.type === "Consumption" && isLinux(r));
  const isSpot = (r: AzureItem) => /\bSpot$/.test(r.meterName);
  // "Low Priority" is the legacy Azure Batch tier; it is neither on-demand nor spot.
  const isLowPriority = (r: AzureItem) => /Low Priority/.test(r.meterName);
  const onDemandRows = consumption.filter((r) => !isSpot(r) && !isLowPriority(r));
  const spotRows = consumption.filter(isSpot);
  const reservedRows = rows.filter(
    (r) => r.type === "Reservation" && r.reservationTerm === "1 Year",
  );

  const base = { provider: "azure" as const, cohort: sku.cohort, region, sku: sku.armSkuName };
  const out: AzurePricePoint[] = [];

  const onDemand = current(onDemandRows, today, (i) => i.retailPrice);
  if (!onDemand) throw permanent(`no Linux on-demand price for ${sku.armSkuName} in ${region}`);
  out.push({
    ...base,
    priceType: "ondemand",
    gpus: sku.gpus,
    instancePerHour: onDemand.price,
    perGpuHour: perGpuHour(onDemand.price, sku.gpus),
    derivation: `Instance list price ${onDemand.price} USD/hr / ${sku.gpus} GPUs`,
    effectiveDate: onDemand.effectiveDate,
  });

  const spot = current(spotRows, today, (i) => i.retailPrice);
  if (spot) {
    // Azure lists some new SKUs (H200, GB200) with a spot meter priced exactly
    // at on-demand. Kept as published, but flagged so nobody reads it as a discount.
    const caveat =
      spot.price === onDemand.price
        ? " (spot meter is listed at the on-demand price; likely not a real spot discount)"
        : "";
    out.push({
      ...base,
      priceType: "spot",
      gpus: sku.gpus,
      instancePerHour: spot.price,
      perGpuHour: perGpuHour(spot.price, sku.gpus),
      derivation: `Instance spot list price ${spot.price} USD/hr / ${sku.gpus} GPUs${caveat}`,
      effectiveDate: spot.effectiveDate,
    });
  }

  // Savings plan rates hang off the on-demand meter and are already hourly.
  const savings = current(
    onDemandRows,
    today,
    (i) => i.savingsPlan?.find((s) => s.term === "1 Year")?.retailPrice,
  );
  if (savings) {
    out.push({
      ...base,
      priceType: "savings1y",
      gpus: sku.gpus,
      instancePerHour: savings.price,
      perGpuHour: perGpuHour(savings.price, sku.gpus),
      derivation: `Instance 1-year savings plan rate ${savings.price} USD/hr / ${sku.gpus} GPUs`,
      effectiveDate: savings.effectiveDate,
    });
  }

  const reserved = current(reservedRows, today, (i) => i.retailPrice);
  if (reserved) {
    out.push({
      ...base,
      priceType: "reserved1y",
      gpus: sku.gpus,
      perGpuHour: reserved.price / HOURS_PER_YEAR / sku.gpus,
      derivation: `1-year reservation total ${reserved.price} USD / ${HOURS_PER_YEAR} h / ${sku.gpus} GPUs`,
      effectiveDate: reserved.effectiveDate,
    });
  }
  return out;
}

const SERIES_CTX = {
  collector: "azure",
  source: "Azure Retail Prices",
  sourceUrl: DOCS_URL,
  filters:
    "Linux meters, primary meter region, Azure Retail Prices API (USD). Spot is the published spot meter; savings plan is the 1-year compute savings plan hourly rate; reserved is the 1-year reservation term total divided by 8760 h",
};

export const azureCollector: Collector = {
  name: "azure",
  description: "Azure list prices for GPU VMs (A100, H100, H200, GB200), per GPU-hour",
  async collect({ backfill, now, fetch, log }) {
    const today = utcDate(now);
    const out: Required<Pick<CollectOutput, "series" | "observations" | "failures" | "snapshots">> =
      { series: [], observations: [], failures: [], snapshots: [] };
    const seen = new Set<string>();
    const addSeries = (s: SeriesDef) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      out.series.push(s);
    };

    for (const { region, skus } of AZURE_REGIONS) {
      let items: AzureItem[];
      const url = regionUrl(region, skus);
      try {
        items = [];
        let next: string | null | undefined = url;
        for (let page = 0; next; page++) {
          if (page >= MAX_PAGES) throw permanent(`more than ${MAX_PAGES} pages for ${region}`);
          const res = await fetch(next);
          const body = await res.text();
          const parsed = parsePage(JSON.parse(body));
          items.push(...parsed.Items);
          out.snapshots.push({ contentType: "application/json", body });
          next = parsed.NextPageLink;
        }
      } catch (err) {
        out.failures.push({ key: region, error: classify(err) });
        continue;
      }

      for (const name of skus) {
        const sku = AZURE_SKUS.find((s) => s.armSkuName === name);
        if (!sku) throw new Error(`unknown Azure SKU in config: ${name}`);
        try {
          const prices = extractPrices(items, sku, region, today);
          for (const p of prices) {
            addSeries(perGpuSeriesDef(p, SERIES_CTX));
            if (p.instancePerHour !== undefined) addSeries(instanceSeriesDef(p, SERIES_CTX));
          }
          out.observations.push(...toObservations(prices, { start: today, end: today }));
          // effectiveStartDate tells us the price has been unchanged since that
          // date, so it is a real (single) historical point, not interpolation.
          // Savings plans are skipped: their rates hang off the on-demand row and
          // carry no effective date of their own.
          if (backfill) {
            for (const p of prices) {
              if (p.priceType === "savings1y" || p.effectiveDate >= today) continue;
              out.observations.push(
                ...toObservations([p], {
                  start: p.effectiveDate,
                  end: p.effectiveDate,
                  note: `Price effective from ${p.effectiveDate} per Azure effectiveStartDate; earlier prices are not published by the API.`,
                }),
              );
            }
          }
          log(
            `${region} ${name}: ${prices.map((p) => `${p.priceType}=${p.perGpuHour.toFixed(3)}`).join(" ")}`,
          );
        } catch (err) {
          out.failures.push({ key: `${region}/${name}`, error: classify(err) });
        }
      }
    }

    if (out.observations.length === 0) {
      throw out.failures[0]?.error ?? permanent("no Azure prices collected");
    }
    return out;
  },
};
