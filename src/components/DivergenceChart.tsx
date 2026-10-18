import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";
import { formatValue, PALETTE } from "~/lib/format";
import type { DivergenceLine } from "~/server/overview";
// Registers the chart.js components shared with TimeChart.
import "./TimeChart";

const TICK = "#86969a";

// Two series, each on its own axis and in its own unit: no rebasing, so a
// negative or near-zero starting value can't distort the picture.
export function DivergenceChart({ lines }: { lines: DivergenceLine[] }) {
  const [a, b] = lines;
  if (!a || !b) return null;
  const axis = (line: DivergenceLine, position: "left" | "right", color: string) => ({
    position,
    ticks: {
      color,
      maxTicksLimit: 5,
      // Long units ("index (H1 2025 = 100)") would crowd the axis; the legend names them.
      callback: (v: string | number) =>
        line.unit.length > 10 ? `${+Number(v).toFixed(2)}` : formatValue(Number(v), line.unit),
    },
    grid: { color: position === "left" ? "#252d2f" : "transparent" },
  });
  const ds = (line: DivergenceLine, yAxisID: string, color: string) => ({
    label: line.label,
    yAxisID,
    data: line.points.map((p) => ({ x: Date.parse(p.periodEnd), y: p.value })),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 1.6,
    pointRadius: line.points.length < 40 ? 3 : 0,
    tension: 0,
  });
  const ca = PALETTE[0] ?? "#b5e1cd";
  const cb = PALETTE[1] ?? "#f5c69c";
  return (
    <div className="chart" style={{ height: 200 }}>
      <Line
        data={{ datasets: [ds(a, "y", ca), ds(b, "y1", cb)] }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              align: "start",
              labels: { color: TICK, boxWidth: 10, boxHeight: 2, font: { size: 11 } },
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.dataset.label}: ${formatValue(ctx.parsed.y ?? 0, (ctx.datasetIndex === 0 ? a : b).unit)}`,
              },
            },
          },
          scales: {
            x: {
              type: "time",
              time: { minUnit: "month", tooltipFormat: "d MMM yyyy" },
              ticks: { color: TICK, maxTicksLimit: 6, maxRotation: 0 },
              grid: { display: false },
            },
            y: axis(a, "left", ca),
            y1: axis(b, "right", cb),
          },
        }}
      />
    </div>
  );
}
