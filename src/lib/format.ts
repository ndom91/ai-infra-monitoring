import type { Change } from "~/metrics/changes";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatValue(value: number, unit: string) {
  if (unit === "USD") return `$${compact.format(value)}`;
  if (unit === "USD/GPU-hr") return `$${value.toFixed(2)}/hr`;
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  const n = Math.abs(value) >= 1000 ? compact.format(value) : `${+value.toFixed(2)}`;
  return `${n} ${unit}`;
}

// Spreads and yields move in basis points; other % series in percentage points.
export function formatDelta(change: Change, unit: string, bps = false) {
  const sign = change.delta > 0 ? "+" : change.delta < 0 ? "−" : "±";
  const abs = Math.abs(change.delta);
  if (unit === "%") {
    return bps ? `${sign}${Math.round(abs * 100)} bps` : `${sign}${abs.toFixed(2)} pp`;
  }
  if (change.pct == null) return `${sign}${formatValue(abs, unit)}`;
  return `${sign}${Math.abs(change.pct * 100).toFixed(1)}%`;
}

export function formatDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export const PALETTE = [
  "#b5e1cd",
  "#f5c69c",
  "#9cc3f5",
  "#ffa49e",
  "#c9b5f0",
  "#e8dc9a",
  "#91a0a4",
];
