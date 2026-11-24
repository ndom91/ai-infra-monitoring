import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Chapter,
  ChapterCharts,
  type ChapterDef,
  ChapterHeader,
  ChapterLayout,
  ChapterMore,
} from "~/components/Chapters";
import { ChartBlock } from "~/components/ChartBlock";
import { EntityBand, EntityPicker } from "~/components/EntityPicker";
import { IssuedTable } from "~/components/IssuedTable";
import { PageIntro } from "~/components/PageIntro";
import { ScatterChart, type ScatterSeries } from "~/components/ScatterChart";
import { latestChangeStat, type Stat } from "~/components/StatList";
import { TermsTable } from "~/components/TermsTable";
import { creditMarketSignal, SIGNAL_LABELS } from "~/domain/chapterSignals";
import { GROUP_BLURBS, SEC_DEBT_COMPANIES } from "~/domain/companies";
import { EXPLAINERS } from "~/domain/explainers";
import {
  formatIssuedRate,
  type IssuedInstrument,
  type IssuedKind,
  issuedInstruments,
  issuedSummary,
  issuerName,
} from "~/domain/headlines";
import { parseRange } from "~/domain/ranges";
import { formatDate, formatValue } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import { getCreditDebt, getRiskRead, getSectionData, type SeriesView } from "~/server/data";

const BORROWERS = SEC_DEBT_COMPANIES.map((c) => c.ticker);
const ISSUED_SINCE = "2025-01-01";

export const Route = createFileRoute("/credit")({
  head: () =>
    pageHead(
      "/credit",
      "Credit Risk",
      "Follow borrowing costs, leverage, and refinancing pressure across AI infrastructure companies.",
    ),
  validateSearch: (s) => ({
    range: parseRange(s.range, "3y"),
    company: BORROWERS.includes(String(s.company)) ? String(s.company) : "CRWV",
  }),
  loaderDeps: ({ search }) => ({ range: search.range, company: search.company }),
  loader: async ({ deps }) => {
    const [section, debt, riskRead] = await Promise.all([
      // Instrument-level debt comes pre-reduced from getCreditDebt.
      getSectionData({
        data: { indicators: ["credit"], range: deps.range, excludeCollectors: ["sec_debt"] },
      }),
      getCreditDebt({ data: deps }),
      getRiskRead(),
    ]);
    return { series: section.series, debt, riskRead };
  },
  component: CreditPage,
});

// Labels are "Instrument (qualifier) — metric"; charts show the instrument part.
const instrumentLabel = (s: SeriesView) => s.label.split(" — ")[0] ?? s.label;

const KIND_STYLE: Record<IssuedKind, Omit<ScatterSeries, "points">> = {
  note: { label: "Senior / secured notes", color: "#b5e1cd" },
  convertible: { label: "Convertible notes", color: "#f5c69c" },
  loan: { label: "Loan margin over SOFR (hollow)", color: "#9cc3f5", hollow: true },
};

function scatterSeries(list: IssuedInstrument[]): ScatterSeries[] {
  return (Object.keys(KIND_STYLE) as IssuedKind[]).map((kind) => ({
    ...KIND_STYLE[kind],
    points: list
      .filter((i) => i.kind === kind)
      .map((i) => ({
        date: i.issued,
        value: i.rate,
        title: `${i.title} (${i.issuer})`,
        display: formatIssuedRate(i),
      })),
  }));
}

const pctStat = (label: string, v: number | null, note: string, tone?: Stat["tone"]): Stat => ({
  label,
  value: v == null ? null : `${+v.toFixed(3)}%`,
  note,
  tone,
});

function CreditPage() {
  const { series, debt, riskRead } = Route.useLoaderData();
  const { range, company } = Route.useSearch();
  const byId = new Map(series.map((s) => [s.id, s]));
  const pick = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const issuerSeries = series.filter((s) => s.collector === "manual");
  const issued = issuedInstruments(issuerSeries, ISSUED_SINCE);
  const summary = issuedSummary(issued);
  const borrower = SEC_DEBT_COMPANIES.find((c) => c.ticker === company);

  const marketSignal = creditMarketSignal(riskRead.label);
  const market: ChapterDef = {
    slug: "market",
    label: "Market stress",
    sub: "Daily · FRED",
    signal: marketSignal,
  };
  const rates: ChapterDef = {
    slug: "rates",
    label: "Rate backdrop",
    sub: "Daily · FRED",
    signal: "context",
  };
  const issuedCh: ChapterDef = {
    slug: "issued",
    label: "What AI companies pay",
    sub: "From filings",
    signal: "context",
  };
  const byCompany: ChapterDef = {
    slug: "bycompany",
    label: "Debt by company",
    sub: "Quarterly · SEC",
    signal: "context",
  };
  const chapters = [market, rates, issuedCh, byCompany];

  // Alert history: the same signals as the homepage "Current read".
  const fired = riskRead.signals.filter((s) => s.severity !== "info");
  const critical = fired.filter((s) => s.severity === "critical").length;
  const warning = fired.filter((s) => s.severity === "warning").length;
  const firstFired = fired.map((s) => s.firstTriggeredAt).sort()[0];
  const lastFired = fired
    .map((s) => s.triggeredAt)
    .sort()
    .at(-1);

  // Debt by company headline figures.
  const latestEnd = debt.current[0]?.latest?.periodEnd;
  const carrying = debt.current.reduce((sum, s) => sum + (s.latest?.value ?? 0), 0);
  const ownIssued = issued.filter((i) => i.ticker === company && i.kind !== "loan");

  const picker = (variant: "rail" | "row") => (
    <EntityPicker
      companies={SEC_DEBT_COMPANIES}
      active={company}
      variant={variant}
      label="Borrower"
    />
  );

  return (
    <>
      <PageIntro
        eyebrow="Credit"
        title="What does it cost the AI build-out to borrow?"
        range={range}
      >
        Four chapters, from the whole bond market down to single instruments. The first two are live
        market prices; the last two are terms written into filings, which don't move once agreed.
      </PageIntro>
      <ChapterLayout
        chapters={chapters}
        picker={{ heading: "Borrower · chapter 04", node: picker("rail") }}
      >
        <Chapter chapter={market}>
          <ChapterHeader
            index={1}
            total={4}
            chapter={market}
            meta="ICE BofA via FRED, daily"
            question="Are lenders getting nervous about the riskiest borrowers?"
            watchFor="the CCC spread rising faster than the broad junk index. The weakest borrowers are usually cut off first."
            stats={[
              latestChangeStat("CCC-rated, extra interest", byId.get("fred.BAMLH0A3HYC"), {
                bps: true,
                tone: marketSignal === "context" ? undefined : marketSignal,
              }),
              latestChangeStat("All junk-rated", byId.get("fred.BAMLH0A0HYM2"), { bps: true }),
              {
                label: "Credit alerts fired",
                value: String(fired.length),
                note:
                  firstFired && lastFired
                    ? `${critical} critical · ${warning} warning · ${formatDate(firstFired)} – ${formatDate(lastFired)}`
                    : "No warning or critical alert in the latest history",
                tone: marketSignal === "context" ? undefined : marketSignal,
              },
            ]}
          />
          <ChapterCharts one>
            <ChartBlock
              title="Junk-bond borrowing costs, by rating"
              info={EXPLAINERS.hySpreads}
              subtitle="Extra interest over US Treasuries, option-adjusted, percentage points"
              series={pick([
                "fred.BAMLH0A0HYM2",
                "fred.BAMLH0A1HYBB",
                "fred.BAMLH0A2HYB",
                "fred.BAMLH0A3HYC",
              ])}
            />
          </ChapterCharts>
          <p className="chapter-signal">
            <b>{SIGNAL_LABELS[marketSignal]}:</b> {riskRead.detail}
          </p>
          <p className="chapter-source">
            Source: ICE BofA US High Yield indexes, via FRED. Updated daily.
          </p>
          <Link to="/alerts" className="more">
            See the alert history and the thresholds behind these signals →
          </Link>
        </Chapter>

        <Chapter chapter={rates}>
          <ChapterHeader
            index={2}
            total={4}
            chapter={rates}
            meta="FRED, daily"
            question="Is it credit risk, or just higher rates overall?"
            watchFor="spreads widening while Treasury yields are flat. That points at credit risk, not the rate cycle."
            stats={[
              latestChangeStat("BBB-rated, extra interest", byId.get("fred.BAMLC0A4CBBB"), {
                bps: true,
              }),
              latestChangeStat("10-year Treasury yield", byId.get("fred.DGS10"), { bps: true }),
              latestChangeStat("Junk-bond total yield", byId.get("fred.BAMLH0A0HYM2EY"), {
                bps: true,
              }),
            ]}
          />
          <ChapterCharts>
            <ChartBlock
              title="Borrowing costs, safer companies"
              info={EXPLAINERS.igSpreads}
              subtitle="BBB spread (last 3 years) and Moody's Baa minus 10-year Treasury (long history)"
              series={pick(["fred.BAMLC0A4CBBB", "fred.BAA10Y"])}
            />
            <ChartBlock
              title="Total interest rates"
              info={EXPLAINERS.yields}
              subtitle="Move with all interest rates, not just credit risk"
              series={pick(["fred.BAMLH0A0HYM2EY", "fred.DBAA", "fred.DGS10"])}
            />
          </ChapterCharts>
        </Chapter>

        <Chapter chapter={issuedCh}>
          <ChapterHeader
            index={3}
            total={4}
            chapter={issuedCh}
            meta="From filings"
            question="What have AI infrastructure companies agreed to pay?"
            watchFor="new straight notes coming in at higher coupons than the last ones. Convertibles look cheap because buyers are paid in upside instead."
            stats={[
              {
                label: "Instruments issued since Jan 2025",
                value: summary.count ? String(summary.count) : null,
                note: `Notes, convertibles and loans · ${summary.issuers} issuers`,
              },
              pctStat(
                "Median coupon, straight notes",
                summary.notes.median,
                `${summary.notes.n} senior / secured notes · calculated`,
              ),
              pctStat(
                "Median coupon, convertibles",
                summary.convertibles.median,
                `${summary.convertibles.n} convertible notes · calculated`,
              ),
            ]}
          />
          <div className="block chapter-figure">
            <div className="block-head">
              <h3>Coupon at issue, every deal since 2025</h3>
              <span className="muted">
                One dot per instrument · rate agreed on the issue date, not today's market price
              </span>
            </div>
            {issued.length ? (
              <ScatterChart
                series={scatterSeries(issued)}
                ariaLabel="Rate at issue against issue date for each debt instrument since 2025"
              />
            ) : (
              <div className="no-data">
                <b>No deals recorded since 2025</b>
                <span>Issue terms are entered by hand from filings, with a quote for each.</span>
              </div>
            )}
            <p className="chapter-source">
              Straight notes, convertibles and SOFR loan margins are plotted separately; a loan
              margin is paid on top of a floating rate. Source: issuer 8-K / 6-K filings and press
              releases, entered by hand with a quote for each.
            </p>
          </div>
          {issued.length ? (
            <div className="block chapter-figure">
              <div className="block-head">
                <h3>Ten most recent</h3>
              </div>
              <IssuedTable rows={issued.slice(0, 10)} caption="Ten most recent debt deals" />
            </div>
          ) : null}
          <ChapterMore summary={`Show all ${issuerSeries.length} instruments, grouped by issuer`}>
            {[...new Set(issuerSeries.map((s) => s.id.split(".")[1] ?? ""))].map((ticker) => (
              <TermsTable
                key={ticker}
                title={issuerName(ticker)}
                info={EXPLAINERS.issuerDebt}
                subtitle="Rates agreed when the debt was issued, from filings. Not today's market price."
                series={issuerSeries.filter((s) => s.id.split(".")[1] === ticker)}
              />
            ))}
          </ChapterMore>
        </Chapter>

        <Chapter chapter={byCompany}>
          {borrower ? (
            <EntityBand
              eyebrow="This chapter follows one borrower"
              company={borrower}
              blurb={`${GROUP_BLURBS[borrower.group]} Switch borrower in the side rail.`}
              link={
                <Link to="/fundamentals" search={{ company, range: "5y" }}>
                  Company fundamentals for {company} →
                </Link>
              }
            />
          ) : null}
          {picker("row")}
          <ChapterHeader
            index={4}
            total={4}
            chapter={byCompany}
            meta="SEC XBRL, quarterly"
            question="How much does each borrower owe, and on what terms?"
            watchFor="debt growing faster than cash from operations, or effective rates well above the stated coupon."
            stats={[
              {
                label: "Instruments with a balance",
                value: debt.current.length ? String(debt.current.length) : null,
                note: latestEnd
                  ? `Latest filing · ${formatDate(latestEnd)}`
                  : "No filing collected yet",
              },
              {
                label: "Total carrying amount",
                value: debt.current.length ? formatValue(carrying, "USD") : null,
                note: latestEnd
                  ? `Sum of instruments · ${formatDate(latestEnd)} · calculated`
                  : "No filing collected yet",
              },
              {
                label: "Notes and convertibles issued since 2025",
                value: String(ownIssued.length),
                note: "From filings, chapter 03",
              },
            ]}
          />
          <ChapterCharts>
            <ChartBlock
              title={`${borrower?.name ?? company}: debt by instrument`}
              info={EXPLAINERS.instrumentDebt}
              subtitle="Carrying amount at each filing date, instruments with a balance at the latest one"
              series={debt.current}
              labelOf={instrumentLabel}
              emptyReason="No instrument-level debt has been collected from this company's filings yet."
            />
            <TermsTable
              title={`${borrower?.name ?? company}: latest rates`}
              subtitle="Latest figure filed for each instrument. Not today's market price."
              series={debt.rates}
              labelOf={(s) => s.label}
            />
          </ChapterCharts>
        </Chapter>
      </ChapterLayout>
    </>
  );
}
