import { createFileRoute } from "@tanstack/react-router";
import {
  Chapter,
  ChapterCharts,
  type ChapterDef,
  ChapterHeader,
  ChapterLayout,
  ChapterMore,
} from "~/components/Chapters";
import { ChartBlock } from "~/components/ChartBlock";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { IndicatorNotes } from "~/components/IndicatorNotes";
import { PageIntro } from "~/components/PageIntro";
import { PriceLadder } from "~/components/PriceLadder";
import { SeriesStats } from "~/components/SeriesStats";
import { freshnessNote, latestChangeStat, type Stat } from "~/components/StatList";
import { EXPLAINERS } from "~/domain/explainers";
import { indicatorById } from "~/domain/indicators";
import {
  type Cohort,
  offerLabel,
  priceLadder,
  priceRange,
  priceSpread,
  rentalCohorts,
} from "~/domain/market";
import { parseRange } from "~/domain/ranges";
import { formatDate, formatMonthYear } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import { getSectionData, type SeriesView } from "~/server/data";

export const Route = createFileRoute("/market")({
  head: () =>
    pageHead(
      "/market",
      "GPU Market",
      "Track public GPU rental and resale prices across major cloud providers.",
    ),
  validateSearch: (s) => ({ range: parseRange(s.range, "3y") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) =>
    getSectionData({ data: { indicators: ["gpu_rental", "gpu_resale"], range: deps.range } }),
  component: MarketPage,
});

const LIST_PRICE_NOTE =
  "These are published list prices, not what customers actually pay after discounts.";

const pctChange = (label: string, c: { pct: number | null } | null | undefined): Stat => ({
  label,
  value: c?.pct == null ? null : `${c.pct > 0 ? "+" : "−"}${Math.abs(c.pct * 100).toFixed(1)}%`,
  note: c?.pct == null ? "No comparable earlier value" : "calculated",
});

// The provider code inside an id: "aws.h100.us-east-1.ondemand" -> "h100".
const cohortCode = (c: Cohort<SeriesView>) => c.series[0]?.id.split(".")[1] ?? "";
const findOffer = (c: Cohort<SeriesView>, provider: string, type: string) =>
  c.series.find((s) => s.id.startsWith(`${provider}.`) && s.id.endsWith(`.${type}`));

function StaleLine({ series }: { series: SeriesView[] }) {
  const notCurrent = series.filter((s) => s.freshness !== "current");
  if (notCurrent.length === 0) return null;
  const states = [...new Set(notCurrent.map((s) => s.freshness))];
  return (
    <p className="chapter-notice stale-line">
      {states.map((st) => (
        <FreshnessBadge key={st} state={st} />
      ))}{" "}
      {notCurrent.length} of {series.length} series {notCurrent.length === 1 ? "is" : "are"} not
      current. The table below gives each one's latest date.
    </p>
  );
}

function CohortCharts({ cohorts, subtitle }: { cohorts: Cohort<SeriesView>[]; subtitle: string }) {
  return (
    <ChapterCharts>
      {cohorts.map((c) => (
        <ChartBlock
          key={c.entity}
          title={`${c.entity}: price per GPU-hour`}
          info={EXPLAINERS.gpuListPrice}
          subtitle={subtitle}
          series={c.series}
          labelOf={offerLabel}
          stepped
          stats={false}
          emptyReason="No price data collected yet."
        />
      ))}
    </ChapterCharts>
  );
}

function SeriesTables({ series }: { series: SeriesView[] }) {
  if (series.length === 0) return null;
  return (
    <ChapterMore
      summary={`Show the ${series.length} series behind these charts: latest price, date observed, change and freshness`}
    >
      <div className="block">
        <SeriesStats series={series} />
      </div>
    </ChapterMore>
  );
}

function MarketPage() {
  const { series } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const cohorts = rentalCohorts(series.filter((s) => s.indicator === "gpu_rental"));
  const datacenter = cohorts.filter((c) => c.kind === "datacenter");
  const consumer = cohorts.filter((c) => c.kind === "consumer");
  const resale = series.filter((s) => s.indicator === "gpu_resale");
  const index = resale[0];
  const dcSeries = datacenter.flatMap((c) => c.series);
  const consumerSeries = consumer.flatMap((c) => c.series);
  const chips = (list: Cohort<SeriesView>[]) => list.map((c) => c.chip).join(", ");

  const dc: ChapterDef = {
    slug: "datacenter",
    label: "Data-center GPUs",
    sub: chips(datacenter) || "No cohorts yet",
    signal: "context",
  };
  const spread: ChapterDef = {
    slug: "spread",
    label: "The spread",
    sub: "Same chip, different sellers",
    signal: "context",
  };
  const cons: ChapterDef = {
    slug: "consumer",
    label: "Consumer-grade GPUs",
    sub: chips(consumer) || "No cohorts yet",
    signal: "context",
  };
  const used: ChapterDef = {
    slug: "used",
    label: "Used GPUs",
    sub: "Resale index · monthly",
    signal: "context",
  };
  const chapters = [dc, spread, cons, used];

  const h100 = datacenter.find((c) => cohortCode(c) === "h100");
  const listStats: Stat[] = [
    ...datacenter.map((c) =>
      latestChangeStat(`Nvidia ${c.chip} on AWS`, findOffer(c, "aws", "ondemand")),
    ),
    latestChangeStat("Nvidia H100 on Azure", h100 && findOffer(h100, "azure", "ondemand")),
  ];

  const ladders = datacenter.map((c) => ({ cohort: c, rows: priceLadder(c.series) }));
  const spreadStats: Stat[] = ladders.flatMap(({ cohort, rows }) => {
    const sp = priceSpread(rows);
    if (!sp) return [];
    return [
      {
        label: `${cohort.chip}: ${sp.cheapest.label} vs ${sp.dearest.label}`,
        value: `−${Math.abs(sp.gap * 100).toFixed(0)}%`,
        note: `$${sp.cheapest.price.toFixed(2)} vs $${sp.dearest.price.toFixed(2)} · calculated`,
      },
    ];
  });

  const consumerStats: Stat[] = consumer.map((c) => {
    const r = priceRange(priceLadder(c.series));
    const label = `${c.chip}, cheapest to dearest`;
    if (!r) return { label, value: null, note: "No observations collected yet" };
    return {
      label,
      value: r.text,
      note: `per GPU-hour · ${r.count} published prices · ${formatDate(r.oldest)}`,
    };
  });

  const resaleStats: Stat[] = [
    {
      label: "Resale index",
      value: index?.latest ? index.latest.value.toFixed(0) : null,
      note: index?.latest
        ? `${formatMonthYear(index.latest.periodEnd)} · early 2025 = 100${freshnessNote(index)}`
        : "No observations collected yet",
    },
    pctChange("Change in six months", index?.changes?.m6),
    pctChange("Change in a year", index?.changes?.y1),
  ];

  return (
    <>
      <PageIntro
        eyebrow="Market"
        title="What does it cost to rent a GPU, and what is a used one worth?"
        range={range}
      >
        Four chapters: the chips AI data centers are built on, how far prices spread for the same
        chip, the consumer-grade end of the market, and what used chips resell for.
      </PageIntro>
      <ChapterLayout chapters={chapters} note={LIST_PRICE_NOTE}>
        <Chapter chapter={dc}>
          <ChapterHeader
            index={1}
            total={4}
            chapter={dc}
            meta="List prices"
            question="Is renting a top data-center GPU getting cheaper?"
            watchFor="list-price cuts on the big clouds. They move rarely and in steps, so each one matters."
            stats={listStats}
          />
          <StaleLine series={dcSeries} />
          <CohortCharts
            cohorts={datacenter}
            subtitle="Machine list price divided by the GPUs in it"
          />
          <p className="chapter-source">
            Source: AWS Price List and Azure Retail Prices, plus smaller providers' published rates.
            List prices exclude negotiated discounts.
          </p>
          <SeriesTables series={dcSeries} />
          <IndicatorNotes def={indicatorById("gpu_rental")} />
        </Chapter>

        <Chapter chapter={spread}>
          <ChapterHeader
            index={2}
            total={4}
            chapter={spread}
            meta="Latest prices"
            question="How much cheaper is the same chip away from the on-demand list price?"
            watchFor="the gap between on-demand, spot and smaller providers widening. A wide gap can mean capacity is going spare."
            stats={spreadStats}
          />
          <ChapterCharts>
            {ladders.map(({ cohort, rows }) => (
              <PriceLadder
                key={cohort.entity}
                title={`${cohort.entity}, cheapest first`}
                rows={rows}
              />
            ))}
          </ChapterCharts>
        </Chapter>

        <Chapter chapter={cons}>
          <ChapterHeader
            index={3}
            total={4}
            chapter={cons}
            meta="Published hourly prices"
            question="What do consumer-grade GPUs rent for?"
            watchFor="priority tiers moving together."
            stats={consumerStats}
          />
          <StaleLine series={consumerSeries} />
          <CohortCharts
            cohorts={consumer}
            subtitle="Published hourly price; priority tiers remain separate"
          />
          <p className="chapter-source">
            Source: published hourly prices from each provider. Priority tiers stay separate and are
            never averaged.
          </p>
          <SeriesTables series={consumerSeries} />
        </Chapter>

        <Chapter chapter={used}>
          <ChapterHeader
            index={4}
            total={4}
            chapter={used}
            meta="Monthly"
            question="What is a used data-center GPU worth?"
            watchFor="resale values falling faster than loans are repaid. These GPUs often secure the loans that paid for them."
            stats={resaleStats}
          />
          {index?.latest && index.freshness !== "current" ? (
            <p className="chapter-notice stale-line">
              <FreshnessBadge state={index.freshness} /> Latest observation is{" "}
              {formatDate(index.latest.periodEnd)}. The index is published monthly and entered by
              hand.
            </p>
          ) : null}
          <ChapterCharts one>
            <ChartBlock
              title="Used GPU prices"
              info={EXPLAINERS.gpuResale}
              subtitle="Published index, entered by hand with a citation"
              series={resale}
              bareTicks
              emptyReason="No used-GPU price index we're allowed to use yet. The Coverage page explains why."
            />
          </ChapterCharts>
          <IndicatorNotes def={indicatorById("gpu_resale")} />
        </Chapter>
      </ChapterLayout>
    </>
  );
}
