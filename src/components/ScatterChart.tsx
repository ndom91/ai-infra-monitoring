import "chartjs-adapter-date-fns";
import { Chart, Legend, LinearScale, PointElement, TimeScale, Tooltip } from "chart.js";
import { type CSSProperties, useRef } from "react";
import { Scatter } from "react-chartjs-2";
import { formatDate } from "~/lib/format";
import { ChartLegend } from "./ChartLegend";
import { GRID, TICK, timeAxis } from "./chartAxis";
import { HOLLOW } from "./chartTheme";

Chart.register(TimeScale, LinearScale, PointElement, Tooltip, Legend);

export type ScatterPoint = { date: string; value: number; title: string; display: string };

export type ScatterSeries = {
  label: string;
  color: string;
  // Hollow points mark a different measure (a margin, not a coupon).
  hollow?: boolean;
  points: ScatterPoint[];
};

// One dot per event on a time axis; shares TimeChart's ticks, grid and tooltip.
export function ScatterChart({
  series,
  height = 300,
  ariaLabel,
}: {
  series: ScatterSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const chartRef = useRef<Chart<"scatter"> | null>(null);
  const datasets = series.map((s) => ({
    label: s.label,
    data: s.points.map((p) => ({ x: Date.parse(p.date), y: p.value })),
    borderColor: s.color,
    backgroundColor: s.hollow ? HOLLOW : s.color,
    borderWidth: s.hollow ? 1.6 : 0,
    pointRadius: 5,
    pointHoverRadius: 6,
  }));
  return (
    <>
      <div className="chart" style={{ "--chart-h": `${height}px` } as CSSProperties}>
        <Scatter
          ref={chartRef}
          aria-label={ariaLabel}
          role="img"
          data={{ datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              // Drawn as HTML below the chart; see ChartLegend.
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const p = series[items[0]?.datasetIndex ?? 0]?.points[items[0]?.dataIndex ?? 0];
                    return p ? p.title : "";
                  },
                  label: (ctx) => {
                    const p = series[ctx.datasetIndex]?.points[ctx.dataIndex];
                    return p ? ` ${p.display} · issued ${formatDate(p.date)}` : "";
                  },
                },
              },
            },
            scales: {
              x: timeAxis("month"),
              y: {
                beginAtZero: true,
                ticks: { color: TICK, maxTicksLimit: 6, callback: (v) => `${v}%` },
                grid: { color: GRID },
              },
            },
          }}
        />
      </div>
      <ChartLegend
        items={series.map((s) => ({
          label: s.label,
          color: s.color,
          shape: "dot",
          hollow: s.hollow,
        }))}
        chartRef={chartRef}
      />
    </>
  );
}
