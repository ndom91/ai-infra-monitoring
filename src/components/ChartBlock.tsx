import type { SeriesView } from "~/server/data";
import { SeriesStats } from "./SeriesStats";
import { TimeChart } from "./TimeChart";

type Props = {
  title: string;
  subtitle?: string;
  series: SeriesView[];
  stepped?: boolean;
  rebase?: boolean;
  // Shown instead of a chart when no series has data yet.
  emptyReason?: string;
  labelOf?: (s: SeriesView) => string;
};

export function ChartBlock({
  title,
  subtitle,
  series,
  stepped,
  rebase,
  emptyReason,
  labelOf = (s) => s.label,
}: Props) {
  const withData = series.filter((s) => s.points.length > 0);
  const units = new Set(series.map((s) => s.unit));
  return (
    <div className="block">
      <div className="block-head">
        <h3>{title}</h3>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      {withData.length > 0 ? (
        <TimeChart
          unit={series[0]?.unit ?? ""}
          stepped={stepped}
          rebase={rebase || units.size > 1}
          lines={withData.map((s) => ({ label: labelOf(s), points: s.points }))}
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
      {series.length > 0 && <SeriesStats series={series} />}
    </div>
  );
}
