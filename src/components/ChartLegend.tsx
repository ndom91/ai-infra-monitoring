import { type CSSProperties, type RefObject, useReducer } from "react";

export type LegendItem = {
  label: string;
  color: string;
  // A short line for line charts, a dot for scatter charts.
  shape?: "line" | "dot";
  // Drawn as a ring, matching a series whose points are hollow.
  hollow?: boolean;
};

// The part of a Chart.js instance the legend drives.
type Toggleable = {
  isDatasetVisible(index: number): boolean;
  setDatasetVisibility(index: number, visible: boolean): void;
  update(): void;
};

// Lives in HTML under the canvas instead of inside it, so long labels wrap,
// a dozen series cannot squeeze the plot, and charts side by side keep the
// same plot height. Each item still hides or shows its dataset on click, as
// the Chart.js legend does.
export function ChartLegend({
  items,
  chartRef,
}: {
  items: LegendItem[];
  chartRef: RefObject<Toggleable | null | undefined>;
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Two series may share a label; number repeats so keys stay unique.
  const seen = new Map<string, number>();
  const keys = items.map((item) => {
    const n = (seen.get(item.label) ?? 0) + 1;
    seen.set(item.label, n);
    return `${item.label}#${n}`;
  });
  return (
    <ul className="chart-legend">
      {items.map((item, i) => {
        // Read from the chart, so the legend cannot drift from what is drawn.
        const visible = chartRef.current?.isDatasetVisible(i) ?? true;
        return (
          <li key={keys[i]}>
            <button
              type="button"
              className="chart-legend-item"
              aria-pressed={visible}
              onClick={() => {
                const chart = chartRef.current;
                if (!chart) return;
                chart.setDatasetVisibility(i, !chart.isDatasetVisible(i));
                chart.update();
                redraw();
              }}
            >
              <span
                className={`chart-legend-swatch ${item.shape ?? "line"}${item.hollow ? " hollow" : ""}`}
                style={{ "--swatch": item.color } as CSSProperties}
                aria-hidden="true"
              />
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
