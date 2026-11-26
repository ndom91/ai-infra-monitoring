import type { Change } from "~/metrics/changes";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// A true minus sign (U+2212) instead of the ASCII hyphen.
const minus = (s: string) => (s.startsWith("-") ? `−${s.slice(1)}` : s);

// At most `digits` decimals, trailing zeros dropped.
const trimmed = (v: number, digits = 2) => minus(`${+v.toFixed(digits)}`);

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatValue(value: number, unit: string) {
  if (unit === "USD") return `${value < 0 ? "−" : ""}$${compact.format(Math.abs(value))}`;
  if (unit === "USD/GPU-hr") return `$${value.toFixed(2)}/hr`;
  if (unit === "%") return `${trimmed(value)}%`;
  if (unit === "count") return minus(whole.format(value));
  if (unit === "days") return `${minus(whole.format(value))} days`;
  if (unit === "MW") return `${minus(whole.format(value))} MW`;
  if (unit === "×") return minus(`${value.toFixed(2)}×`);
  const n = Math.abs(value) >= 1000 ? minus(compact.format(value)) : trimmed(value);
  return `${n} ${unit}`;
}

// Axis ticks save space: megawatts go compact ("10K MW") and days keep their
// decimals so a rounded tick never names a value the axis does not mark.
export function formatTick(value: number, unit: string) {
  if (unit === "MW") return `${minus(compact.format(value))} MW`;
  if (unit === "days") return `${trimmed(value)} days`;
  return formatValue(value, unit);
}

// Spreads and yields move in basis points; other % series in percentage points.
export function formatDelta(change: Change, unit: string, bps = false) {
  const sign = change.delta > 0 ? "+" : change.delta < 0 ? "−" : "±";
  const abs = Math.abs(change.delta);
  if (unit === "%") {
    return bps ? `${sign}${Math.round(abs * 100)} bps` : `${sign}${trimmed(abs)} pp`;
  }
  if (unit === "×") return `${sign}${abs.toFixed(2)}×`;
  if (change.pct == null) return `${sign}${formatValue(abs, unit)}`;
  return `${sign}${trimmed(Math.abs(change.pct * 100), 1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Built by hand: en-GB spells September "Sept" in newer browsers.
export function formatDate(iso: string) {
  const [y = "", m = "", d = ""] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// Day style plus a 24-hour UTC time: "20 Nov 2026, 14:05 UTC".
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `${formatDate(d.toISOString())}, ${time} UTC`;
}

// Series colours never use the signal hues (red, amber, green), so a line is
// never mistaken for a status. Every colour clears 3:1 on --surface.

// Emphasis, for one to three lines: the first is the subject in white, the
// rest are comparisons in fading greys.
export const EMPHASIS = ["#f2f2f2", "#8a8a92", "#66666d"];

// Categorical, for four or more lines of equal weight.
export const CATEGORICAL = [
  "#f2f2f2",
  "#8fb3ff",
  "#c4a7ff",
  "#6fd0d6",
  "#f29ac2",
  "#d9c39a",
  "#9a9aa0",
  "#7d8db8",
];

export type PaletteMode = "emphasis" | "categorical";

export function paletteFor(lineCount: number): PaletteMode {
  return lineCount >= 4 ? "categorical" : "emphasis";
}

// Past the end of the palette colours repeat, so each further lap gets a
// dash pattern to keep every line distinguishable from its twin.
const DASH_LAPS: number[][] = [
  [6, 4],
  [2, 3],
];

export function seriesStyle(
  index: number,
  mode: PaletteMode = "categorical",
): { color: string; dash?: number[] } {
  const palette = mode === "emphasis" ? EMPHASIS : CATEGORICAL;
  const lap = Math.floor(index / palette.length);
  const color = palette[index % palette.length] ?? "#f2f2f2";
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
