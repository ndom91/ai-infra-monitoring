import { createServerFn } from "@tanstack/react-start";
import { SEC_COMPANIES } from "~/domain/companies";
import { type Point, resampleAt } from "~/metrics/changes";
import { ttm } from "~/metrics/fundamentals";
import { getDb } from "~/storage/db";
import { recentAlerts } from "~/storage/queries";
import { loadSection } from "./data";
import { deriveCompanySeries } from "./derived";
import { buildView, type ObsPoint, type SeriesView } from "./views";

export type DivergenceLine = { label: string; unit: string; points: Point[] };

export type Divergence = {
  id: string;
  title: string;
  pattern: string;
  lines: DivergenceLine[];
  // Why there is no chart yet, when lines are missing.
  awaiting?: string;
  note?: string;
};

const HYPERSCALERS = SEC_COMPANIES.filter((c) => c.group === "hyperscaler").map((c) => c.ticker);

// Sums several quarterly series, only on quarter ends where every series has
// a value, so a missing filing never shows up as a drop.
function sumAligned(seriesList: Point[][]): Point[] {
  if (seriesList.length === 0 || seriesList.some((s) => s.length === 0)) return [];
  const maps = seriesList.map((s) => new Map(s.map((p) => [p.periodEnd, p.value])));
  const dates = [...(maps[0]?.keys() ?? [])].filter((d) => maps.every((m) => m.has(d)));
  return dates.sort().map((d) => ({
    periodEnd: d,
    value: maps.reduce((acc, m) => acc + (m.get(d) ?? 0), 0),
  }));
}

// Average of step series (values hold until the next change) at each date,
// only where at least `min` series have a value.
function averageSteps(steps: Point[][], dates: string[], min = 3): Point[] {
  return dates.flatMap((d) => {
    const vals = steps.flatMap((s) => {
      const p = resampleAt(s, [d], Number.POSITIVE_INFINITY)[0];
      return p ? [p.value] : [];
    });
    if (vals.length < min) return [];
    return [{ periodEnd: d, value: vals.reduce((a, b) => a + b, 0) / vals.length }];
  });
}

// Trims every line to dates on/after the latest first date, so indexing to
// 100 starts from a common point.
function commonStart(lines: DivergenceLine[]): DivergenceLine[] {
  const start =
    lines
      .map((l) => l.points[0]?.periodEnd ?? "")
      .sort()
      .at(-1) ?? "";
  return lines.map((l) => ({ ...l, points: l.points.filter((p) => p.periodEnd >= start) }));
}

function divergence(
  base: Omit<Divergence, "lines" | "awaiting">,
  lines: DivergenceLine[],
  awaiting: string,
): Divergence {
  const usable = lines.filter((l) => l.points.length >= 2);
  if (usable.length < 2) return { ...base, lines: [], awaiting };
  return { ...base, lines: commonStart(usable) };
}

const pts = (obs: ObsPoint[] | undefined): Point[] =>
  (obs ?? []).map((p) => ({ periodEnd: p.periodEnd, value: p.value }));

export const getOverviewData = createServerFn({ method: "GET" }).handler(async () => {
  const now = new Date();
  const [credit, rest, alerts] = await Promise.all([
    loadSection({ indicators: ["credit"], range: "3y", fullHistory: false }, now),
    loadSection(
      {
        indicators: [
          "gpu_rental",
          "gpu_resale",
          "capex_cashflow",
          "contract_conversion",
          "customer_concentration",
          "construction",
          "vacancy",
          "depreciation",
        ],
        range: "max",
        fullHistory: true,
      },
      now,
    ),
    recentAlerts(getDb(), 6),
  ]);
  const raw = new Map([...credit.raw, ...rest.raw]);
  const get = (id: string) => pts(raw.get(id));
  const secStatus = rest.runStatus.get("sec");

  const derivedViews: SeriesView[] = SEC_COMPANIES.flatMap((c) =>
    deriveCompanySeries(c.ticker, (concept) => get(`sec.${c.ticker}.${concept}`)),
  )
    .filter((d) => d.def.id.endsWith(".capex_ocf_ttm") || d.def.id.endsWith(".debt_to_ocf"))
    .map((d) => buildView(d.def, d.points, { now, lastRunStatus: secStatus }));

  const allSeries = [...credit.series, ...rest.series];
  const headline = {
    credit: ["fred.BAMLH0A0HYM2", "fred.BAMLH0A3HYC", "fred.BAMLC0A4CBBB", "fred.BAA10Y"].flatMap(
      (id) => allSeries.filter((s) => s.id === id),
    ),
    capex: derivedViews.filter((s) => s.id.endsWith(".capex_ocf_ttm")),
    other: rest.series.filter(
      (s) => s.collector !== "sec" && s.points.length > 0 && s.indicator !== "depreciation",
    ),
  };

  // --- Divergence watch ---
  const hyperCapexTtm = sumAligned(HYPERSCALERS.map((t) => ttm(get(`sec.${t}.capex`))));
  const hyperFcfTtm = sumAligned(
    HYPERSCALERS.map((t) => {
      const ocf = new Map(ttm(get(`sec.${t}.ocf`)).map((p) => [p.periodEnd, p.value]));
      return ttm(get(`sec.${t}.capex`)).flatMap((p) => {
        const o = ocf.get(p.periodEnd);
        return o === undefined ? [] : [{ periodEnd: p.periodEnd, value: o - p.value }];
      });
    }),
  );
  const firstOf = (pred: (s: SeriesView) => boolean) => rest.series.find(pred);
  // AWS is the only rental series with real monthly history (24 months).
  const rental = firstOf((s) => s.id === "aws.h100.us-east-1.ondemand");
  const resale = firstOf((s) => s.indicator === "gpu_resale");
  const construction = firstOf(
    (s) => s.indicator === "construction" && s.unit === "MW" && s.points.length > 1,
  );
  const preleased = firstOf(
    (s) =>
      s.indicator === "construction" &&
      s.unit === "%" &&
      s.source === construction?.source &&
      s.points.length > 1,
  );
  const crwvRpo = get("sec.CRWV.rpo");
  const hyOas = get("fred.BAMLH0A0HYM2");
  const neocloudDebt = sumAligned(
    ["CRWV", "CORZ", "IREN", "APLD"].map((t) => get(`sec.${t}.debt`)).filter((s) => s.length > 0),
  );
  const lifeSteps = rest.series.filter((s) => s.indicator === "depreciation");

  const divergences: Divergence[] = [
    divergence(
      {
        id: "rental_vs_capex",
        title: "GPU rental prices vs hyperscaler capex",
        pattern: "Rental prices falling while capex keeps rising.",
      },
      [
        { label: "Hyperscaler TTM capex (sum)", unit: "USD", points: hyperCapexTtm },
        ...(rental
          ? [
              {
                label: rental.label,
                unit: rental.unit,
                points: resampleAt(
                  pts(raw.get(rental.id)),
                  hyperCapexTtm.map((p) => p.periodEnd),
                ),
              },
            ]
          : []),
      ],
      "No permitted GPU rental price source yet. See Coverage.",
    ),
    divergence(
      {
        id: "spreads_vs_backlog",
        title: "Credit spreads vs contracted backlog",
        pattern: "Spreads widening while contracted backlog keeps growing.",
        note: "HY OAS sampled at CoreWeave's quarter ends.",
      },
      [
        { label: "CoreWeave RPO", unit: "USD", points: crwvRpo },
        {
          label: "US High Yield OAS",
          unit: "%",
          points: resampleAt(
            hyOas,
            crwvRpo.map((p) => p.periodEnd),
          ),
        },
      ],
      "Needs CoreWeave RPO and HY OAS on common quarter ends.",
    ),
    divergence(
      {
        id: "collateral_vs_debt",
        title: "GPU collateral values vs loan balances",
        pattern: "Resale values falling while neocloud debt stays high.",
      },
      [
        { label: "Neocloud long-term debt (sum)", unit: "USD", points: neocloudDebt },
        ...(resale
          ? [
              {
                label: resale.label,
                unit: resale.unit,
                points: resampleAt(
                  pts(raw.get(resale.id)),
                  neocloudDebt.map((p) => p.periodEnd),
                  100,
                ),
              },
            ]
          : []),
      ],
      "No licensed GPU resale series yet. See Coverage.",
    ),
    divergence(
      {
        id: "construction_vs_preleasing",
        title: "Construction vs preleasing",
        pattern: "Construction accelerating while the preleased share falls.",
        note: construction ? `Source: ${construction.source}.` : undefined,
      },
      [
        ...(construction
          ? [{ label: construction.label, unit: "MW", points: pts(raw.get(construction.id)) }]
          : []),
        ...(preleased
          ? [{ label: preleased.label, unit: "%", points: pts(raw.get(preleased.id)) }]
          : []),
      ],
      "Needs cited construction and preleasing figures from the same publisher.",
    ),
    divergence(
      {
        id: "lives_vs_cash",
        title: "Useful-life extensions vs free cash flow",
        pattern:
          "Depreciation lives lengthening (flattering earnings) while free cash flow after capex weakens.",
        note: "Average useful life across hyperscalers with a disclosed change, held between disclosures.",
      },
      [
        { label: "Hyperscaler TTM FCF after capex (sum)", unit: "USD", points: hyperFcfTtm },
        {
          label: "Average server useful life",
          unit: "years",
          points: averageSteps(
            lifeSteps.map((s) => pts(raw.get(s.id))),
            hyperFcfTtm.map((p) => p.periodEnd),
          ),
        },
      ],
      "Needs cited useful-life disclosures for at least 3 hyperscalers.",
    ),
  ];

  return {
    now: now.toISOString(),
    headline,
    alerts,
    divergences,
    lifeChanges: lifeSteps.flatMap((s) =>
      (raw.get(s.id) ?? []).map((p) => ({
        entity: s.entity ?? s.label,
        periodEnd: p.periodEnd,
        value: p.value,
        sourceUrl: p.sourceUrl ?? s.sourceUrl,
      })),
    ),
  };
});
