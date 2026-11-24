// Groups and compares published GPU rental prices. Prices are compared only
// within one GPU cohort, and never averaged across providers, regions or
// priority tiers.
import { PRICE_TYPE_LABELS, type PriceType } from "~/collectors/gpu-list-price";
import type { Freshness } from "./freshness";

type RentalSeries = {
  id: string;
  entity: string | null;
  sourceUrl: string;
  freshness: Freshness;
  latest: { periodEnd: string; value: number; kind?: string; sourceUrl?: string | null } | null;
};

export type Cohort<T> = {
  entity: string;
  // Short chip name: "H100", "RTX 5090".
  chip: string;
  kind: "datacenter" | "consumer";
  series: T[];
};

// "H100 80GB SXM" -> "H100", "RTX 4090 24GB" -> "RTX 4090".
export function chipName(entity: string) {
  const words = entity.split(" ");
  const memory = words.findIndex((w) => /^\d+GB$/i.test(w));
  return (memory > 0 ? words.slice(0, memory) : words).join(" ");
}

// Series ids look like "<provider>.<cohort>.<region>.<pricetype>"; the
// entity is the GPU cohort.
export function rentalCohorts<T extends Pick<RentalSeries, "entity">>(series: T[]): Cohort<T>[] {
  const map = new Map<string, T[]>();
  for (const s of series) {
    const key = s.entity ?? "Other";
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([entity, list]) => ({
      entity,
      chip: chipName(entity),
      kind: entity.startsWith("RTX") ? "consumer" : "datacenter",
      series: list,
    }));
}

const PROVIDERS: Record<string, string> = {
  aws: "AWS",
  azure: "Azure",
  salad: "Salad",
  runcrate: "Runcrate",
};

// "AWS on-demand", "Azure spot", "Salad high priority".
export function offerLabel(s: Pick<RentalSeries, "id">) {
  const [provider = "", , , type = ""] = s.id.split(".");
  const seller = PROVIDERS[provider] ?? provider;
  const tier = PRICE_TYPE_LABELS[type as PriceType] ?? type.replaceAll("_", " ");
  return `${seller} ${tier}`.trim();
}

export type LadderRow = {
  id: string;
  label: string;
  region: string;
  price: number;
  observed: string;
  kind: string | undefined;
  freshness: Freshness;
  sourceUrl: string;
};

// One row per priced series, cheapest first. The sort is stable, so ties
// keep series order.
export function priceLadder(series: RentalSeries[]): LadderRow[] {
  return series
    .flatMap((s): LadderRow[] =>
      s.latest
        ? [
            {
              id: s.id,
              label: offerLabel(s),
              region: s.id.split(".")[2] ?? "",
              price: s.latest.value,
              observed: s.latest.periodEnd,
              kind: s.latest.kind,
              freshness: s.freshness,
              sourceUrl: s.latest.sourceUrl ?? s.sourceUrl,
            },
          ]
        : [],
    )
    .sort((a, b) => a.price - b.price);
}

// Cheapest against dearest, as a fraction below the dearest price.
export function priceSpread(rows: LadderRow[]) {
  if (rows.length < 2) return null;
  const cheapest = rows[0] as LadderRow;
  const dearest = rows.at(-1) as LadderRow;
  if (!(dearest.price > 0)) return null;
  return { cheapest, dearest, gap: cheapest.price / dearest.price - 1 };
}

// "$0.25–$0.72" across one cohort, dated by the oldest observation so the
// note never overstates freshness.
export function priceRange(rows: LadderRow[]) {
  const cheapest = rows[0];
  const dearest = rows.at(-1);
  if (!cheapest || !dearest) return null;
  const oldest = rows.map((r) => r.observed).sort()[0] as string;
  return {
    text: `$${cheapest.price.toFixed(2)}–$${dearest.price.toFixed(2)}`,
    count: rows.length,
    oldest,
  };
}
