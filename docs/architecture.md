# Architecture

```
external sources ──► collectors ──► runner ──► SQLite (Turso / local file)
                                                   │
                       alerts (rules YAML) ◄───────┤
                                                   ▼
                      server functions (+ derived metrics) ──► TanStack Start UI
```

## Layers

| Layer | Path | Responsibility |
|---|---|---|
| Collectors | `src/collectors/<name>/` | Fetch one source, parse, return `SeriesDef[]` + `ObservationInput[]`. Pure parse functions, tested against recorded real responses in `test/fixtures/`. |
| Runner | `src/collectors/runner.ts` | Validates with valibot, writes append-only in one batch, logs every run to `collector_runs`. |
| Storage | `src/storage/` | Drizzle schema, migrations (`drizzle/`), libSQL client, indexed queries. |
| Domain | `src/domain/` | Indicator definitions, freshness rules, coverage matrix, ranges, tracked companies. |
| Metrics | `src/metrics/` | Pure functions: changes over windows, resampling, TTM, ratios. Unit-tested. |
| Alerts | `src/alerts/` | Rule config, pure evaluators, cooldowns, event writer. |
| Server | `src/server/` | `createServerFn` loaders; derived series are computed here at read time. |
| UI | `src/routes/`, `src/components/` | Presentation only. |

## Collectors

| Name | Source | Cadence | Backfill |
|---|---|---|---|
| `fred` | FRED graph CSV | weekdays | ICE BofA: rolling 3 years only. Moody's / Treasury: from 2000. |
| `sec` | SEC XBRL companyfacts | daily check | Full history every run. |
| `azure` | Azure Retail Prices API | weekly | Only the date the current price took effect. |
| `aws` | AWS Price List Bulk API | weekly | Monthly price lists for the last 24 months. |
| `manual` | `data/manual/*.yaml` | on change | Whatever is cited. |

Each collector is independently runnable (`pnpm collect <name>`), idempotent,
and safe to retry.

## Error handling

- `transient`: network errors, timeouts, HTTP 429/5xx. Retried with backoff inside a run.
- `permanent`: other 4xx, schema drift, invalid values. Not retried.
- A collector with several sub-sources (FRED series, SEC companies, regions)
  reports per-sub-source failures. The run is then `partial`: good data is
  written, failures are logged and shown on the Coverage page.
- `pnpm collect` exits 0 (ok), 1 (partial or transient), or 2 (permanent), so
  scheduled jobs go red instead of failing silently.

## Freshness

Each series has a cadence. Its state is derived from the age of the latest
observed period plus the last run status (`src/domain/freshness.ts`):

| State | Meaning |
|---|---|
| Current | Latest period is within the expected window for its cadence. |
| Stale | Older than expected; the collector is running fine, the source has not published (or a manual entry is due). |
| Source unavailable | Old data and the last run failed or was partial. |
| Historical only | One-off disclosures with no expected cadence. |
| Awaiting data | No observations yet. |

## Scheduling and hosting

- Collectors run in GitHub Actions (`.github/workflows/collect-*.yml`) and write directly to Turso.
- The UI runs on Cloudflare Pages. Production builds use Nitro's `cloudflare_pages`
  preset, which produces static assets plus a Pages Function for server rendering.
- `backup.yml` exports every table weekly as a 90-day artifact.
