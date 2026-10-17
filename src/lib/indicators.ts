export type Observation = {
	date: string;
	value: number;
	source: string;
	entity?: string;
};

export type Dataset = {
	generated_at: string;
	series: Record<string, Observation[]>;
};

export type SignalKind = "leading" | "mixed" | "lag";

export type Indicator = {
	id: string;
	title: string;
	subtitle: string;
	tag: string;
	kind: SignalKind;
	unit: string;
	source: string;
	url: string;
	caveat: string;
};

const SEC_SEARCH = "https://www.sec.gov/edgar/search/";
const CBRE_H1_2026 =
	"https://www.cbre.com/insights/books/north-america-data-center-trends-h1-2026";

export const INDICATORS: Indicator[] = [
	{
		id: "credit_hy",
		title: "01 / Credit market stress",
		subtitle: "US high-yield option-adjusted spread · %",
		tag: "Leading / coincident",
		kind: "mixed",
		unit: "%",
		source: "FRED: HY OAS",
		url: "https://fred.stlouisfed.org/series/BAMLH0A0HYM2",
		caveat: "Broad financing-stress proxy; not specific to AI infrastructure.",
	},
	{
		id: "credit_ccc",
		title: "01b / Distressed credit",
		subtitle: "US CCC & lower option-adjusted spread · %",
		tag: "Leading",
		kind: "leading",
		unit: "%",
		source: "FRED: CCC OAS",
		url: "https://fred.stlouisfed.org/series/BAMLH0A3HYC",
		caveat:
			"Weakest-credit tier widens first when lenders pull back from risky borrowers.",
	},
	{
		id: "gpu_rental",
		title: "02 / GPU rental economics",
		subtitle: "H100-equivalent hourly spot rental · USD",
		tag: "Leading",
		kind: "leading",
		unit: "$/h",
		source: "Vast.ai marketplace",
		url: "https://vast.ai/pricing",
		caveat:
			"Needs a repeatable, normalized GPU basket; no trustworthy backfilled feed yet.",
	},
	{
		id: "gpu_resale",
		title: "03 / GPU collateral value",
		subtitle: "Used H100 liquidation estimate · USD",
		tag: "Leading",
		kind: "leading",
		unit: "$",
		source: "Dealer / auction transaction data",
		url: "https://www.ebay.com/sch/i.html?_nkw=nvidia+h100+80gb",
		caveat: "Dealer asks are not completed transactions or lender appraisals.",
	},
	{
		id: "capex_ocf",
		title: "04 / Capital intensity",
		subtitle: "Company capex / operating cash flow · multiple",
		tag: "Leading",
		kind: "leading",
		unit: "×",
		source: "SEC company filings",
		url: SEC_SEARCH,
		caveat:
			"Issuer-specific data must separate leased assets and cash purchases.",
	},
	{
		id: "customer_concentration",
		title: "05 / Customer concentration",
		subtitle: "Largest reported customer share of revenue · %",
		tag: "Leading",
		kind: "leading",
		unit: "%",
		source: "SEC concentration disclosures",
		url: SEC_SEARCH,
		caveat:
			"Comparable issuer/period tagging required; revenue quality differs by contract.",
	},
	{
		id: "preleased",
		title: "06 / Pipeline & preleasing",
		subtitle: "Under-construction capacity preleased · %",
		tag: "Leading",
		kind: "leading",
		unit: "%",
		source: "CBRE H1 2026",
		url: CBRE_H1_2026,
		caveat: "8 primary North American markets.",
	},
	{
		id: "construction",
		title: "06b / Construction pipeline",
		subtitle: "Primary-market capacity under construction · MW",
		tag: "Leading",
		kind: "leading",
		unit: "MW",
		source: "CBRE H1 2026",
		url: CBRE_H1_2026,
		caveat: "2025 value is derived from CBRE's reported 24.8% YoY growth.",
	},
	{
		id: "vacancy",
		title: "07 / Physical utilization",
		subtitle: "Data-center vacancy · %",
		tag: "Lagging / coincident",
		kind: "lag",
		unit: "%",
		source: "CBRE H1 2026",
		url: CBRE_H1_2026,
		caveat: "Vacancy can be distorted by delays in power delivery.",
	},
	{
		id: "realized_backlog",
		title: "08 / Contract conversion",
		subtitle: "Recognized revenue / prior contracted backlog · %",
		tag: "Mixed / lagging",
		kind: "mixed",
		unit: "%",
		source: "SEC revenue & RPO notes",
		url: SEC_SEARCH,
		caveat:
			"Requires issuer-specific backlog cohorts and consistent recognition periods.",
	},
	{
		id: "depreciation_life",
		title: "Bonus / Accounting asset life",
		subtitle: "Estimated useful life · years (selected Meta hardware)",
		tag: "Structural",
		kind: "lag",
		unit: "yrs",
		source: "Meta FY2024 release",
		url: "https://investor.atmeta.com/investor-news/press-release-details/2025/Meta-Reports-Fourth-Quarter-and-Full-Year-2024-Results/",
		caveat: "Accounting useful life ≠ market resale value; not GPU-specific.",
	},
];

export const WINDOWS = [
	{ days: 90, label: "90 days" },
	{ days: 365, label: "1 year" },
	{ days: 0, label: "All history" },
] as const;

export type WindowDays = (typeof WINDOWS)[number]["days"];

const DAY_MS = 86_400_000;

// days === 0 means "all history".
export function filterWindow(points: Observation[], days: WindowDays) {
	if (days === 0) return points;
	const cutoff = Date.now() - days * DAY_MS;
	return points.filter((p) => Date.parse(p.date) >= cutoff);
}

export function formatValue(value: number, unit: string) {
	return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;
}
