import {
	filterWindow,
	formatValue,
	type Indicator,
	type Observation,
	type WindowDays,
} from "~/lib/indicators";
import { LineChart } from "./LineChart";

type Props = {
	indicator: Indicator;
	points: Observation[];
	window: WindowDays;
};

export function IndicatorCard({ indicator, points, window }: Props) {
	const visible = filterWindow(points, window);
	const latest = points.at(-1);

	return (
		<article className="card">
			<div className="cardhead">
				<div>
					<h2>{indicator.title}</h2>
					<div className="meta">{indicator.subtitle}</div>
				</div>
				<span className={`pill ${indicator.kind}`}>{indicator.tag}</span>
			</div>

			<div className="latest">
				<span className="detail">
					{latest
						? formatValue(latest.value, indicator.unit)
						: "NO VERIFIED SERIES"}
				</span>
				<span className="meta">{latest?.date ?? "Awaiting observations"}</span>
			</div>

			<div className="chartbox">
				{visible.length > 0 ? (
					<LineChart points={visible} unit={indicator.unit} />
				) : (
					<div className="no-data">
						<b>
							{points.length
								? "No observations in selected window"
								: "Historical collection not yet configured"}
						</b>
						<span>
							{points.length
								? "Choose All history to view the source snapshot."
								: "No fabricated data or interpolated trends."}
						</span>
					</div>
				)}
			</div>

			<div className="foot">
				<p>{indicator.caveat}</p>
				<a target="_blank" rel="noopener noreferrer" href={indicator.url}>
					{indicator.source} ↗
				</a>
			</div>
		</article>
	);
}
