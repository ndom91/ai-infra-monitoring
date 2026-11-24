import type { Explainer } from "~/domain/explainers";
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
}: Props) {
  const withData = series.filter((s) => s.points.length > 0);
  const units = new Set(series.map((s) => s.unit));
  return (
    <div className="block">
      <div className="block-head">
        <h3>{title}</h3>
        {info && <InfoTip label={title} info={info} />}
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      {withData.length > 0 ? (
        <TimeChart
          unit={series[0]?.unit ?? ""}
          stepped={stepped}
          rebase={rebase || units.size > 1}
          minUnit={series.every((s) => LOW_FREQUENCY.has(s.cadence)) ? "month" : "day"}
          lines={withData.map((s) => ({ label: labelOf(s), points: s.points }))}
          bareTicks={bareTicks}
        />
      ) : (
        <div className="no-data">
          <b>
            {series.length ? "No observations in the selected range" : "No series collected yet"}
          </b>
          <span>
            {emptyReason ?? "Values are never synthesized to fill gaps. Try a longer range."}
          </span>
        </div>
      )}
      {stats && series.length > 0 && <SeriesStats series={series} />}
    </div>
  );
}
