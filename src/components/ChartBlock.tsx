import type { Explainer } from "~/domain/explainers";
import type { Cadence } from "~/domain/types";
import type { PaletteMode } from "~/lib/format";
import type { SeriesView } from "~/server/data";
import { InfoTip } from "./InfoTip";
import { SeriesStats } from "./SeriesStats";
import { TimeChart } from "./TimeChart";

const LOW_FREQUENCY = new Set(["quarterly", "semiannual", "annual", "irregular"]);

type Props = {
  title: string;
  subtitle?: string;
  series: SeriesView[];
  stepped?: boolean;
  rebase?: boolean;
  // Shown instead of a chart when no series has data yet.
  emptyReason?: string;
  labelOf?: (s: SeriesView) => string;
  info?: Explainer;
  // Leave out the series table, when the page shows it elsewhere.
  stats?: boolean;
  // Bare numbers on the y-axis, for long units such as an index base.
  bareTicks?: boolean;
  height?: number;
  // Overrides the automatic choice; see TimeChart.
  palette?: PaletteMode;
};

export function ChartBlock({
  title,
  subtitle,
  series,
  stepped,
  rebase,
  emptyReason,
  labelOf = (s) => s.label,
  info,
  stats = true,
  bareTicks,
  height,
  palette,
}: Props) {
  const withData = series.filter((s) => s.points.length > 0);
  const units = new Set(series.map((s) => s.unit));
  return (
    // Two children, a head and a body, so charts in a row can share a head row.
    <div className="block">
      <div className="block-head">
        <h3>{title}</h3>
        {info && <InfoTip label={title} info={info} />}
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      <div className="block-body">
        {withData.length > 0 ? (
          <TimeChart
            unit={series[0]?.unit ?? ""}
            stepped={stepped}
            rebase={rebase || units.size > 1}
            minUnit={series.every((s) => LOW_FREQUENCY.has(s.cadence)) ? "month" : "day"}
            lines={withData.map((s) => ({
              label: labelOf(s),
              points: s.points,
              // A stepped line holds its value on purpose, so it has no gaps.
              cadence: stepped ? undefined : (s.cadence as Cadence),
            }))}
            bareTicks={bareTicks}
            height={height}
            palette={palette}
            ariaLabel={title}
          />
        ) : (
          <div className="no-data">
            {series.some((s) => s.latest) ? (
              <>
                <b>No observations in the selected range</b>
                <span>Try a longer range.</span>
              </>
            ) : (
              <>
                <b>No data collected yet</b>
                {emptyReason && <span>{emptyReason}</span>}
              </>
            )}
          </div>
        )}
        {stats && series.length > 0 && <SeriesStats series={series} />}
      </div>
    </div>
  );
}
