import "chartjs-adapter-date-fns";
import {
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  type ScriptableLineSegmentContext,
  TimeScale,
  Tooltip,
} from "chart.js";
import { type CSSProperties, useRef } from "react";
import { Line } from "react-chartjs-2";
import type { Cadence } from "~/domain/types";
import { formatTick, formatValue, type PaletteMode, paletteFor, seriesStyle } from "~/lib/format";
import { ChartLegend } from "./ChartLegend";
import { GRID, TICK, timeAxis } from "./chartAxis";
import { chartData, flagStepChanges, type GapPoint, hasGap, wrapText } from "./chartGaps";
import { HOLLOW, LINE_WIDTH } from "./chartTheme";
import { isDerivedKind, sortTooltipDescending } from "./chartTooltip";

Chart.register(TimeScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export type ChartLine = {
  label: string;
  // `kind` is left out for reported points to keep payloads small.
  points: { periodEnd: string; value: number; kind?: string; note?: string | null }[];
  color?: string;
  // Lets the chart leave a break where observations are missing. Without it
  // consecutive points are always joined.
  cadence?: Cadence;
};

type Props = {
  lines: ChartLine[];
  unit: string;
  height?: number;
  // Holds the last value until the next observation (useful-life changes, etc).
  stepped?: boolean;
  // Rebase every line to 100 at its first visible point, for comparing trends.
  rebase?: boolean;
  // Coarsest tick unit worth showing; quarterly data should never get day ticks.
  minUnit?: "day" | "month";
  bareTicks?: boolean;
  // Emphasis (subject first, comparisons in grey) or categorical colours.
  // Defaults to categorical from four lines up.
  palette?: PaletteMode;
  // The chart's accessible name; a canvas has no text of its own.
  ariaLabel: string;
};

export { GRID, TICK };

const DEFAULT_HEIGHT = 220;

const GAP_DASH = [3, 4];

export function TimeChart({
  lines,
  unit,
  height = DEFAULT_HEIGHT,
  stepped,
  rebase,
  minUnit = "day",
  bareTicks,
  palette = paletteFor(lines.length),
  ariaLabel,
}: Props) {
  const chartRef = useRef<Chart<"line"> | null>(null);
  const datasets = lines.map((line, i) => {
    const style = seriesStyle(i, palette);
    const color = line.color ?? style.color;
    const dash = line.color ? undefined : style.dash;
    const base = line.points[0]?.value;
    const sparse = line.points.length < 40;
    const data = chartData(line.points, line.cadence, (p) =>
      rebase && base ? (p.value / base) * 100 : p.value,
    );
    return {
      label: line.label,
      // Stepped lines get a marker only where the value changes.
      data: stepped ? flagStepChanges(data) : data,
      dash,
      borderColor: color,
      backgroundColor: color,
      borderWidth: LINE_WIDTH,
      borderDash: dash ?? [],
      // Derived/estimated points are drawn hollow so they are never
      // mistaken for reported figures.
      pointRadius: stepped
        ? (ctx: { raw: unknown }) => ((ctx.raw as GapPoint | undefined)?.marker ? 3.5 : 0)
        : sparse
          ? 3.5
          : 0,
      pointBackgroundColor: (ctx: { raw: unknown }) =>
        isDerivedKind((ctx.raw as GapPoint | undefined)?.kind) ? HOLLOW : color,
      pointHoverRadius: 4,
      stepped: stepped ? ("before" as const) : false,
      tension: 0,
      // A null point marks periods with no report. The line crosses them
      // dashed, so the gap is visible and nothing is drawn as if reported.
      spanGaps: true,
      segment: {
        borderDash: (ctx: ScriptableLineSegmentContext) =>
          ctx.p0.skip || ctx.p1.skip ? GAP_DASH : undefined,
      },
      gap: hasGap(data),
    };
  });

  const legend = datasets.map((d) => ({ label: d.label, color: d.borderColor, dash: d.dash }));

  return (
    <>
      <div
        className="chart"
        style={
          {
            "--chart-h": `${height}px`,
            // Phones shorten charts; a taller chart keeps most of its extra height.
            ...(height > DEFAULT_HEIGHT && { "--chart-h-phone": `${height - 40}px` }),
          } as CSSProperties
        }
      >
        <Line
          ref={chartRef}
          role="img"
          aria-label={ariaLabel}
          data={{ datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "nearest", axis: "x", intersect: false },
            plugins: {
              // Drawn as HTML below the chart; see ChartLegend.
              legend: { display: false },
              tooltip: {
                itemSort: sortTooltipDescending,
                callbacks: {
                  // One line needs no series name: the chart title says it.
                  label: (ctx) => {
                    const kind = (ctx.raw as GapPoint | undefined)?.kind;
                    const v = rebase
                      ? `${ctx.parsed.y?.toFixed(1)} (index)`
                      : formatValue(ctx.parsed.y ?? 0, unit);
                    const suffix = isDerivedKind(kind) ? ` · ${kind}` : "";
                    const text =
                      lines.length > 1 ? `${ctx.dataset.label}: ${v}${suffix}` : `${v}${suffix}`;
                    return wrapText(text).map((l) => ` ${l}`);
                  },
                  // A derived point says how it was worked out.
                  afterLabel: (ctx) => {
                    const p = ctx.raw as GapPoint | undefined;
                    return isDerivedKind(p?.kind) && p?.note ? wrapText(p.note) : [];
                  },
                },
              },
            },
            scales: {
              x: timeAxis(minUnit),
              y: {
                ticks: {
                  color: TICK,
                  maxTicksLimit: 5,
                  callback: (v) => (rebase || bareTicks ? String(v) : formatTick(Number(v), unit)),
                },
                grid: { color: GRID },
              },
            },
          }}
        />
      </div>
      {lines.length > 1 && <ChartLegend items={legend} chartRef={chartRef} />}
      {datasets.some((d) => d.gap) ? (
        <p className="chart-gap-note">Dashed: no value for that period. Nothing is filled in.</p>
      ) : null}
    </>
  );
}
