export function Notes() {
	return (
		<div className="notes">
			<div>
				<h2>How updates work</h2>
				<p>
					<b>Credit feeds:</b> run <code>pnpm data:refresh</code> to pull the
					two FRED series. A GitHub Action can do this on weekdays.{" "}
					<b>Research updates:</b> other indicators live in{" "}
					<code>data/observations.json</code>. Append only comparable,
					attributable observations. SEC filings are quarterly, CBRE is
					semiannual, and GPU contract/collateral data has no free standardized
					feed.
				</p>
			</div>
			<div>
				<h2>Methodology & limitations</h2>
				<p>
					"Leading" means possible predictive value for infrastructure financial
					distress, not market timing. FRED high-yield indices are{" "}
					<b>broad proxies</b>, not AI-specific bond spreads. GPU and finance
					series intentionally show no chart until verified measurements are
					entered. This is a research dashboard, not investment advice.
				</p>
			</div>
		</div>
	);
}
