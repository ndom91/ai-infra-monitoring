import {
	CategoryScale,
	Chart,
	Filler,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { Observation } from "~/lib/indicators";

Chart.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
);

const TICK = "#86969a";

export function LineChart({
	points,
	unit,
}: {
	points: Observation[];
	unit: string;
}) {
	return (
		<Line
			data={{
				labels: points.map((p) => p.date),
				datasets: [
					{
						data: points.map((p) => p.value),
						borderColor: "#b5e1cd",
						backgroundColor: "rgba(181,225,205,.09)",
						borderWidth: 2,
						// Sparse seeded series need visible dots; dense FRED series don't.
						pointRadius: points.length < 10 ? 4 : 0,
						pointHoverRadius: 5,
						tension: 0.15,
						fill: true,
					},
				],
			}}
			options={{
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: "index", intersect: false },
				plugins: {
					tooltip: {
						callbacks: { label: (ctx) => `${ctx.parsed.y} ${unit}` },
					},
				},
				scales: {
					x: {
						ticks: { color: TICK, maxTicksLimit: 6 },
						grid: { display: false },
					},
					y: {
						ticks: { color: TICK, maxTicksLimit: 5 },
						grid: { color: "#293234" },
					},
				},
			}}
		/>
	);
}
