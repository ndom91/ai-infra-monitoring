import * as v from "valibot";
import { permanent } from "../errors";
import {
  type GpuCohort,
  type ListPrice,
  perGpuSeriesDef,
  toObservations,
  utcDate,
} from "../gpu-list-price";
import type { Collector } from "../types";

export const PRICING_URL = "https://www.runcrate.ai/api/gpu-pricing";

const GpuSchema = v.object({
  gpu_type: v.string(),
  name: v.string(),
  vram: v.string(),
  min_price_hr: v.pipe(v.number(), v.finite()),
  available_options: v.pipe(v.number(), v.integer()),
});
const FeedSchema = v.object({ gpus: v.array(GpuSchema) });
type Gpu = v.InferOutput<typeof GpuSchema>;

// Only feed types that map to exactly one cohort here. H100 is left out because
// the feed does not say SXM or PCIe, and H200 NVL is a different part from the
// SXM H200 cohort.
const TRACKED_GPUS: Record<string, GpuCohort> = {
  H200: "h200",
  RTX5090: "rtx5090",
  RTX4090: "rtx4090",
};

export function parseFeed(body: string): Gpu[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw permanent("Runcrate pricing feed is not valid JSON");
  }
  const parsed = v.safeParse(FeedSchema, json);
  if (!parsed.success) {
    throw permanent(
      `unexpected Runcrate pricing payload: ${parsed.issues.map((issue) => issue.message).join(", ")}`,
    );
  }
  return parsed.output.gpus;
}

// Types with no orderable option (available_options < 1) are not listed.
export function extractPrices(gpus: Gpu[]): ListPrice[] {
  const out: ListPrice[] = [];
  for (const gpu of gpus) {
    const cohort = TRACKED_GPUS[gpu.gpu_type];
    if (!cohort || gpu.available_options < 1) continue;
    if (gpu.min_price_hr <= 0) {
      throw permanent(`invalid Runcrate price for ${gpu.gpu_type}: ${gpu.min_price_hr}`);
    }
    out.push({
      provider: "runcrate",
      cohort,
      region: "global",
      priceType: "ondemand",
      sku: gpu.name,
      gpus: 1,
      perGpuHour: gpu.min_price_hr,
      observationKind: "reported",
      derivation: `Starting price ${gpu.min_price_hr} USD/GPU-hr across ${gpu.available_options} orderable options`,
    });
  }
  return out;
}

const SERIES_CTX = {
  collector: "runcrate",
  source: "Runcrate",
  sourceUrl: PRICING_URL,
  filters:
    "starting per-GPU rate for the type across Runcrate's orderable options, pay as you go, all regions",
  priceTerm: "starting published price",
  caveat:
    "This is Runcrate's own published feed, not a transaction price. The starting option can sit in any listed region and changes as options come and go.",
};

export const runcrateCollector: Collector = {
  name: "runcrate",
  description:
    "Runcrate public GPU pricing feed, starting per-GPU rate for H200, RTX 4090 and RTX 5090",
  async collect({ now, fetch, log }) {
    const response = await fetch(PRICING_URL);
    const body = await response.text();
    const prices = extractPrices(parseFeed(body));
    if (prices.length === 0) throw permanent("no tracked Runcrate GPU prices found");
    const today = utcDate(now);
    for (const price of prices) log(`${price.sku} ${price.perGpuHour.toFixed(3)}`);
    return {
      series: prices.map((price) => perGpuSeriesDef(price, SERIES_CTX)),
      observations: toObservations(prices, { start: today, end: today }),
      snapshots: [{ contentType: "application/json", body }],
    };
  },
};
