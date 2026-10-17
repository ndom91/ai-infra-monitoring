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
import { Line } from "react-chartjs-2";
import { formatValue, PALETTE } from "~/lib/format";

Chart.register(TimeScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export type ChartLine = {
  label: string;
  points: { periodEnd: string; value: number; kind: string }[];
  color?: string;
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
};

const TICK = "#86969a";

export function TimeChart({ lines, unit, height = 220, stepped, rebase, minUnit = "day" }: Props) {
  const datasets = lines.map((line, i) => {
    const color = line.color ?? PALETTE[i % PALETTE.length] ?? "#b5e1cd";
    const base = line.points[0]?.value;
    const sparse = line.points.length < 40;
    return {
      label: line.label,
      data: line.points.map((p) => ({
        x: Date.parse(p.periodEnd),
        y: rebase && base ? (p.value / base) * 100 : p.value,
      })),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 1.6,
      // Derived/estimated points are drawn hollow so they are never
      // mistaken for reported figures.
      pointRadius: sparse ? 3.5 : 0,
      pointBackgroundColor: line.points.map((p) =>
        p.kind === "reported" || p.kind === "manual" ? color : "#0e1113",
      ),
      pointHoverRadius: 4,
      stepped: stepped ? ("before" as const) : false,
      tension: 0,
    };
  });

  return (
    <div className="chart" style={{ height }}>
      <Line
        data={{ datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          plugins: {
            legend: {
              display: lines.length > 1,
              position: "bottom",
              align: "start",
              labels: {
                color: TICK,
                boxWidth: 10,
                boxHeight: 2,
                font: { size: 11 },
              },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const p = lines[ctx.datasetIndex]?.points[ctx.dataIndex];
                  const v = rebase
                    ? `${ctx.parsed.y?.toFixed(1)} (index)`
                    : formatValue(ctx.parsed.y ?? 0, unit);
                  const kind = p && p.kind !== "reported" ? ` · ${p.kind}` : "";
                  return ` ${ctx.dataset.label}: ${v}${kind}`;
                },
              },
            },
          },
          scales: {
            x: {
              type: "time",
              time: { minUnit },
              ticks: { color: TICK, maxTicksLimit: 7, maxRotation: 0 },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: TICK,
                maxTicksLimit: 5,
                callback: (v) => (rebase ? String(v) : formatValue(Number(v), unit)),
              },
              grid: { color: "#252d2f" },
            },
          },
        }}
      />
    </div>
  );
}
