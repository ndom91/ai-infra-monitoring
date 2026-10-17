import type { ObservationInput, SeriesDef } from "~/domain/types";

// Shared vocabulary for hyperscaler GPU list-price collectors (Azure, AWS).
// Each series is one (provider, GPU cohort, region, price type) combination, so
// on-demand, spot and commitment prices are never mixed in one series.

export type GpuCohort = "a100_40gb" | "a100_80gb" | "h100" | "h200" | "b200" | "b300" | "gb200";

export const COHORT_LABELS: Record<GpuCohort, string> = {
  a100_40gb: "A100 40GB SXM",
  a100_80gb: "A100 80GB SXM",
  h100: "H100 80GB SXM",
  h200: "H200 141GB SXM",
  b200: "B200",
  b300: "B300",
  gb200: "GB200 (Blackwell GPU)",
};

export type PriceType = "ondemand" | "spot" | "savings1y" | "reserved1y";

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  ondemand: "on-demand",
  spot: "spot",
  savings1y: "1-year savings plan",
  reserved1y: "1-year reserved",
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
  // Instance price per hour as listed. Absent when the source lists a term
  // total (Azure reservations), which only exists as a per-GPU-hour derivation.
  instancePerHour?: number;
  perGpuHour: number;
  // Where the per-GPU value came from, for the observation note.
  derivation: string;
};

export function seriesId(p: Pick<ListPrice, "provider" | "cohort" | "region" | "priceType">) {
  return `${p.provider}.${p.cohort}.${p.region}.${p.priceType}`;
}

export function instanceSeriesId(
  p: Pick<ListPrice, "provider" | "cohort" | "region" | "priceType">,
) {
  return `${seriesId(p)}.instance`;
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
    cadence: "daily",
    collector: ctx.collector,
  };
}

export function instanceSeriesDef(p: ListPrice, ctx: SeriesContext): SeriesDef {
  return {
    ...perGpuSeriesDef(p, ctx),
    id: instanceSeriesId(p),
    label: `${ctx.source} ${p.sku} ${PRICE_TYPE_LABELS[p.priceType]} (${p.region})`,
    unit: "USD/instance-hr",
    methodology: `${PRICE_TYPE_LABELS[p.priceType]} hourly list price of the whole ${p.sku} instance (${p.gpus}x ${COHORT_LABELS[p.cohort]}) in ${p.region}, ${ctx.filters}, exactly as published. ${LIST_PRICE_CAVEAT}`,
  };
}

// Turns price points into observations: the published instance price is
// "reported", the per-GPU value is "calculated" because we divide it.
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
    if (p.instancePerHour !== undefined) {
      out.push({
        ...base,
        seriesId: instanceSeriesId(p),
        value: p.instancePerHour,
        kind: "reported",
        ...(period.note ? { note: period.note } : {}),
      });
    }
  }
  return out;
}
