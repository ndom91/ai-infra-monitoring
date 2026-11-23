import * as v from "valibot";
import { permanent } from "../errors";

// Debt facts from an SEC XBRL instance document (`*_htm.xml`).
//
// The companyfacts API drops dimensions, so per-instrument debt (each facility,
// each note) is only visible here. The documents are machine generated, so a
// tag scan is reliable and avoids an XML dependency in the server bundle.

export const METRICS = {
  carrying_amount: {
    concept: "DebtInstrumentCarryingAmount",
    label: "carrying amount",
    percent: false,
  },
  face_amount: { concept: "DebtInstrumentFaceAmount", label: "face amount", percent: false },
  max_borrowing_capacity: {
    concept: "LineOfCreditFacilityMaximumBorrowingCapacity",
    label: "maximum borrowing capacity",
    percent: false,
  },
  effective_rate: {
    concept: "DebtInstrumentInterestRateEffectivePercentage",
    label: "effective interest rate",
    percent: true,
  },
  stated_rate: {
    concept: "DebtInstrumentInterestRateStatedPercentage",
    label: "stated interest rate",
    percent: true,
  },
  variable_rate_spread: {
    concept: "DebtInstrumentBasisSpreadOnVariableRate1",
    label: "spread over variable rate",
    percent: true,
  },
} as const;

export type MetricId = keyof typeof METRICS;

const METRIC_BY_CONCEPT = new Map<string, MetricId>(
  (Object.entries(METRICS) as [MetricId, (typeof METRICS)[MetricId]][]).map(([id, m]) => [
    m.concept,
    id,
  ]),
);

// The instrument is the member on the first of these axes that a context uses.
// Facts with neither axis are aggregates (company totals, or a debt type such as
// "senior notes" with no instrument) and are left to the `sec` collector.
const INSTRUMENT_AXES = ["DebtInstrumentAxis", "CreditFacilityAxis"];
// Axes that only categorize an instrument. They repeat what the instrument
// already says (a "senior notes" member next to the notes themselves), so they
// must not split one instrument into several series.
const CATEGORY_AXES = new Set([
  ...INSTRUMENT_AXES,
  "LongtermDebtTypeAxis",
  "ShortTermDebtTypeAxis",
]);

export type Member = { axis: string; member: string };

export type DebtFact = {
  metric: MetricId;
  // Local name of the instrument member, e.g. DDTL2.1FacilityMember.
  instrument: string;
  // Prefixed name, used to look the member up in the label linkbase.
  instrumentQName: string;
  // Every other axis of the context, sorted by axis. Kept in the series key so
  // recourse vs non-recourse, or SOFR vs Treasury margins, never merge.
  qualifiers: Member[];
  periodEnd: string;
  // Dollars for amounts; percentage points for rates (filed decimal x 100).
  value: number;
  // The value exactly as filed.
  filed: string;
};

export type ParsedInstance = {
  facts: DebtFact[];
  skipped: { aggregate: number; unit: number; typed: number };
};

const local = (qname: string) => qname.slice(qname.indexOf(":") + 1);

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

function measureOf(body: string) {
  if (/<(?:[\w-]+:)?divide\b/.test(body)) return undefined;
  return body.match(/<(?:[\w-]+:)?measure>\s*([^<]*?)\s*</)?.[1];
}

type Context = { end: string; members: Member[]; typed: boolean };

function contexts(xml: string) {
  const out = new Map<string, Context>();
  for (const m of xml.matchAll(
    /<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/g,
  )) {
    const id = attr(m[1] ?? "", "id");
    const body = m[2] ?? "";
    const end = body.match(/<(?:[\w-]+:)?(?:endDate|instant)>\s*([^<]*?)\s*</)?.[1]?.slice(0, 10);
    if (!id || !end) continue;
    const members = [
      ...body.matchAll(/<(?:[\w-]+:)?explicitMember\b([^>]*)>\s*([^<]*?)\s*</g),
    ].flatMap((d) => {
      const axis = attr(d[1] ?? "", "dimension");
      return axis && d[2] ? [{ axis: local(axis), member: d[2] }] : [];
    });
    out.set(id, { end, members, typed: /<(?:[\w-]+:)?typedMember\b/.test(body) });
  }
  return out;
}

function units(xml: string) {
  const usd = new Set<string>();
  const pure = new Set<string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?unit>/g)) {
    const id = attr(m[1] ?? "", "id");
    const measure = measureOf(m[2] ?? "");
    if (!id || !measure) continue;
    if (measure === "iso4217:USD") usd.add(id);
    else if (local(measure) === "pure") pure.add(id);
  }
  return { usd, pure };
}

type Raw = Omit<DebtFact, "qualifiers"> & {
  qualifiers: Member[];
  // Debt-type and facility-category members of the context.
  categories: Member[];
  raw: number;
  // XBRL `decimals`: how far the filer rounded the value.
  decimals: number;
};

// Two facts agree when they are equal or differ only by the rounding of the less
// precise one (a note table in dollars next to a text figure in $0.1 million).
function agree(a: Raw, b: Raw) {
  const tolerance = 0.5 * 10 ** -Math.min(a.decimals, b.decimals);
  return Math.abs(a.raw - b.raw) <= Math.max(tolerance, 1e-9 * Math.max(1, Math.abs(a.raw)));
}

const precise = (a: Raw, b: Raw) => (b.decimals > a.decimals ? b : a);

const memberText = (members: Member[]) =>
  members.map((x) => `${x.axis}=${local(x.member)}`).join(";");

// Axes and members become part of the key by local name, so the namespace year
// of a custom or us-gaap member never matters.
export function factKey(f: Pick<DebtFact, "instrument" | "qualifiers" | "metric" | "periodEnd">) {
  return `${f.instrument}|${memberText(f.qualifiers)}|${f.metric}|${f.periodEnd}`;
}

const sortAxes = (members: Member[]) => members.toSorted((a, b) => a.axis.localeCompare(b.axis));

// Facts that share instrument, qualifiers, metric and date. Category members
// normally repeat the instrument ("senior notes" next to the notes), so the
// facts are one value. When their values differ the categories split the
// instrument into parts (secured and unsecured capacity of one term loan), and
// each part keeps its categories as qualifiers. Within one category set, two
// values mean the key is missing a dimension.
function settle(group: Raw[]): DebtFact[] {
  const byCategory = new Map<string, Raw>();
  for (const f of group) {
    const key = memberText(f.categories);
    const prior = byCategory.get(key);
    if (!prior) byCategory.set(key, f);
    else if (agree(prior, f)) byCategory.set(key, precise(prior, f));
    else {
      throw permanent(
        `conflicting values for ${factKey(f)} ${key}: ${prior.filed} and ${f.filed}; the series key is missing a dimension`,
      );
    }
  }
  const parts = [...byCategory.values()];
  const [first, ...rest] = parts;
  if (first && rest.every((f) => agree(first, f))) {
    const { categories: _c, raw: _r, decimals: _d, ...fact } = parts.reduce(precise);
    return [fact];
  }
  // A category shared by every part (the loan is a "line of credit") says nothing
  // about the split, so only the members that tell the parts apart are kept.
  const shared = new Set(
    parts.flatMap((f) =>
      f.categories
        .filter((c) =>
          parts.every((p) => p.categories.some((x) => memberText([x]) === memberText([c]))),
        )
        .map((c) => memberText([c])),
    ),
  );
  return parts.map(({ categories, raw: _r, decimals: _d, ...fact }) => ({
    ...fact,
    qualifiers: sortAxes([
      ...fact.qualifiers,
      ...categories.filter((c) => !shared.has(memberText([c]))),
    ]),
  }));
}

export function parseInstance(xml: string): ParsedInstance {
  // The us-gaap namespace year changes between filings; match on the prefix
  // bound to any us-gaap namespace.
  const prefix = xml.match(/xmlns:([\w-]+)="http:\/\/fasb\.org\/us-gaap\/[^"]*"/)?.[1];
  const skipped = { aggregate: 0, unit: 0, typed: 0 };
  if (!prefix) return { facts: [], skipped };
  const ctx = contexts(xml);
  const unit = units(xml);
  const concepts = [...METRIC_BY_CONCEPT.keys()].join("|");
  const re = new RegExp(
    `<${prefix}:(${concepts})\\b([^>]*?)>\\s*([^<]*?)\\s*</${prefix}:\\1>`,
    "g",
  );
  const groups = new Map<string, Raw[]>();

  for (const m of xml.matchAll(re)) {
    const attrs = m[2] ?? "";
    const metric = METRIC_BY_CONCEPT.get(m[1] ?? "");
    const context = ctx.get(attr(attrs, "contextRef") ?? "");
    if (!metric || !context || attr(attrs, "xsi:nil") === "true") continue;
    if (context.typed) {
      skipped.typed += 1;
      continue;
    }
    const byAxis = new Map(context.members.map((x) => [x.axis, x.member]));
    const instrumentAxis = INSTRUMENT_AXES.find((axis) => byAxis.has(axis));
    const instrumentQName = instrumentAxis && byAxis.get(instrumentAxis);
    if (!instrumentAxis || !instrumentQName) {
      skipped.aggregate += 1;
      continue;
    }
    const unitRef = attr(attrs, "unitRef") ?? "";
    const percent = METRICS[metric].percent;
    const raw = Number(m[3]);
    if (!(percent ? unit.pure : unit.usd).has(unitRef) || !m[3] || !Number.isFinite(raw)) {
      skipped.unit += 1;
      continue;
    }
    const decimals = attr(attrs, "decimals");
    const fact: Raw = {
      metric,
      instrument: local(instrumentQName),
      instrumentQName,
      qualifiers: sortAxes(context.members.filter((x) => !CATEGORY_AXES.has(x.axis))),
      categories: sortAxes(
        context.members.filter((x) => CATEGORY_AXES.has(x.axis) && x.axis !== instrumentAxis),
      ),
      periodEnd: context.end,
      // Rounded so 0.0975 x 100 is 9.75, not 9.750000000000002.
      value: percent ? Number((raw * 100).toFixed(10)) : raw,
      filed: m[3],
      raw,
      decimals:
        decimals === undefined || decimals === "INF" ? Number.POSITIVE_INFINITY : Number(decimals),
    };
    const key = factKey(fact);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return { facts: [...groups.values()].flatMap(settle), skipped };
}

const decode = (text: string) =>
  text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

// Standard labels from a label linkbase, keyed like "crwv_DDTL2.1FacilityMember"
// (the fragment of the concept's schema locator). Standard labels of members end
// in " [Member]", which is dropped.
export function parseLabels(xml: string) {
  const fragments = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?loc\b([^>]*)>/g)) {
    const label = attr(m[1] ?? "", "xlink:label");
    const fragment = attr(m[1] ?? "", "xlink:href")?.split("#")[1];
    if (label && fragment) fragments.set(label, fragment);
  }
  const texts = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?label\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?label>/g)) {
    const attrs = m[1] ?? "";
    const lang = attr(attrs, "xml:lang");
    if (!attr(attrs, "xlink:role")?.endsWith("/role/label")) continue;
    if (lang && !lang.toLowerCase().startsWith("en")) continue;
    const label = attr(attrs, "xlink:label");
    const text = decode(m[2] ?? "")
      .replace(/\s*\[Member\]\s*$/, "")
      .trim();
    if (label && text) texts.set(label, text);
  }
  const labels = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?labelArc\b([^>]*)>/g)) {
    const from = attr(m[1] ?? "", "xlink:from");
    const to = attr(m[1] ?? "", "xlink:to");
    const fragment = from && fragments.get(from);
    const text = to && texts.get(to);
    if (fragment && text) labels.set(fragment, text);
  }
  return labels;
}

// Used when the label linkbase has no entry. Only splits letter case, never
// digits: names like A20319.75SeniorNotesMember cannot be split reliably.
export function memberFallbackLabel(member: string) {
  return local(member)
    .replace(/Member$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

export function memberLabel(labels: Map<string, string>, qname: string) {
  const [prefix = "", name = ""] = qname.split(":");
  return labels.get(`${prefix}_${name}`) ?? memberFallbackLabel(qname);
}

// Lowercase id segment from a member name. Dots would read as id separators.
export function slug(member: string) {
  return local(member)
    .replace(/Member$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const IndexSchema = v.object({
  directory: v.object({ item: v.array(v.object({ name: v.string() })) }),
});

export type FilingFiles = {
  // Undefined when the filing carries no XBRL at all (it predates XBRL).
  instance?: string;
  labels?: string;
  hasXbrl: boolean;
};

export function parseFilingIndex(text: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw permanent("filing index is not JSON", err);
  }
  const result = v.safeParse(IndexSchema, raw);
  if (!result.success) throw permanent("unexpected filing index shape");
  return result.output.directory.item.map((i) => i.name);
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");

// Picks the instance and label linkbase from the names the filing index lists.
// Nothing is guessed: a name is used only if the index lists it.
export function findFilingFiles(names: string[], primaryDocument: string | undefined): FilingFiles {
  const lower = (n: string) => n.toLowerCase();
  const schemas = names.filter((n) => lower(n).endsWith(".xsd"));
  const hasXbrl = schemas.length > 0 || names.some((n) => lower(n).endsWith("-xbrl.zip"));
  // Inline XBRL filings list "<document>_htm.xml"; older ones "<schema>.xml".
  const inline = names.filter((n) => lower(n).endsWith("_htm.xml"));
  const preferred = primaryDocument && `${stem(primaryDocument)}_htm.xml`;
  const instance =
    inline.find((n) => n === preferred) ??
    (inline.length === 1 ? inline[0] : undefined) ??
    (schemas.length === 1 && schemas[0] && names.includes(`${stem(schemas[0])}.xml`)
      ? `${stem(schemas[0])}.xml`
      : undefined);
  const labelFiles = names.filter((n) => lower(n).endsWith("_lab.xml"));
  const base = instance && stem(instance).replace(/_htm$/, "");
  const labels = labelFiles.find((n) => base && n.startsWith(base)) ?? labelFiles[0];
  return { instance, labels, hasXbrl };
}
