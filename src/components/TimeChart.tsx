import "chartjs-adapter-date-fns";
import {
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from "chart.js";
import { type CSSProperties, useRef } from "react";
import { Line } from "react-chartjs-2";
import type { Cadence } from "~/domain/types";
import { formatValue, seriesStyle } from "~/lib/format";
import { ChartLegend } from "./ChartLegend";
import { GRID, TICK, timeAxis } from "./chartAxis";
import { chartData, flagStepChanges, type GapPoint } from "./chartGaps";
import { isDerivedKind, sortTooltipDescending } from "./chartTooltip";

Chart.register(TimeScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export type ChartLine = {
  label: string;
  // `kind` is left out for reported points to keep payloads small.
  points: { periodEnd: string; value: number; kind?: string }[];
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
};

export { GRID, TICK };

const DEFAULT_HEIGHT = 220;

export function TimeChart({
  lines,
  unit,
  height = DEFAULT_HEIGHT,
  stepped,
  rebase,
  minUnit = "day",
  bareTicks,
}: Props) {
  const chartRef = useRef<Chart<"line"> | null>(null);
  const datasets = lines.map((line, i) => {
    const style = seriesStyle(i);
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
      borderWidth: 1.6,
      borderDash: dash ?? [],
      // Derived/estimated points are drawn hollow so they are never
      // mistaken for reported figures.
      pointRadius: stepped
        ? (ctx: { raw: unknown }) => ((ctx.raw as GapPoint | undefined)?.marker ? 3.5 : 0)
        : sparse
          ? 3.5
          : 0,
      pointBackgroundColor: (ctx: { raw: unknown }) =>
        isDerivedKind((ctx.raw as GapPoint | undefined)?.kind) ? "#0e1113" : color,
      pointHoverRadius: 4,
      stepped: stepped ? ("before" as const) : false,
      tension: 0,
      // A null point is a real hole in the data, not something to bridge.
      spanGaps: false,
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
                  label: (ctx) => {
                    const kind = (ctx.raw as GapPoint | undefined)?.kind;
                    const v = rebase
                      ? `${ctx.parsed.y?.toFixed(1)} (index)`
                      : formatValue(ctx.parsed.y ?? 0, unit);
                    const suffix = isDerivedKind(kind) ? ` · ${kind}` : "";
                    return ` ${ctx.dataset.label}: ${v}${suffix}`;
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
                  callback: (v) => (rebase || bareTicks ? String(v) : formatValue(Number(v), unit)),
                },
                grid: { color: GRID },
              },
            },
          }}
        />
      </div>
      {lines.length > 1 && <ChartLegend items={legend} chartRef={chartRef} />}
    </>
  );
}
