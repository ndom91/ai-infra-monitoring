import * as v from "valibot";
import { permanent } from "../errors";
import {
  type GpuCohort,
  type ListPrice,
  type PriceType,
  perGpuSeriesDef,
  toObservations,
  utcDate,
} from "../gpu-list-price";
import type { Collector } from "../types";

export const PRICING_URL = "https://salad.com/pricing/";

const GpuPriceSchema = v.object({
  name: v.string(),
  vram_gb: v.pipe(v.number(), v.finite()),
  high: v.pipe(v.number(), v.finite()),
  medium: v.pipe(v.number(), v.finite()),
  low: v.pipe(v.number(), v.finite()),
  lowest: v.pipe(v.number(), v.finite()),
});
const GpuPricesSchema = v.array(GpuPriceSchema);
type GpuPrice = v.InferOutput<typeof GpuPriceSchema>;

const TRACKED_GPUS: Record<string, GpuCohort> = {
  "RTX 4090": "rtx4090",
  "RTX 5090": "rtx5090",
};

const PRIORITIES: {
  field: keyof Pick<GpuPrice, "high" | "medium" | "low" | "lowest">;
  type: PriceType;
}[] = [
  { field: "high", type: "priority_high" },
  { field: "medium", type: "priority_medium" },
  { field: "low", type: "priority_low" },
  { field: "lowest", type: "priority_lowest" },
];

// The public pricing page embeds the published table as JSON, avoiding a
// fragile extraction from rendered table markup.
export function parseGpuPrices(html: string): GpuPrice[] {
  const match = html.match(
    /<script\b(?=[^>]*\bid=(?:"gpu-prices"|'gpu-prices'|gpu-prices(?:\s|>)))[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) throw permanent("Salad pricing page lacks gpu-prices JSON");
  const parsed = v.safeParse(GpuPricesSchema, JSON.parse(match[1]));
  if (!parsed.success) {
    throw permanent(
      `unexpected Salad pricing payload: ${parsed.issues.map((issue) => issue.message).join(", ")}`,
    );
  }
  return parsed.output;
}

export function extractPrices(gpus: GpuPrice[]): ListPrice[] {
  const out: ListPrice[] = [];
  for (const gpu of gpus) {
    const cohort = TRACKED_GPUS[gpu.name];
    if (!cohort) continue;
    for (const priority of PRIORITIES) {
      const price = gpu[priority.field];
      if (price <= 0) throw permanent(`invalid Salad price for ${gpu.name}: ${price}`);
      out.push({
        provider: "salad",
        cohort,
        region: "community",
        priceType: priority.type,
        sku: gpu.name,
        gpus: 1,
        instancePerHour: price,
        perGpuHour: price,
        observationKind: "reported",
        derivation: `Published ${priority.type.replace("_", " ")} price ${price} USD/GPU-hr`,
      });
    }
  }
  return out;
}

const SERIES_CTX = {
  collector: "salad",
  source: "Salad Community Cloud",
  sourceUrl: PRICING_URL,
  filters:
    "Community Cloud published pay-as-you-go price (USD/GPU-hr). Priority tiers are separate because lower tiers are preemptible",
  priceTerm: "published price",
  caveat:
    "These are Salad's published Community Cloud prices, not individual host offers. Capacity is distributed across user-contributed consumer hardware, and lower priority tiers are more interruptible.",
};

export const saladCollector: Collector = {
  name: "salad",
  description: "Salad Community Cloud published RTX 4090 and RTX 5090 prices by priority tier",
  async collect({ now, fetch, log }) {
    const response = await fetch(PRICING_URL);
    const body = await response.text();
    const prices = extractPrices(parseGpuPrices(body));
    if (prices.length === 0) throw permanent("no tracked Salad GPU prices found");
    const today = utcDate(now);
    for (const price of prices)
      log(`${price.sku} ${price.priceType}=${price.perGpuHour.toFixed(3)}`);
    return {
      series: prices.map((price) => perGpuSeriesDef(price, SERIES_CTX)),
      observations: toObservations(prices, { start: today, end: today }),
      snapshots: [{ contentType: "text/html", body }],
    };
  },
};
