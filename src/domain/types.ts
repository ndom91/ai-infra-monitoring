import * as v from "valibot";

export const INDICATOR_IDS = [
	"gpu_rental",
	"gpu_resale",
	"credit",
	"capex_cashflow",
	"customer_concentration",
	"construction",
	"vacancy",
	"contract_conversion",
	"depreciation",
] as const;
export type IndicatorId = (typeof INDICATOR_IDS)[number];

export const CADENCES = [
	"daily",
	"weekdays",
	"weekly",
	"monthly",
	"quarterly",
	"semiannual",
	"annual",
	"irregular",
] as const;
export type Cadence = (typeof CADENCES)[number];

export const OBSERVATION_KINDS = [
	"reported",
	"calculated",
	"estimated",
	"manual",
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

const IsoDate = v.pipe(v.string(), v.isoDate());

export const SeriesDefSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_.:-]+$/)),
	indicator: v.picklist(INDICATOR_IDS),
	label: v.pipe(v.string(), v.minLength(1)),
	entity: v.optional(v.string()),
	source: v.pipe(v.string(), v.minLength(1)),
	sourceUrl: v.pipe(v.string(), v.url()),
	unit: v.pipe(v.string(), v.minLength(1)),
	currency: v.optional(v.string()),
	methodology: v.pipe(v.string(), v.minLength(1)),
	cadence: v.picklist(CADENCES),
	collector: v.string(),
});
export type SeriesDef = v.InferOutput<typeof SeriesDefSchema>;

export const ObservationInputSchema = v.pipe(
	v.object({
		seriesId: v.string(),
		periodStart: IsoDate,
		periodEnd: IsoDate,
		value: v.pipe(v.number(), v.finite()),
		kind: v.picklist(OBSERVATION_KINDS),
		asOf: v.optional(IsoDate),
		sourceUrl: v.optional(v.pipe(v.string(), v.url())),
		note: v.optional(v.string()),
	}),
	v.check(
		(o) => o.periodStart <= o.periodEnd,
		"periodStart must not be after periodEnd",
	),
);
export type ObservationInput = v.InferOutput<typeof ObservationInputSchema>;
