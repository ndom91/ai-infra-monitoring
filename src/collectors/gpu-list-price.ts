import type { ObservationInput, SeriesDef } from "~/domain/types";

// Shared vocabulary for hyperscaler GPU list-price collectors (Azure, AWS).
// Each series is one (provider, GPU cohort, region, price type) combination, so
// on-demand, spot and commitment prices are never mixed in one series.

export type GpuCohort = "h100" | "h200";

export const COHORT_LABELS: Record<GpuCohort, string> = {
  h100: "H100 80GB SXM",
  h200: "H200 141GB SXM",
};

export type PriceType = "ondemand" | "spot";

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  ondemand: "on-demand",
  spot: "spot",
};

export const LIST_PRICE_CAVEAT =
  "These are hyperscaler LIST prices, not marketplace or transaction prices. They change rarely, say nothing about available inventory, and exclude the negotiated discounts most large buyers receive.";

export function perGpuHour(instancePricePerHour: number, gpus: number) {
  if (!(gpus > 0)) throw new Error(`invalid GPU count ${gpus}`);
  return instancePricePerHour / gpus;
}

export function utcDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// One price point as read from the source, before it becomes observations.
export type ListPrice = {
  provider: "azure" | "aws";
  cohort: GpuCohort;
  region: string;
  priceType: PriceType;
  sku: string;
  gpus: number;
  // Instance price per hour as listed; recorded in the observation note.
  instancePerHour?: number;
  perGpuHour: number;
  // Where the per-GPU value came from, for the observation note.
  derivation: string;
};

export function seriesId(p: Pick<ListPrice, "provider" | "cohort" | "region" | "priceType">) {
  return `${p.provider}.${p.cohort}.${p.region}.${p.priceType}`;
}

type SeriesContext = {
  collector: string;
  source: string;
  sourceUrl: string;
  // Provider-specific filters, e.g. "Linux, shared tenancy".
  filters: string;
};

export function perGpuSeriesDef(p: ListPrice, ctx: SeriesContext): SeriesDef {
  return {
    id: seriesId(p),
    indicator: "gpu_rental",
    label: `${ctx.source} ${COHORT_LABELS[p.cohort]} ${PRICE_TYPE_LABELS[p.priceType]} (${p.region})`,
    entity: COHORT_LABELS[p.cohort],
    source: ctx.source,
    sourceUrl: ctx.sourceUrl,
    unit: "USD/GPU-hr",
    currency: "USD",
    methodology: `${PRICE_TYPE_LABELS[p.priceType]} list price of ${p.sku} (${p.gpus}x ${COHORT_LABELS[p.cohort]}) in ${p.region}, ${ctx.filters}, divided by the ${p.gpus} GPUs in the instance. ${LIST_PRICE_CAVEAT}`,
    // List prices change rarely; weekly collection is enough and keeps the
    // ~300 MB AWS offer-file download infrequent.
    cadence: "weekly",
    collector: ctx.collector,
  };
}

// Turns price points into per-GPU observations. They are "calculated" because
// we divide the published instance price; the note records that price.
export function toObservations(
  prices: ListPrice[],
  period: { start: string; end: string; asOf?: string; sourceUrl?: string; note?: string },
): ObservationInput[] {
  const out: ObservationInput[] = [];
  for (const p of prices) {
    const base = {
      periodStart: period.start,
      periodEnd: period.end,
      ...(period.asOf ? { asOf: period.asOf } : {}),
      ...(period.sourceUrl ? { sourceUrl: period.sourceUrl } : {}),
    };
    const suffix = period.note ? ` ${period.note}` : "";
    out.push({
      ...base,
      seriesId: seriesId(p),
      value: p.perGpuHour,
      kind: "calculated",
      note: `${p.derivation}.${suffix}`,
    });
  }
  return out;
}
