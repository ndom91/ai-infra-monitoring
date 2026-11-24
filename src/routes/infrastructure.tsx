import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorNotes } from "~/components/IndicatorNotes";
import { PageIntro } from "~/components/PageIntro";
import { SignalDot } from "~/components/SignalDot";
import { freshnessNote } from "~/components/StatList";
import { rentSignal, type Signal, spaceSignal, supplySignal } from "~/domain/chapterSignals";
import { infraExplainer } from "~/domain/explainers";
import { indicatorById } from "~/domain/indicators";
import { chartSubtitle, chartTitle, titleRank } from "~/domain/infraTitles";
import { parseRange } from "~/domain/ranges";
import type { IndicatorId } from "~/domain/types";
import { formatPeriod, formatValue } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import { type Change, matchedYearChange } from "~/metrics/changes";
import { getSectionData, type SeriesView } from "~/server/data";

const HISTORICAL_JLL_FAMILIES: Record<string, string> = {
  "jll.us_colo": "JLL's U.S. colocation coverage ended after Midyear 2024.",
  "jll.na_colo": "JLL's North America colocation coverage ended after Midyear 2025.",
};

const TOPICS = ["supply", "space", "rent", "power"] as const;
type Topic = (typeof TOPICS)[number];
const PUBLISHERS = ["cbre", "jll"] as const;
type Publisher = (typeof PUBLISHERS)[number];

// The current family of each publisher. CBRE and JLL are never mixed.
const PUBLISHER_FAMILY: Record<Publisher, string> = { cbre: "cbre.na_primary", jll: "jll.na" };
const PUBLISHER_LABEL: Record<Publisher, { long: string; short: string }> = {
  cbre: { long: "CBRE · 8 primary markets", short: "CBRE · 8 markets" },
  jll: { long: "JLL · North America", short: "JLL · N. America" },
};

const TOPIC_LABEL: Record<Topic, { long: string; short: string }> = {
  supply: { long: "Supply being built", short: "Supply" },
  space: { long: "Space available", short: "Space" },
  rent: { long: "Rents", short: "Rents" },
  power: { long: "Power backdrop", short: "Power" },
};

// The indicator whose notes explain each topic. Asking rents are part of
// the vacancy indicator.
const TOPIC_INDICATOR: Record<Topic, IndicatorId> = {
  supply: "construction",
  space: "vacancy",
  rent: "vacancy",
  power: "power_grid",
};

const READING: Record<Topic, { body: string; watch: string }> = {
  supply: {
    body: "Construction shows the supply being added. Pre-leasing shows how much of it already has a tenant.",
    watch: "construction speeding up while the pre-leased share falls.",
  },
  space: {
    body: "Vacancy is the share of built capacity still free. Absorption is how much space tenants took up in the period.",
    watch: "vacancy rising while absorption slows.",
  },
  rent: {
    body: "Asking rent is the list price per kW of capacity per month. Publishers quote different size bands, so compare each with its own history.",
    watch: "rents falling while construction keeps rising.",
  },
  power: {
    body: "State-wide commercial electricity sales and prices from EIA. This is backdrop, not a data-center signal: the figures include every commercial customer in the state.",
    watch: "prices climbing fast in the states with the most data-center building.",
  },
};

export const Route = createFileRoute("/infrastructure")({
  head: () =>
    pageHead(
      "/infrastructure",
      "Data Center Infrastructure",
      "Track data-center construction, vacancy, and pre-leasing in North America.",
    ),
  validateSearch: (s) => ({
    range: parseRange(s.range, "max"),
    topic: TOPICS.includes(s.topic as Topic) ? (s.topic as Topic) : "supply",
    publisher: PUBLISHERS.includes(s.publisher as Publisher) ? (s.publisher as Publisher) : "cbre",
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) =>
    getSectionData({
      data: { indicators: ["construction", "vacancy", "power_grid"], range: deps.range },
    }),
  component: InfrastructurePage,
});

const metricOf = (s: SeriesView) => s.id.split(".").slice(2).join(".");

// Which topic a series belongs to, by its metric; the indicator is the fallback.
function topicOf(s: SeriesView): Topic {
  if (s.indicator === "power_grid") return "power";
  const metric = metricOf(s);
  if (metric.startsWith("asking_rent")) return "rent";
  if (/^(vacancy|net_absorption)/.test(metric)) return "space";
  if (/^(under_construction|preleased|precommitted|inventory)/.test(metric)) return "supply";
  return (s.indicator as IndicatorId) === "vacancy" ? "space" : "supply";
}

// Six state lines need more room than one broker series does.
const POWER_HEIGHT = 280;

const familyOf = (s: SeriesView) => s.id.split(".").slice(0, 2).join(".");

// One chart per series, except EIA's per-state series of one measure, which
// share a chart. Publishers and coverage changes never share a chart, and
// annual totals never sit next to half-year figures. Charts follow the
// order of TITLES (construction, pre-leasing, inventory, ...).
function groups(series: SeriesView[]) {
  const map = new Map<string, { family: string; title: string; list: SeriesView[] }>();
  for (const s of series) {
    const family = familyOf(s);
    const shared = family.startsWith("eia.");
    const key = `${shared ? family : s.id}|${s.unit}|${s.cadence}`;
    const g = map.get(key) ?? { family, title: chartTitle(s), list: [] };
    g.list.push(s);
    map.set(key, g);
  }
  const rank = (g: { list: SeriesView[] }) =>
    g.list[0] ? titleRank(g.list[0]) : Number.MAX_SAFE_INTEGER;
  return [...map.values()].sort((x, y) => rank(x) - rank(y));
}

function emptyReason(topic: Topic, publisher: Publisher) {
  if (topic === "power") {
    return "The EIA collector has not published any selected-state observations yet.";
  }
  if (publisher === "jll" && topic === "rent") {
    return "JLL's current North America coverage has no rent series. Earlier JLL rents are under Historical JLL coverage below.";
  }
  return `${PUBLISHER_LABEL[publisher].long} has no series for this topic yet. Broker reports are added by hand when they come out.`;
}

function signed(v: number, digits = 0) {
  if (v > 0) return `▲ +${v.toFixed(digits)}`;
  if (v < 0) return `▼ −${Math.abs(v).toFixed(digits)}`;
  return `± ${v.toFixed(digits)}`;
}

// Same half-year a year apart. The stored change is computed on the server
// from the full history, so a short page range cannot hide the year-ago point.
function yearChange(s: SeriesView | undefined): Change | null {
  return matchedYearChange(s?.changes?.y1 ?? null);
}

type Tile = {
  topic: Topic;
  value: string | null;
  metric: string;
  change: string;
  signal: Signal;
};

function InfrastructurePage() {
  const { series } = Route.useLoaderData();
  const { range, topic, publisher } = Route.useSearch();
  const cbre = (metric: string) => series.find((s) => s.id === `cbre.na_primary.${metric}`);

  // ---- Topic cards: CBRE primary markets only (the longest continuous series) ----
  const construction = cbre("under_construction_mw");
  const preleased = cbre("preleased_pct");
  const vacancy = cbre("vacancy");
  const absorptionFy = cbre("net_absorption_mw_annual");
  const rent = series.find((s) => s.id.startsWith("cbre.na_primary.asking_rent"));
  const cChange = yearChange(construction);
  const pChange = yearChange(preleased);
  const vChange = yearChange(vacancy);
  const rChange = yearChange(rent);
  const period = (s: SeriesView | undefined) =>
    s?.latest ? formatPeriod(s.latest.periodEnd, s.cadence) : "";
  // The tile figure is the latest value, so a series that is not current says so.
  const staleNote = (s: SeriesView | undefined) => (s ? freshnessNote(s) : "");

  const tiles: Tile[] = [
    {
      topic: "supply",
      value: construction?.latest ? formatValue(construction.latest.value, "MW") : null,
      metric: `under construction · ${period(construction)}${staleNote(construction)}`,
      change: [
        cChange?.pct != null ? `${signed(cChange.pct * 100)}% in a year` : "no matching half-year",
        preleased?.latest ? `${+preleased.latest.value.toFixed(1)}% pre-leased` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      signal: supplySignal(cChange, pChange),
    },
    {
      topic: "space",
      value: vacancy?.latest ? `${+vacancy.latest.value.toFixed(2)}%` : null,
      metric: `vacancy · ${period(vacancy)}${staleNote(vacancy)}`,
      change: [
        vChange ? `${signed(vChange.delta, 1)} pp in a year` : "no matching half-year",
        absorptionFy?.latest
          ? `${formatValue(absorptionFy.latest.value, "MW")} absorbed, ${period(absorptionFy)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      signal: spaceSignal(vChange),
    },
    {
      topic: "rent",
      value: rent?.latest ? `$${rent.latest.value.toFixed(2)}` : null,
      metric: `per kW per month · ${period(rent)}${staleNote(rent)}`,
      change:
        rChange?.pct != null
          ? `${signed(rChange.pct * 100, 1)}% in a year`
          : "no matching half-year",
      signal: rentSignal(rChange),
    },
    {
      topic: "power",
      value: "EIA",
      metric: "state-wide commercial power",
      change: "context, not a signal",
      signal: "context",
    },
  ];

  // ---- Current read: facts only, from the same CBRE series ----
  const facts = [
    vacancy?.latest && `Vacancy is ${+vacancy.latest.value.toFixed(2)}%.`,
    preleased?.latest &&
      `${+preleased.latest.value.toFixed(1)}% of the capacity under construction is pre-leased.`,
    cChange?.pct != null &&
      `Construction is ${cChange.pct >= 0 ? "up" : "down"} ${Math.abs(cChange.pct * 100).toFixed(0)}% on the same half a year earlier.`,
  ].filter(Boolean);
  const latestPeriod = period(construction) || period(vacancy);

  // ---- Panel: charts for topic × publisher ----
  const active = series.filter((s) => !HISTORICAL_JLL_FAMILIES[familyOf(s)]);
  const historical = groups(series.filter((s) => HISTORICAL_JLL_FAMILIES[familyOf(s)]));
  const forTopic = (t: Topic, p: Publisher) =>
    groups(
      active.filter(
        (s) => topicOf(s) === t && (t === "power" || familyOf(s) === PUBLISHER_FAMILY[p]),
      ),
    );
  // Census spending is neither publisher's; it shows with either one.
  const census = groups(active.filter((s) => familyOf(s) === "census.c30"));
  const charts = forTopic(topic, publisher);
  const extra = topic === "supply" ? census : [];
  const count = (t: Topic) => forTopic(t, publisher).length + (t === "supply" ? census.length : 0);

  const tabId = (t: Topic) => `infra-tab-${t}`;

  return (
    <>
      <PageIntro
        eyebrow="Infrastructure"
        title="Is new data-center space filling up as fast as it is built?"
        range={range}
      >
        Start with the four cards: each is one question, with the latest figure. Open one for its
        charts. CBRE and JLL measure different markets, so you see one publisher at a time and they
        are never added together.
      </PageIntro>

      <section className="scorecard" aria-label="Current read">
        <div className="scorecard-read">
          <p className="eyebrow">Current read</p>
          <h2>{latestPeriod ? `Latest CBRE report: ${latestPeriod}` : "Awaiting CBRE data"}</h2>
          <p className="scorecard-facts">
            {facts.length ? facts.join(" ") : "No CBRE figures have been entered yet."}
          </p>
          <p className="scorecard-prov">
            Figures: CBRE, 8 North American primary markets (7 before 2023).
            {latestPeriod ? ` Latest report covers ${latestPeriod}.` : ""} Cards use CBRE only, the
            longest continuous series.
          </p>
        </div>
        <div className="tiles">
          {tiles.map((t) => (
            <Link
              key={t.topic}
              to="."
              search={(prev: Record<string, unknown>) => ({ ...prev, topic: t.topic })}
              resetScroll={false}
              className="tile"
              aria-pressed={t.topic === topic}
              aria-controls="infra-panel"
            >
              <span className="tile-label">{TOPIC_LABEL[t.topic].long}</span>
              <span className={`tile-value${t.value == null ? " awaiting" : ""}`}>
                {t.value ?? "Awaiting data"}
              </span>
              <span className="tile-metric">{t.metric}</span>
              <span className="tile-change">{t.change}</span>
              <SignalDot signal={t.signal} />
            </Link>
          ))}
        </div>
      </section>

      <div className="topic-bar">
        <div className="topic-tabs" role="tablist" aria-label="Topic">
          {TOPICS.map((t) => (
            <Link
              key={t}
              id={tabId(t)}
              to="."
              search={(prev: Record<string, unknown>) => ({ ...prev, topic: t })}
              resetScroll={false}
              role="tab"
              aria-selected={t === topic}
              aria-controls="infra-panel"
              className="topic-tab"
            >
              <span className="long">{TOPIC_LABEL[t].long}</span>
              <span className="short">{TOPIC_LABEL[t].short}</span>
              <span className="topic-count">{count(t)}</span>
            </Link>
          ))}
        </div>
        {topic !== "power" ? (
          <div className="segmented-wrap">
            <span className="segmented-label">Publisher</span>
            <SegmentedSwitch
              label="Publisher"
              options={PUBLISHERS.map((p) => ({
                key: p,
                active: p === publisher,
                search: { publisher: p },
                children: (
                  <>
                    <span className="long">{PUBLISHER_LABEL[p].long}</span>
                    <span className="short">{PUBLISHER_LABEL[p].short}</span>
                  </>
                ),
              }))}
            />
          </div>
        ) : null}
      </div>

      <div id="infra-panel" role="tabpanel" aria-labelledby={tabId(topic)} className="topic-panel">
        <details className="reading-tab reading-mobile">
          <summary>Reading this tab</summary>
          <ReadingBody topic={topic} />
        </details>
        <div className="topic-charts">
          {charts.length === 0 && extra.length === 0 ? (
            <ChartBlock
              title={`No ${TOPIC_LABEL[topic].long.toLowerCase()} series`}
              series={[]}
              emptyReason={emptyReason(topic, publisher)}
            />
          ) : null}
          {[...charts, ...extra].map(({ title, list }) => (
            <InfraChart
              key={`${title}-${list[0]?.id}`}
              title={title}
              list={list}
              height={topic === "power" ? POWER_HEIGHT : undefined}
            />
          ))}
        </div>
        <aside className="reading-tab reading-desktop" aria-label="Reading this tab">
          <p className="rail-heading">Reading this tab</p>
          <ReadingBody topic={topic} />
        </aside>
        <div className="topic-notes">
          <IndicatorNotes def={indicatorById(TOPIC_INDICATOR[topic])} />
        </div>
      </div>

      {historical.length > 0 && (
        <details className="readme infrastructure-history">
          <summary>
            Historical JLL coverage ({historical.length} series) · kept for reference, can't be
            joined to current figures
          </summary>
          <p>
            JLL changed its market coverage, so these series cannot be joined to the current North
            America figures. They are retained for reference only.
          </p>
          <div className="topic-charts">
            {historical.map(({ family, title, list }) => (
              <InfraChart
                key={`${title}-${list[0]?.id}`}
                title={title}
                list={list}
                note={HISTORICAL_JLL_FAMILIES[family]}
              />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function ReadingBody({ topic }: { topic: Topic }) {
  return (
    <>
      <p>{READING[topic].body}</p>
      <p>
        <b>Watch for:</b> {READING[topic].watch}
      </p>
      <Link to="/coverage" className="more">
        How these reports are collected →
      </Link>
    </>
  );
}

// A series with one observation shows the figure and its period, not a
// one-point chart.
function InfraChart({
  title,
  list,
  note,
  height,
}: {
  title: string;
  list: SeriesView[];
  // Why a retired series is shown, added after the publisher and unit.
  note?: string;
  height?: number;
}) {
  const info = infraExplainer(list.map((x) => x.id));
  const only = list.length === 1 ? list[0] : undefined;
  const first = list[0];
  const subtitle = first ? [chartSubtitle(first), note].filter(Boolean).join(" · ") : note;
  if (only?.latest && only.points.length <= 1) {
    return (
      <div className="block single-point">
        <div className="block-head">
          <h3>{title}</h3>
          <span className="muted">{subtitle}</span>
        </div>
        <div className="block-body">
          <p className="single-point-value">{formatValue(only.latest.value, only.unit)}</p>
          <p className="muted">
            {formatPeriod(only.latest.periodEnd, only.cadence)} ·{" "}
            {note ? "one report, and coverage has ended" : "one report so far"}, so there is no
            trend to chart.{" "}
            <a
              href={only.latest.sourceUrl ?? only.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source ↗
            </a>
          </p>
        </div>
      </div>
    );
  }
  return <ChartBlock title={title} subtitle={subtitle} series={list} info={info} height={height} />;
}

// Boxed segmented control: panel background, active item on --panel2 in teal.
function SegmentedSwitch({
  label,
  options,
}: {
  label: string;
  options: { key: string; active: boolean; search: Record<string, string>; children: ReactNode }[];
}) {
  return (
    <nav className="segmented" aria-label={label}>
      {options.map((o) => (
        <Link
          key={o.key}
          to="."
          search={(prev: Record<string, unknown>) => ({ ...prev, ...o.search })}
          resetScroll={false}
          aria-pressed={o.active}
          className="segment"
        >
          {o.children}
        </Link>
      ))}
    </nav>
  );
}
