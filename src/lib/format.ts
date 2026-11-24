import type { Change } from "~/metrics/changes";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatValue(value: number, unit: string) {
  if (unit === "USD") return `${value < 0 ? "−" : ""}$${compact.format(Math.abs(value))}`;
  if (unit === "USD/GPU-hr") return `$${value.toFixed(2)}/hr`;
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  if (unit === "×") return `${value.toFixed(2)}×`;
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
  if (unit === "×") return `${sign}${abs.toFixed(2)}×`;
  if (change.pct == null) return `${sign}${formatValue(abs, unit)}`;
  return `${sign}${Math.abs(change.pct * 100).toFixed(1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Built by hand: en-GB spells September "Sept" in newer browsers.
export function formatDate(iso: string) {
  const [y = "", m = "", d = ""] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

// The first seven are the original palette and keep their order, so existing
// charts do not change colour. The rest were picked to sit at least as far
// from every other colour as the original pairs do, and all clear 3:1
// against the chart background.
export const PALETTE = [
  "#b5e1cd",
  "#f5c69c",
  "#9cc3f5",
  "#ffa49e",
  "#c9b5f0",
  "#e8dc9a",
  "#91a0a4",
  "#e58fc0",
  "#5fc7d6",
  "#a8d86a",
  "#c48552",
  "#7b8cf0",
];

// Past the end of the palette colours repeat, so each further lap gets a
// dash pattern to keep every line distinguishable from its twin.
const DASH_LAPS: number[][] = [
  [6, 4],
  [2, 3],
];

export function seriesStyle(index: number): { color: string; dash?: number[] } {
  const lap = Math.floor(index / PALETTE.length);
  const color = PALETTE[index % PALETTE.length] ?? "#b5e1cd";
  return lap === 0 ? { color } : { color, dash: DASH_LAPS[(lap - 1) % DASH_LAPS.length] };
}

const QUARTER_ENDS: Record<string, number> = { "03-31": 1, "06-30": 2, "09-30": 3, "12-31": 4 };

// The period an observation covers, in the words of its cadence: "H1 2026",
// "Q3 2026", "FY 2025", "Oct 2026". Fiscal quarters that do not end on a
// calendar quarter keep their real end date.
export function formatPeriod(periodEnd: string, cadence: string) {
  const [y = "", m = "", d = ""] = periodEnd.slice(0, 10).split("-");
  const md = `${m}-${d}`;
  if (cadence === "semiannual" && (md === "06-30" || md === "12-31")) {
    return `${md === "06-30" ? "H1" : "H2"} ${y}`;
  }
  if (cadence === "annual") return `FY ${y}`;
  if (cadence === "quarterly") {
    const q = QUARTER_ENDS[md];
    return q ? `Q${q} ${y}` : `qtr to ${formatDate(periodEnd)}`;
  }
  if (cadence === "monthly") return `${MONTHS[Number(m) - 1]} ${y}`;
  return formatDate(periodEnd);
}

export function formatMonthYear(iso: string) {
  const [y = "", m = ""] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
