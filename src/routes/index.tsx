import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Chapter, ChapterCharts, type ChapterDef, ChapterHeader } from "~/components/Chapters";
import { DivergenceChart } from "~/components/DivergenceChart";
import { InfoTip } from "~/components/InfoTip";
import { RiskRead } from "~/components/RiskRead";
import { StepNav, type StepTile } from "~/components/StepNav";
import { StoryChart } from "~/components/StoryChart";
import { TimeChart } from "~/components/TimeChart";
import { EXPLAINERS, type Explainer } from "~/domain/explainers";
import { type Freshness, freshnessSuffix } from "~/domain/freshness";
import { homeFigures, usdShort } from "~/domain/narrative";
import { formatDate, formatValue } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import type { Point } from "~/metrics/changes";
import { getOverviewData } from "~/server/overview";
import { Route as RootRoute } from "./__root";

const DIVERGENCE_INFO: Record<string, Explainer> = {
  rental_vs_capex: EXPLAINERS.divRentalCapex,
  spreads_vs_backlog: EXPLAINERS.divSpreadsBacklog,
  collateral_vs_debt: EXPLAINERS.divCollateralDebt,
  construction_vs_preleasing: EXPLAINERS.divConstructionPreleasing,
  lives_vs_cash: EXPLAINERS.divLivesFcf,
};

// The steps each warning-sign pair compares.
const DIVERGENCE_STEPS: Record<string, string> = {
  rental_vs_capex: "Rent out × Build",
  spreads_vs_backlog: "Borrow × Build",
  collateral_vs_debt: "Rent out × Borrow",
  construction_vs_preleasing: "Fill",
  lives_vs_cash: "Build",
};

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "/",
      "AI Infrastructure Risk Research",
      "Tracking the balance sheet behind the AI build-out.",
    ),
  loader: () => getOverviewData(),
  component: Home,
});

const calculated = (points: Point[]) => points.map((p) => ({ ...p, kind: "calculated" }));

// Homepage chapters reuse the detail-page header; they carry no status dot.
const chapter = (slug: string, label: string): ChapterDef => ({
  slug,
  label,
  sub: "",
  signal: "context",
});
const CHAPTERS = {
  borrow: chapter("borrowing", "Borrow"),
  build: chapter("spending", "Build"),
  rent: chapter("compute", "Rent out"),
  fill: chapter("buildings", "Fill"),
  strain: chapter("warnings", "Where the chain strains"),
};
const TOTAL = 5;

// "More on credit →", then the detail page's own chapters.
function MoreLink({ children, sections }: { children: ReactNode; sections?: ReactNode }) {
  return (
    <p className="more-row">
      {children}
      {sections ? <span className="more-sections">{sections}</span> : null}
    </p>
  );
}

function Home() {
  const { story, divergences, riskRead, steps, freshness } = Route.useLoaderData();
  const lastUpdated = RootRoute.useLoaderData();
  const figures = homeFigures(story, freshness);

  const ccc = story.credit.ccc.at(-1);
  const capex = story.capex.capexTtm.at(-1);
  const aws = story.rental.aws.at(-1);
  const vacancy = story.buildings.vacancy.at(-1);
  // Each tile says which period its figure is from, and when that is not current.
  const dated = (text: string, p: Point, state: Freshness | undefined, span = "") =>
    `${text} · ${span}${formatDate(p.periodEnd)}${freshnessSuffix(state)}`;
  const tiles: StepTile[] = [
    {
      id: "borrowing",
      verb: "Borrow",
      description: "Lenders fund the build-out",
      figure: ccc ? formatValue(ccc.value, "%") : null,
      metric: ccc ? dated("extra interest, riskiest borrowers", ccc, freshness.ccc) : "",
      status: steps.borrow,
    },
    {
      id: "spending",
      verb: "Build",
      description: "Companies spend it on data centers",
      figure: capex ? usdShort(capex.value) : null,
      metric: capex ? dated("big tech capex", capex, freshness.capex, "12 months to ") : "",
      status: steps.build,
    },
    {
      id: "compute",
      verb: "Rent out",
      description: "The chips have to earn it back",
      figure: aws ? `$${aws.value.toFixed(2)}` : null,
      metric: aws ? dated("Nvidia H100 on AWS, per GPU-hour", aws, freshness.aws) : "",
      status: steps.rent,
    },
    {
      id: "buildings",
      verb: "Fill",
      description: "Finished buildings need tenants",
      figure: vacancy ? formatValue(vacancy.value, "%") : null,
      metric: vacancy ? dated("data-center space sitting empty", vacancy, freshness.vacancy) : "",
      status: steps.fill,
    },
  ];

  return (
    <div className="story">
      <section className="story-hero">
        <div className="story-intro">
          <h1>Is the AI build-out running ahead of itself?</h1>
          <p>
            Building AI data centers is one of the largest investment waves in modern history.
            Railways and fiber-optic networks changed the world too, and bankrupted many of the
            companies that built them: too much was built, with borrowed money, on equipment that
            aged fast.
          </p>
          <p>
            This page follows the money through four steps. Trouble at any one of them travels down
            the chain.
          </p>
        </div>
        <aside className="hero-aside">
          <RiskRead read={riskRead} updated={lastUpdated} />
        </aside>
      </section>

      <StepNav steps={tiles} />

      <div className="home-chapters">
        <Chapter chapter={CHAPTERS.borrow}>
          <ChapterHeader
            index={1}
            total={TOTAL}
            chapter={CHAPTERS.borrow}
            meta="Daily · FRED"
            question="Is money getting more expensive for the riskiest borrowers?"
            watchFor="spreads widening for the weakest borrowers first. They are usually the first to be cut off."
            stats={figures.borrow}
          />
          <ChapterCharts one>
            <StoryChart
              story={story.credit.story}
              fallbackTitle="Credit spreads"
              dek="Extra interest over US Treasuries, percentage points"
              source="Source: ICE BofA bond indexes, via FRED. Updated daily."
              info={EXPLAINERS.hySpreads}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="%"
                  height={260}
                  lines={[
                    {
                      label: "CCC-rated (riskiest)",
                      points: story.credit.ccc,
                      cadence: "weekdays",
                    },
                    { label: "All junk-rated", points: story.credit.hy, cadence: "weekdays" },
                  ]}
                />
              )}
            </StoryChart>
          </ChapterCharts>
          <MoreLink
            sections={[
              ["market", "Market stress"],
              ["rates", "Rate backdrop"],
              ["issued", "What AI companies pay"],
              ["bycompany", "Debt by company"],
            ].map(([hash, label]) => (
              <Link key={hash} to="/credit" search={{ range: "3y", company: "CRWV" }} hash={hash}>
                {label}
              </Link>
            ))}
          >
            <Link to="/credit" search={{ range: "3y", company: "CRWV" }} className="more">
              More on credit →
            </Link>
          </MoreLink>
        </Chapter>

        <Chapter chapter={CHAPTERS.build}>
          <ChapterHeader
            index={2}
            total={TOTAL}
            chapter={CHAPTERS.build}
            meta="Quarterly · SEC"
            question="Is the spending still paid for out of cash?"
            watchFor="capex running ahead of the cash the business brings in, which leaves lenders to fill the gap."
            stats={figures.build}
          />
          <ChapterCharts>
            <StoryChart
              story={story.capex.story}
              fallbackTitle="Big tech capital spending"
              dek="Microsoft, Alphabet, Amazon, Meta, Oracle · 12-month totals"
              source="Source: company filings via SEC EDGAR. Quarterly; 12-month totals are calculated."
              info={EXPLAINERS.capexIntensityHyper}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="USD"
                  lines={[
                    {
                      label: "Capital spending",
                      points: calculated(story.capex.capexTtm),
                      cadence: "quarterly",
                    },
                    {
                      label: "Free cash flow after it",
                      points: calculated(story.capex.fcfTtm),
                      cadence: "quarterly",
                    },
                  ]}
                  minUnit="month"
                />
              )}
            </StoryChart>
            <StoryChart
              story={story.neocloud.story}
              fallbackTitle="CoreWeave spending"
              dek="CoreWeave · 12-month totals"
              source="Source: CoreWeave filings via SEC EDGAR. 12-month totals are calculated."
              info={EXPLAINERS.capexIntensityNeo}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="USD"
                  lines={[
                    {
                      label: "Capital spending",
                      points: calculated(story.neocloud.capexTtm),
                      cadence: "quarterly",
                    },
                    {
                      label: "Cash from operations",
                      points: calculated(story.neocloud.ocfTtm),
                      cadence: "quarterly",
                    },
                  ]}
                  minUnit="month"
                />
              )}
            </StoryChart>
          </ChapterCharts>
          <MoreLink
            sections={[
              ["peers", "Across peers"],
              ["cash", "Cash & spending"],
              ["orders", "Order book"],
              ["customers", "Customers"],
              ["insiders", "Insider sales"],
              ["depreciation", "Depreciation"],
            ].map(([hash, label]) => (
              <Link
                key={hash}
                to="/fundamentals"
                search={{ range: "5y", company: "CRWV" }}
                hash={hash}
              >
                {label}
              </Link>
            ))}
          >
            <Link to="/fundamentals" search={{ range: "5y", company: "CRWV" }} className="more">
              More on company finances →
            </Link>
          </MoreLink>
        </Chapter>

        <Chapter chapter={CHAPTERS.rent}>
          <ChapterHeader
            index={3}
            total={TOTAL}
            chapter={CHAPTERS.rent}
            meta="Weekly and monthly"
            question="Is the price of computing holding up?"
            watchFor="rental and resale prices falling together. Rental prices are what data centers earn; used-chip values are what lenders can recover."
            stats={figures.rent}
          />
          <ChapterCharts>
            <StoryChart
              story={story.rental.story}
              fallbackTitle="GPU rental prices"
              dek="Nvidia H100 · per GPU per hour: machine list price ÷ GPUs · calculated"
              source="Source: AWS and Azure public price lists, US East. List prices exclude negotiated discounts."
              info={EXPLAINERS.gpuListPrice}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="USD/GPU-hr"
                  stepped
                  lines={[
                    { label: "AWS on-demand", points: calculated(story.rental.aws) },
                    { label: "Azure on-demand", points: calculated(story.rental.azure) },
                  ]}
                />
              )}
            </StoryChart>
            <StoryChart
              story={story.resale.story}
              fallbackTitle="Used GPU prices"
              dek="Resale index of used data-center GPUs · H1 2025 = 100"
              source="Source: American Compute GPU Resale Index, entered by hand with credit. Monthly."
              info={EXPLAINERS.gpuResale}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="index"
                  lines={[
                    { label: "Resale index", points: story.resale.index, cadence: "monthly" },
                  ]}
                />
              )}
            </StoryChart>
          </ChapterCharts>
          <MoreLink>
            <Link to="/market" search={{ range: "3y" }} className="more">
              More on GPU prices →
            </Link>
          </MoreLink>
        </Chapter>

        <Chapter chapter={CHAPTERS.fill}>
          <ChapterHeader
            index={4}
            total={TOTAL}
            chapter={CHAPTERS.fill}
            meta="Half-yearly · CBRE"
            question="Are finished data centers finding tenants?"
            watchFor="vacancy rising from its low while construction is still climbing, or less new space being leased in advance."
            stats={figures.fill}
          />
          <ChapterCharts>
            <StoryChart
              story={story.buildings.story}
              fallbackTitle="Data-center vacancy"
              dek="Vacancy, %"
              source="Source: CBRE North America Data Center Trends, half-yearly. Entered by hand with a quote from each report."
              info={EXPLAINERS.vacancy}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="%"
                  minUnit="month"
                  lines={[
                    { label: "Vacancy", points: story.buildings.vacancy, cadence: "semiannual" },
                  ]}
                />
              )}
            </StoryChart>
            <StoryChart
              story={story.buildings.constructionStory}
              fallbackTitle="Capacity under construction"
              dek="Under construction, MW"
              source="Source: CBRE North America Data Center Trends, half-yearly. Entered by hand with a quote from each report."
              info={EXPLAINERS.construction}
            >
              {(title) => (
                <TimeChart
                  ariaLabel={title}
                  unit="MW"
                  minUnit="month"
                  lines={[
                    {
                      label: "Under construction",
                      points: story.buildings.construction,
                      cadence: "semiannual",
                    },
                  ]}
                />
              )}
            </StoryChart>
          </ChapterCharts>
          <MoreLink
            sections={(
              [
                ["supply", "Supply being built"],
                ["space", "Space available"],
                ["rent", "Rents"],
                ["power", "Power backdrop"],
              ] as const
            ).map(([topic, label]) => (
              <Link
                key={topic}
                to="/infrastructure"
                search={{ range: "max", topic, publisher: "cbre" }}
              >
                {label}
              </Link>
            ))}
          >
            <Link
              to="/infrastructure"
              search={{ range: "max", topic: "supply", publisher: "cbre" }}
              className="more"
            >
              More on data-center supply →
            </Link>
          </MoreLink>
        </Chapter>

        <Chapter chapter={CHAPTERS.strain}>
          <ChapterHeader
            index={5}
            total={TOTAL}
            chapter={CHAPTERS.strain}
            question="Are two steps pulling apart?"
            lede="Each pair sets one step against another, each line on its own scale. They show what happened, not why."
          />
          <div className="strain-grid">
            {divergences.map((d) => (
              <figure key={d.id} className="story-chart">
                <div className="story-chart-top">
                  {DIVERGENCE_STEPS[d.id] ? (
                    <p className="strain-tag">{DIVERGENCE_STEPS[d.id]}</p>
                  ) : null}
                  <div className="story-chart-head">
                    <h3>{d.title}</h3>
                    <InfoTip
                      label={d.title}
                      info={DIVERGENCE_INFO[d.id] ?? EXPLAINERS.infraGeneric}
                    />
                  </div>
                  <p className="story-dek">Watch for: {d.pattern}</p>
                </div>
                <div className="story-chart-body">
                  {d.awaiting ? (
                    <div className="no-data">
                      <b>No data collected yet</b>
                      <span>{d.awaiting}</span>
                    </div>
                  ) : (
                    <DivergenceChart lines={d.lines} ariaLabel={d.title} />
                  )}
                  {d.note && <figcaption className="story-source">{d.note}</figcaption>}
                </div>
              </figure>
            ))}
          </div>
          <MoreLink>
            <Link to="/coverage" className="more">
              What this monitor can and cannot see →
            </Link>
          </MoreLink>
        </Chapter>
      </div>
    </div>
  );
}
