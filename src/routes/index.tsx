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
import { homeFigures, usdShort } from "~/domain/narrative";
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

const reported = (points: Point[]) => points.map((p) => ({ ...p, kind: "reported" }));
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
  const { story, divergences, riskRead, steps } = Route.useLoaderData();
  const lastUpdated = RootRoute.useLoaderData();
  const figures = homeFigures(story);

  const ccc = story.credit.ccc.at(-1);
  const capex = story.capex.capexTtm.at(-1);
  const aws = story.rental.aws.at(-1);
  const vacancy = story.buildings.vacancy.at(-1);
  const tiles: StepTile[] = [
    {
      id: "borrowing",
      verb: "Borrow",
      description: "Lenders fund the build-out",
      figure: ccc ? `${ccc.value.toFixed(2)}%` : null,
      metric: "extra interest, riskiest borrowers",
      status: steps.borrow,
    },
    {
      id: "spending",
      verb: "Build",
      description: "Companies spend it on data centers",
      figure: capex ? usdShort(capex.value) : null,
      metric: "big tech capex, 12 months",
      status: steps.build,
    },
    {
      id: "compute",
      verb: "Rent out",
      description: "The chips have to earn it back",
      figure: aws ? `$${aws.value.toFixed(2)}` : null,
      metric: "Nvidia H100 on AWS, per GPU-hour",
      status: steps.rent,
    },
    {
      id: "buildings",
      verb: "Fill",
      description: "Finished buildings need tenants",
      figure: vacancy ? `${vacancy.value.toFixed(1)}%` : null,
      metric: "data-center space sitting empty",
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
          <RiskRead read={riskRead} variant="compact" updated={lastUpdated} />
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
              <TimeChart
                unit="%"
                height={260}
                lines={[
                  { label: "CCC-rated (riskiest)", points: reported(story.credit.ccc) },
                  { label: "All junk-rated", points: reported(story.credit.hy) },
                ]}
              />
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
              dek="Nvidia H100, list price per GPU per hour"
              source="Source: AWS and Azure public price lists, US East. List prices exclude negotiated discounts."
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
              source="Source: American Compute GPU Resale Index, entered by hand with credit. Monthly."
              info={EXPLAINERS.gpuResale}
            >
              <TimeChart
                unit="index"
                lines={[{ label: "Resale index", points: reported(story.resale.index) }]}
              />
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
              <TimeChart
                unit="%"
                minUnit="month"
                lines={[{ label: "Vacancy", points: reported(story.buildings.vacancy) }]}
              />
            </StoryChart>
            <StoryChart
              story={story.buildings.constructionStory}
              fallbackTitle="Capacity under construction"
              dek="Under construction, MW"
              source="Source: CBRE North America Data Center Trends, half-yearly. Entered by hand with a quote from each report."
              info={EXPLAINERS.construction}
            >
              <TimeChart
                unit="MW"
                minUnit="month"
                lines={[
                  { label: "Under construction", points: reported(story.buildings.construction) },
                ]}
              />
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
