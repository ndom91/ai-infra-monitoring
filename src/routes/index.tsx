import { createFileRoute } from "@tanstack/react-router";
import { IndicatorCard } from "~/components/IndicatorCard";
import { Notes } from "~/components/Notes";
import { Overview } from "~/components/Overview";
import { WindowToolbar } from "~/components/WindowToolbar";
import { INDICATORS, WINDOWS, type WindowDays } from "~/lib/indicators";
import { getDataset } from "~/lib/observations";

function parseWindow(raw: unknown): WindowDays {
	const n = Number(raw);
	return WINDOWS.find((w) => w.days === n)?.days ?? 365;
}

export const Route = createFileRoute("/")({
	validateSearch: (search) => ({ window: parseWindow(search.window) }),
	loader: () => getDataset(),
	component: Dashboard,
});

function Dashboard() {
	const dataset = Route.useLoaderData();
	const { window } = Route.useSearch();
	const refreshed = new Date(dataset.generated_at).toLocaleString("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "UTC",
	});

	return (
		<div className="wrap">
			<header>
				<div>
					<div className="kicker">Independent research / AI capital cycle</div>
					<h1>
						Infrastructure Risk Monitor<span className="accent">.</span>
					</h1>
					<p>
						Eight indicators across GPU economics, credit, financial reporting,
						and physical supply.
					</p>
				</div>
				<div className="stamp">DATA REFRESHED · {refreshed} UTC</div>
			</header>

			<Overview dataset={dataset} />

			<div className="sectiontitle">
				<h2>Signal board</h2>
				<span>Trends are observations, not trading signals</span>
			</div>
			<p className="status">
				An empty chart means no reliable, comparable time series has been
				collected. Values are never synthesized to fill gaps.
			</p>
			<WindowToolbar active={window} />

			<div className="cards">
				{INDICATORS.map((indicator) => (
					<IndicatorCard
						key={indicator.id}
						indicator={indicator}
						points={dataset.series[indicator.id] ?? []}
						window={window}
					/>
				))}
			</div>

			<Notes />
		</div>
	);
}
