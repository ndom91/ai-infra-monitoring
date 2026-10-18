import { createFileRoute, Link } from "@tanstack/react-router";
import { DivergenceChart } from "~/components/DivergenceChart";
import { InfoTip } from "~/components/InfoTip";
import { type KeyFigure, KeyFigures } from "~/components/KeyFigures";
import { StoryChart } from "~/components/StoryChart";
import { TimeChart } from "~/components/TimeChart";
import { EXPLAINERS, type Explainer } from "~/domain/explainers";
import { monthYear, shortDate, usd } from "~/domain/narrative";
import { formatDate } from "~/lib/format";
import { changeOver, type Point } from "~/metrics/changes";
import { getOverviewData } from "~/server/overview";

const DIVERGENCE_INFO: Record<string, Explainer> = {
  rental_vs_capex: EXPLAINERS.divRentalCapex,
  spreads_vs_backlog: EXPLAINERS.divSpreadsBacklog,
  collateral_vs_debt: EXPLAINERS.divCollateralDebt,
  construction_vs_preleasing: EXPLAINERS.divConstructionPreleasing,
  lives_vs_cash: EXPLAINERS.divLivesFcf,
};

export const Route = createFileRoute("/")({
  loader: () => getOverviewData(),
  component: Home,
});

const reported = (points: Point[]) => points.map((p) => ({ ...p, kind: "reported" }));
const calculated = (points: Point[]) => points.map((p) => ({ ...p, kind: "calculated" }));

function keyFigures(story: ReturnType<typeof Route.useLoaderData>["story"]): KeyFigure[] {
  const out: KeyFigure[] = [];
  // Only compare with a real point within 3 weeks of a year earlier.
  const yearChange = (pts: Point[]) => changeOver(pts, 365, 21);

  const spread = (label: string, pts: Point[]) => {
    const last = pts.at(-1);
    if (!last) return;
    const y = yearChange(pts);
    out.push({
      label,
      value: `${last.value.toFixed(2)}%`,
      note: `${shortDate(last.periodEnd)}${y ? ` · ${y.delta >= 0 ? "+" : "−"}${Math.round(Math.abs(y.delta) * 100)} bps` : ""}`,
      change: y?.pct ?? null,
    });
  };
  spread("Riskiest-company borrowing premium (CCC)", story.credit.ccc);
  spread("Junk-bond borrowing premium", story.credit.hy);

  const capex = story.capex.capexTtm.at(-1);
  if (capex) {
    out.push({
      label: "Big tech capex, last 12 months",
      value: usd(capex.value).replace(" billion", "B").replace(" trillion", "T"),
      note: `to ${shortDate(capex.periodEnd)}`,
      change: yearChange(story.capex.capexTtm)?.pct ?? null,
    });
  }
  const h100 = story.rental.aws.at(-1);
  if (h100) {
    out.push({
      label: "Nvidia H100 on AWS",
      value: `$${h100.value.toFixed(2)}`,
      note: `per GPU-hour, list price · ${shortDate(h100.periodEnd)}`,
      change: yearChange(story.rental.aws)?.pct ?? null,
    });
  }
  const vac = story.buildings.vacancy.at(-1);
  if (vac) {
    out.push({
      label: "Empty data-center space",
      value: `${vac.value.toFixed(1)}%`,
      note: `North America primary markets · ${monthYear(vac.periodEnd)}`,
      change: yearChange(story.buildings.vacancy)?.pct ?? null,
    });
  }
  return out;
}

const SECTIONS = [
  { id: "borrowing", label: "Borrowing costs" },
  { id: "spending", label: "The spending" },
  { id: "compute", label: "The price of computing" },
  { id: "buildings", label: "The buildings" },
  { id: "warnings", label: "Warning signs" },
];

function Home() {
  const { story, alerts, divergences } = Route.useLoaderData();
  const capexNow = story.capex.capexTtm.at(-1);

  return (
    <div className="story">
      <section className="story-hero">
        <div className="story-intro">
          <h1>Is the AI build-out running ahead of itself?</h1>
          <p>
            Artificial intelligence runs on data centers packed with specialized chips called GPUs.
            Building them has become one of the largest investment waves in modern history.
            {capexNow
              ? ` The five biggest tech companies alone spent ${usd(capexNow.value)} on buildings and equipment in the past year, much of it for AI.`
              : ""}
          </p>
          <p>
            Railways in the 1800s and fiber-optic networks in the late 1990s changed the world, yet
            bankrupted many of the companies that built them. Too much capacity was built with
            borrowed money, on equipment that aged quickly. AI could prove transformative and still
            follow the same path.
          </p>
          <p>
            This page tracks the early signs: what it costs to borrow, how much is being spent, what
            computing power sells for, and whether the buildings fill up. Every figure comes from a
            public source and links back to it. Nothing is estimated to fill gaps.
          </p>
          <p className="story-updated">Research, not investment advice</p>
          <nav className="story-jump" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}>
                {s.label}
              </a>
            ))}
          </nav>
        </div>
        <aside className="story-aside">
          <h2>Latest warning signs</h2>
          {alerts.length === 0 ? (
            <p className="muted">No alert rules have fired.</p>
          ) : (
            <ul>
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className={`sev-${a.severity}`}>
                  <span className="aside-date">{formatDate(a.triggeredAt)}</span>
                  {a.evidence.params.description ?? a.message}
                </li>
              ))}
            </ul>
          )}
          <Link to="/alerts" className="more">
            All alerts →
          </Link>
        </aside>
      </section>

      <KeyFigures items={keyFigures(story)} />

      <section id="borrowing" className="story-section">
        <h2>Borrowing costs</h2>
        <p className="story-lede">
          Most AI data centers are paid for at least partly with borrowed money. The cost of that
          money shows up first in the "spread": the extra interest a company pays compared with the
          US government. When lenders get nervous, spreads widen, and the most indebted companies
          feel it first.
        </p>
        <div className="story-grid one">
          <StoryChart
            story={story.credit.story}
            fallbackTitle="Credit spreads"
            dek="Extra interest over US Treasuries, percentage points"
            source="Source: ICE BofA US High Yield and CCC & Lower option-adjusted spreads, via FRED. Daily."
            info={EXPLAINERS.hySpreads}
          >
            <TimeChart
              unit="%"
              height={260}
              lines={[
                { label: "CCC-rated (riskiest)", points: reported(story.credit.ccc) },
                { label: "All junk-rated", points: reported(story.credit.hy) },
              ]}
            />
          </StoryChart>
        </div>
        <Link to="/credit" search={{ range: "3y" }} className="more">
          More on credit →
        </Link>
      </section>

      <section id="spending" className="story-section">
        <h2>The spending</h2>
        <p className="story-lede">
          Data centers and the chips inside them are paid for out of "capital expenditure", or
          capex. The big tech companies fund it mostly from their own cash. Newer specialist AI
          clouds fund it mostly with debt. Both are worth watching, for different reasons.
        </p>
        <div className="story-grid">
          <StoryChart
            story={story.capex.story}
            fallbackTitle="Big tech capital spending"
            dek="Microsoft, Alphabet, Amazon, Meta, Oracle · 12-month totals"
            source="Source: company 10-Q and 10-K filings via SEC EDGAR. Quarterly; 12-month totals calculated."
            info={EXPLAINERS.capexIntensityHyper}
          >
            <TimeChart
              unit="USD"
              lines={[
                { label: "Capital spending", points: calculated(story.capex.capexTtm) },
                { label: "Free cash flow after it", points: calculated(story.capex.fcfTtm) },
              ]}
              minUnit="month"
            />
          </StoryChart>
          <StoryChart
            story={story.neocloud.story}
            fallbackTitle="CoreWeave spending"
            dek="CoreWeave · 12-month totals"
            source="Source: CoreWeave 10-Q and 10-K filings via SEC EDGAR. 12-month totals calculated."
            info={EXPLAINERS.capexIntensityNeo}
          >
            <TimeChart
              unit="USD"
              lines={[
                { label: "Capital spending", points: calculated(story.neocloud.capexTtm) },
                { label: "Cash from operations", points: calculated(story.neocloud.ocfTtm) },
              ]}
              minUnit="month"
            />
          </StoryChart>
        </div>
        <Link to="/fundamentals" search={{ range: "5y", company: "CRWV" }} className="more">
          More on company finances →
        </Link>
      </section>

      <section id="compute" className="story-section">
        <h2>The price of computing</h2>
        <p className="story-lede">
          If too much capacity gets built, the price of renting a GPU, and of reselling a used one,
          should fall. Both matter: rental prices are what these data centers earn, and used-chip
          values are what lenders can recover if a borrower fails.
        </p>
        <div className="story-grid">
          <StoryChart
            story={story.rental.story}
            fallbackTitle="GPU rental prices"
            dek="Nvidia H100, list price per GPU per hour"
            source="Source: AWS Price List (us-east-1, monthly history) and Azure Retail Prices (eastus2). List prices exclude negotiated discounts."
            info={EXPLAINERS.gpuListPrice}
          >
            <TimeChart
              unit="USD/GPU-hr"
              stepped
              lines={[
                { label: "AWS on-demand", points: calculated(story.rental.aws) },
                { label: "Azure on-demand", points: calculated(story.rental.azure) },
              ]}
            />
          </StoryChart>
          <StoryChart
            story={story.resale.story}
            fallbackTitle="Used GPU prices"
            dek="Resale index of used data-center GPUs · early 2025 = 100"
            source="Source: American Compute GPU Resale Index, entered by hand with attribution. Monthly."
            info={EXPLAINERS.gpuResale}
          >
            <TimeChart
              unit="index"
              lines={[{ label: "Resale index", points: reported(story.resale.index) }]}
            />
          </StoryChart>
        </div>
        <Link to="/market" search={{ range: "3y" }} className="more">
          More on GPU prices →
        </Link>
      </section>

      <section id="buildings" className="story-section">
        <h2>The buildings</h2>
        <p className="story-lede">
          The final test is whether finished data centers fill up. Real-estate brokers report how
          much space is empty, how much is being built, and how much of it is already leased.
        </p>
        <div className="story-grid one">
          <StoryChart
            story={story.buildings.story}
            fallbackTitle="Data-center space"
            dek="North America primary markets · each line has its own scale"
            source="Source: CBRE North America Data Center Trends, half-yearly. Entered by hand with a quote from each report."
            info={EXPLAINERS.vacancy}
          >
            <DivergenceChart
              lines={[
                {
                  label: "Under construction (MW)",
                  unit: "MW",
                  points: story.buildings.construction,
                },
                { label: "Vacancy", unit: "%", points: story.buildings.vacancy },
              ]}
            />
          </StoryChart>
        </div>
        <Link to="/infrastructure" search={{ range: "max" }} className="more">
          More on data-center supply →
        </Link>
      </section>

      <section id="warnings" className="story-section">
        <h2>Warning signs</h2>
        <p className="story-lede">
          A single chart rarely tells you much. The pattern to look for is two things pulling apart:
          spending still rising while prices fall, or debt growing while the collateral behind it
          loses value. Each pair below puts two series side by side, each on its own scale. These
          are observations, not proof of cause.
        </p>
        <div className="story-grid">
          {divergences.map((d) => (
            <figure key={d.id} className="story-chart">
              <div className="story-chart-head">
                <h3>{d.title}</h3>
                <InfoTip label={d.title} info={DIVERGENCE_INFO[d.id] ?? EXPLAINERS.infraGeneric} />
              </div>
              <p className="story-dek">Watch for: {d.pattern}</p>
              {d.awaiting ? (
                <div className="no-data">
                  <b>Awaiting data</b>
                  <span>{d.awaiting}</span>
                </div>
              ) : (
                <DivergenceChart lines={d.lines} />
              )}
              {d.note && <figcaption className="story-source">{d.note}</figcaption>}
            </figure>
          ))}
        </div>
        <Link to="/coverage" className="more">
          What this monitor can and cannot see →
        </Link>
      </section>
    </div>
  );
}
