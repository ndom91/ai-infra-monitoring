import { type Dataset, formatValue, INDICATORS } from "~/lib/indicators";

export function Overview({ dataset }: { dataset: Dataset }) {
	const filled = INDICATORS.filter(
		(i) => (dataset.series[i.id]?.length ?? 0) > 0,
	).length;
	const liveFeeds = ["credit_hy", "credit_ccc"].filter(
		(id) => (dataset.series[id]?.length ?? 0) > 0,
	).length;
	const vacancy = dataset.series.vacancy?.at(-1);

	return (
		<div className="overview">
			<Stat
				label="Indicators"
				value="08"
				note="Plus structural asset-life card"
			/>
			<Stat
				label="Live credit feeds"
				value={liveFeeds ? `${liveFeeds} feeds` : "Pending"}
				note="FRED / ICE BofA"
			/>
			<Stat
				label="Coverage"
				value={`${filled}/${INDICATORS.length}`}
				note="Series with observations"
			/>
			<Stat
				label="Latest market vacancy"
				value={vacancy ? formatValue(vacancy.value, "%").replace(" ", "") : "—"}
				note={vacancy ? `CBRE · ${vacancy.date}` : "No observations"}
			/>
		</div>
	);
}

function Stat({
	label,
	value,
	note,
}: {
	label: string;
	value: string;
	note: string;
}) {
	return (
		<div className="stat">
			<small>{label}</small>
			<strong>{value}</strong>
			<small>{note}</small>
		</div>
	);
}
