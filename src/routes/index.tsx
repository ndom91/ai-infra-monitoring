import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DivergenceChart } from "~/components/DivergenceChart";
import { InfoTip } from "~/components/InfoTip";
import { type KeyFigure, KeyFigures } from "~/components/KeyFigures";
import { RiskRead } from "~/components/RiskRead";
import { StoryChart } from "~/components/StoryChart";
import { TimeChart } from "~/components/TimeChart";
import { EXPLAINERS, type Explainer } from "~/domain/explainers";
import { monthYear, shortDate, usd } from "~/domain/narrative";
import { formatDate } from "~/lib/format";
import { changeOver, type Point } from "~/metrics/changes";
import { getOverviewData } from "~/server/overview";
import { Route as RootRoute } from "./__root";

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
      signal: "worsening",
      interpretation: "Higher borrowing costs increase refinancing pressure.",
      change: y?.pct ?? null,
    });
  };
  spread("Borrowing cost, riskiest companies", story.credit.ccc);
  spread("Borrowing cost, all junk-rated", story.credit.hy);

  const capex = story.capex.capexTtm.at(-1);
  if (capex) {
    out.push({
      label: "Big tech capex, last 12 months",
      value: usd(capex.value).replace(" billion", "B").replace(" trillion", "T"),
      note: `to ${shortDate(capex.periodEnd)}`,
      signal: "mixed",
      interpretation: "Spending is accelerating; cash generation still funds it.",
      change: yearChange(story.capex.capexTtm)?.pct ?? null,
    });
  }
  const h100 = story.rental.aws.at(-1);
  if (h100) {
    out.push({
      label: "Nvidia H100 on AWS",
      value: `$${h100.value.toFixed(2)}`,
      note: `per GPU-hour, list price · ${shortDate(h100.periodEnd)}`,
      signal: "mixed",
      interpretation: "Cheaper hardware may reflect competition or newer chips.",
      change: yearChange(story.rental.aws)?.pct ?? null,
    });
  }
  const vac = story.buildings.vacancy.at(-1);
  if (vac) {
    out.push({
      label: "Empty data-center space",
      value: `${vac.value.toFixed(1)}%`,
      note: `Main North American markets · ${monthYear(vac.periodEnd)}`,
      signal: "reassuring",
      interpretation: "Low vacancy indicates current supply is still tight.",
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

function StorySection({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="story-section">
      <div className="story-section-intro">
        <h2>{title}</h2>
        <p className="story-lede">{lede}</p>
      </div>
      <div className="story-section-content">{children}</div>
    </section>
  );
}

function Home() {
  const { story, divergences, riskRead } = Route.useLoaderData();
  const lastUpdated = RootRoute.useLoaderData();
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
            Railways in the 1800s and fiber-optic networks in the 1990s changed the world. They also
            bankrupted many of the companies that built them: too much was built, with borrowed
            money, on equipment that aged fast. AI could change the world and still follow the same
            path.
          </p>
          <p>
            This page tracks the early warning signs. Every figure links to its public source, and
            nothing is estimated to fill gaps.
          </p>
          <p className="story-updated">
            Research, not investment advice
            {lastUpdated && (
              <>
                <span className="story-meta-separator" aria-hidden="true">
                  ·
                </span>
                Updated {formatDate(lastUpdated)}
              </>
            )}
          </p>
          <nav className="story-jump" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}>
                {s.label}
              </a>
            ))}
          </nav>
        </div>
        <aside className="story-aside">
          <RiskRead read={riskRead} />
        </aside>
      </section>

      <KeyFigures items={keyFigures(story)} />

      <StorySection
        id="borrowing"
        title="Borrowing costs"
        lede={
          <>
            Most AI data centers are built at least partly with borrowed money. The key number is
            the "spread": the extra interest a company pays over the US government. When lenders get
            nervous, spreads widen, and the most indebted companies feel it first.
          </>
        }
      >
        <div className="story-grid one">
          <StoryChart
            story={story.credit.story}
            fallbackTitle="Credit spreads"
            dek="Extra interest over US Treasuries, percentage points"
            source="Source: ICE BofA bond indexes, via FRED. Updated daily."
            info={EXPLAINERS.hySpreads}
            signal="Worsening: the weakest borrowers are paying sharply more while the broad junk market is near average."
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
      </StorySection>

      <StorySection
        id="spending"
        title="The spending"
        lede={
          <>
            Data centers and the chips inside them are paid for out of "capital expenditure", or
            capex. The big tech companies fund it mostly from their own cash. Newer specialist AI
            clouds, or neoclouds, fund it mostly with debt. Both are worth watching, for different
            reasons.
          </>
        }
      >
        <div className="story-grid">
          <StoryChart
            story={story.capex.story}
            fallbackTitle="Big tech capital spending"
            dek="Microsoft, Alphabet, Amazon, Meta, Oracle · 12-month totals"
            source="Source: company filings via SEC EDGAR. Quarterly; 12-month totals are calculated."
            info={EXPLAINERS.capexIntensityHyper}
            signal="Mixed: spending is climbing rapidly, but the group still produces positive free cash flow."
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
            source="Source: CoreWeave filings via SEC EDGAR. 12-month totals are calculated."
            info={EXPLAINERS.capexIntensityNeo}
            signal="Worsening: investment exceeds operating cash flow, increasing dependence on lenders."
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
      </StorySection>

      <StorySection
        id="compute"
        title="The price of computing"
        lede={
          <>
            If too much capacity gets built, the price of renting a GPU, and of reselling a used
            one, should fall. Both matter: rental prices are what these data centers earn, and
            used-chip values are what lenders can recover if a borrower fails.
          </>
        }
      >
        <div className="story-grid">
          <StoryChart
            story={story.rental.story}
            fallbackTitle="GPU rental prices"
            dek="Nvidia H100, list price per GPU per hour"
            source="Source: AWS and Azure public price lists, US East. List prices exclude negotiated discounts."
            info={EXPLAINERS.gpuListPrice}
            signal="Mixed: price cuts can point to weaker economics, but newer hardware can produce the same pattern."
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
            source="Source: American Compute GPU Resale Index, entered by hand with credit. Monthly."
            info={EXPLAINERS.gpuResale}
            signal="Worsening: falling resale values reduce the collateral supporting GPU-backed borrowing."
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
      </StorySection>

      <StorySection
        id="buildings"
        title="The buildings"
        lede={
          <>
            The final test is whether finished data centers fill up. Real-estate brokers report how
            much space is empty, how much is being built, and how much of it is already leased.
          </>
        }
      >
        <div className="story-grid one">
          <StoryChart
            story={story.buildings.story}
            fallbackTitle="Data-center space"
            dek="Main North American markets · each line has its own scale"
            source="Source: CBRE North America Data Center Trends, half-yearly. Entered by hand with a quote from each report."
            info={EXPLAINERS.vacancy}
            signal="Reassuring now: vacancy remains low and most new capacity is already leased."
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
      </StorySection>

      <StorySection
        id="warnings"
        title="Warning signs"
        lede={
          <>
            One chart alone rarely tells you much. The pattern to watch is two things pulling apart:
            spending still rising while prices fall, or debt growing while what backs it loses
            value. Each pair below shows two lines, each on its own scale. They show what happened,
            not why.
          </>
        }
      >
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
      </StorySection>
    </div>
  );
}
