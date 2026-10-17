# Manually curated data

Figures that only exist in PDF reports, press releases and filing text (no API)
live here as YAML, one file per theme. The `manual` collector
(`src/collectors/manual/`) reads every `data/manual/*.yaml` file, validates it
and appends it to the database like any other collector:

```sh
pnpm check:manual          # validate all files, no database access
pnpm collect manual        # validate and store (append-only, idempotent)
```

A validation failure fails the whole run with a permanent error naming the
file and field; nothing is written.

## Format

```yaml
series:
  - id: cbre.na_primary.vacancy        # unique across all files, [A-Za-z0-9_.:-]
    indicator: vacancy                   # an indicator id from src/domain/types.ts
    label: North America primary-market data-center vacancy
    entity: North America primary markets   # optional
    source: CBRE North America Data Center Trends
    source_url: https://...              # publisher / series landing page
    unit: "%"
    currency: null                       # optional, e.g. USD
    cadence: semiannual                  # daily|weekdays|weekly|monthly|quarterly|semiannual|annual|irregular
    methodology: >
      Exact definition as published, market definition, caveats.
    observations:                        # at least one
      - period_start: 2026-01-01         # period the value describes
        period_end: 2026-06-30           # unique within the series
        value: 1.4                       # a number, not a string
        kind: manual                     # manual (default) | calculated | estimated
        as_of: 2026-08-20                # publication / filing date, optional, not in the future
        source_url: https://...          # required: the specific report, filing or article
        quote: "Verbatim sentence from source_url stating the number."   # required
        note: optional context           # required when kind is calculated/estimated
```

Unknown keys are rejected, so typos fail loudly. The observations table has no
quote column yet, so the collector stores the quote at the end of `note` as
`Source quote: "..."`.

Point-in-time facts (a useful-life change, a bond's coupon at issue) use
`period_start = period_end = effective date`.

## Adding observations

1. Find the figure in the primary source (report, 10-K/10-Q/8-K, press
   release). Copy the sentence that states it verbatim into `quote`.
2. Set `source_url` to the exact page you read, and `as_of` to its
   publication date.
3. Append the observation to the right series (or add a series). Keep
   observations in date order.
4. Run `pnpm check:manual`, then `pnpm collect manual`.

To correct a value, edit it in place. The runner keeps the old value as a
superseded vintage, so the correction is visible in history. Do not delete
observations that were wrong; fix them and say what changed in `note`.

## Rules

- **Only record a number you have read in a source.** The `quote` must
  contain the number (or the words it is converted from, e.g. "six years").
- If the primary source is gated (paywall, form-gated PDF), a reputable
  secondary source that cites it is acceptable. Point `source_url` at that
  page and say "Secondary source citing ..." in `note`.
- **Derived values are never `manual`.** A prior-year level computed from a
  stated year-over-year change, a ratio, a unit conversion that involves
  arithmetic: `kind: calculated` with the derivation in `note`. Model output or
  judgement: `kind: estimated`. Converting "six years" to 6 is not a
  derivation.
- No interpolation, no placeholder dates. If the effective date is not stated,
  use the first day of the period the filing says the change applied from, and
  say so in `note`.
- One publisher and one definition per series. Never merge CBRE and JLL (they
  define markets differently), quarter and year-to-date figures, or issue
  terms and market yields.
- Prefer sec.gov and official investor-relations pages over news coverage.
- Respect robots.txt and terms of use. Reading a published page once to record
  a figure by hand is fine; do not build automated scrapers of CBRE, JLL,
  amcompute or serverbuyback.

## Files and sources

### `datacenter_supply.yaml` (indicators `construction`, `vacancy`)

- CBRE North America Data Center Trends, H2 2021 to H1 2026:
  `cbre.com/insights/reports/north-america-data-center-trends-<half>` (through
  H1 2025) and `cbre.com/insights/books/north-america-data-center-trends-<half>`
  (H2 2025 onward), plus CBRE press releases at `cbre.com/press-releases/`.
- JLL North America Data Center Report:
  https://www.jll.com/en-us/insights/market-dynamics/north-america-data-centers,
  the public Midyear 2025 PDF, and JLL newsroom releases.
- Secondary sources, used only where noted: McMorrow Reports (republishes CBRE's
  H1 2023 release) and Data Center Frontier (JLL Year-End 2025 preleasing).

CBRE used seven primary markets through H2 2022 and eight (adding Hillsboro)
from H1 2023. JLL changed scope twice, so each scope is its own series family:
`jll.us_colo.*` (Midyear 2024, U.S. colocation), `jll.na_colo.*` (Year-End 2024
to Midyear 2025, North America colocation) and `jll.na.*` (Year-End 2025 on,
adds hyperscaler-owned capacity and frontier markets). Do not chart them as one
line.

### `depreciation.yaml` (indicator `depreciation`)

10-K, 10-Q, 20-F and earnings-release exhibits on sec.gov for Amazon, Meta,
Alphabet, Microsoft, Oracle, CoreWeave (S-1), Nebius and IREN. Each series is a
step function: one baseline plus one observation per disclosed change, with
period = effective date and as_of = disclosure date. Several changes apply only
to a subset of assets (Meta 2022 "a majority", Meta 2025 "certain", Amazon 2025
"a subset"); the note on each observation says which.

### `customer_concentration.yaml` (indicator `customer_concentration`)

10-K, 10-Q, S-1, 424B4, 20-F, 6-K and 8-K exhibits on sec.gov for CoreWeave,
Core Scientific, Nebius, IREN, Applied Digital, Cipher, TeraWulf and Hut 8.
Shares of revenue are split by period length (`_q`, `_6m`, `_9m`, `_fy`).
Contract values (`*_contract_value`, USD bn) are headline maximum/total
contract values at announcement. They can include options, are not RPO and are
not guaranteed cash flow.

### `gpu_resale.yaml` (indicator `gpu_resale`)

American Compute GPU Resale Index
(https://www.amcompute.com/gpu-resale-index, CSV at `/gpu-resale-index/data.csv`).
This is a basket index of realized sale prices as a share of price new
(H1 2025 = 100). It is not a per-model USD price, asking price or buyback offer.
The index page and CSV header both say "Free to use with attribution."
Attribution: American Compute, GPU Resale Index. The site-wide Terms of Use
otherwise limit use to personal, noncommercial access and ban scraping. Update
by hand from the monthly CSV; do not automate. Ask hello@amcompute.com before
any commercial use. The publisher may restate recent months as late sales come
in; enter those as corrections.

### `issuer_debt.yaml` (indicator `credit`)

8-K and 6-K filings and exhibits on sec.gov for CoreWeave (including the
2025-03-31 424B4 for DDTL 1.0 and the revolver), TeraWulf, Cipher, Applied
Digital, Core Scientific, IREN and Nebius. Coupons are issue terms, recorded
once at the closing date. SOFR margins are contract terms at signing. Neither
is a trading yield or a credit spread. Ratings on the CoreWeave 2030 notes come
from Investing.com articles that cite Moody's, S&P and Fitch, and appear in
notes only.

## Unavailable sources

### Sources not used

- **ServerBuyback GPU Resale Value Index**
  (https://serverbuyback.com/resources/gpu-resale-value-index/). Not recorded,
  for three reasons:
  - No license. The page shows only "© 2026 ServerBuyback.com", and the terms
    (https://serverbuyback.com/terms/) say nothing about reuse. robots.txt
    signals `use=reference`, `ai-train=no`.
  - Mixed value types. The figures are ranges built from "public secondary-market
    listings and broker aggregates, cross-checked ... against our own deal
    observations". The terms call them "estimates, not appraisals". They are
    neither completed transactions nor firm buyback offers.
  - No history. The page is a monthly-refreshed snapshot with no dated series.

  Citing it in prose is fine. Republishing the series is not.
- **FINRA fixed-income data** (https://www.finra.org/finra-data/fixed-income).
  Not usable for an issuer-bond collector:
  - The free per-CUSIP search requires accepting a User Agreement that limits use
    to "personal, non-commercial purposes only". It bars "any robot, spider,
    other automatic or manual process to monitor or copy the Data" and bars
    distributing the data. CUSIP use needs a separate CGS license.
  - The free FINRA Query API (Public credential) has only aggregate fixed-income
    datasets, with no per-CUSIP corporate bond prices or yields. "TRACE API is
    not part of the FINRA API Platform."
  - Per-bond TRACE data requires a paid vendor agreement (FINRA Rule 7730).
- **Bond CUSIPs**: none found in a primary source (the indentures don't print
  them). Aggregator sites list 21873SAB4 / US21873SAB43 for the CoreWeave 9.25%
  2030 144A notes. That is unverified, so it is not recorded.
- **Completed GPU sale prices from other sources**: no freely licensed source
  found. eBay sold listings are barred from scraping by the eBay User Agreement.
  Blog and broker price guides are unlicensed and disagree widely (used H100
  quoted anywhere from about $6k to $40k). Ornn OCPI and Silicon Data are rental
  indices, not sale prices.
- **datacenterdynamics.com**: returned 403, not used.

### Figures not verified (left out)

- CBRE:
  - Half-year net absorption for H2 2022 to H1 2025 is only in charts.
  - Preleased % for H2 2022, H2 2024 and H2 2025 is not in the text.
  - Inventory totals for H1 2023 and H1 2024: only the change is stated.
  - 250-500 kW rents for H1 2025 and H1 2026: only % changes are given, and the
    base is ambiguous.
  - H2 2021 vacancy is not stated.
  - Known restatements are listed in the observation notes, including
    H2 2023 under construction (3,077.8 vs 3,245.2 MW) and three different
    published H2 2025 rent levels.
- JLL:
  - 2022-2023 reports: no fetchable source.
  - Year-End 2024 preleasing, inventory and rents: the PDF returns 404.
  - Year-End 2025 total absorption is not stated.
  - Dollar rents for Year-End 2025 and Midyear 2026: only % changes.
- Depreciation:
  - Applied Digital and Core Scientific disclose only ranges.
  - Lambda has no SEC filing.
  - Alphabet's network baseline is a range ("three to five years").
  - Meta's 3 to 4 year moves before 2021 are undated.
- Customer concentration:
  - CoreWeave Q4 quarter-only shares are not disclosed.
  - CoreWeave's 2026 largest customers are unnamed, so they are in the
    `largest_customer` series, not `microsoft`.
  - Applied Digital's pre-restatement figures were excluded.
  - Galaxy Digital discloses neither customer shares nor a Helios contract value.
  - IREN, Cipher, TeraWulf and Hut 8 disclose no customer share of total
    revenue.
  - TeraWulf Core42 and Hut 8 Beacon Point Phase 1 contracts: no exact dates.
- Issuer debt:
  - Ratings other than on the CoreWeave 2030 notes: agency pages are gated.
  - CoreWeave revolver margin after the November 2025 amendment: not filed.
  - DDTL 2.0 original margin is a grid, not one figure.
  - Issue prices of the June 2026 USD/EUR notes: the pricing release returned
    403.
  - Exact maturity dates of some Nebius convertibles.
  - Pre-2025 convertibles are out of scope.
