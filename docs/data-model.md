# Data model

All tables live in SQLite (Turso in production, `data/local.db` locally).
Schema: `src/storage/schema.ts`; migrations: `drizzle/`.

## `series`

One row per time series, holding its static provenance so observation rows stay small.

| Column | Notes |
|---|---|
| `id` | e.g. `fred.BAMLH0A0HYM2`, `sec.CRWV.capex`, `aws.h100.us-east-1.ondemand` |
| `indicator` | One of the nine indicator ids |
| `label`, `entity` | Display name; company ticker / GPU cohort / market |
| `source`, `source_url` | Publisher and original data URL |
| `unit`, `currency` | `%`, `USD`, `USD/GPU-hr`, `MW`, `years`, ... |
| `methodology` | Exact definition, tags used, derivations, caveats |
| `cadence` | Drives freshness |
| `collector` | Which collector owns it |

## `observations` (append-only)

| Column | Notes |
|---|---|
| `period_start`, `period_end` | Observation period. Equal for daily values and balance-sheet instants. |
| `value` | Always in the series unit. |
| `kind` | `reported` (as published), `calculated` (we derived it, e.g. Q4 = FY − 9M), `estimated`, `manual` (hand-entered with citation). |
| `as_of` | Publication or filing date of this vintage, when known. |
| `source_url` | The specific filing or report, when more precise than the series URL. |
| `note` | Derivation details, citations. |
| `collected_at`, `run_id` | When and by which run it was stored. |
| `is_latest` | Maintained on write. |

**Revisions:** a re-collected value that differs from the stored latest value
is inserted as a new row, and the old row gets `is_latest = 0`. Nothing is
overwritten or deleted, so every past vintage is reproducible. An unchanged
value inserts nothing.

## Derived metrics

Ratios such as TTM capex / OCF are **not stored**. They are computed at read
time from raw observations (`src/server/derived.ts`, `src/metrics/`), so a
methodology change never leaves stale derived rows behind. They are always
labeled "calculated" in the UI.

## `raw_snapshots`

Gzipped API responses (trimmed to the fields used) from price collectors, deduplicated by SHA-256. They let aggregates be recomputed later.

## `collector_runs`

One row per run: status (`ok`, `partial`, `failed`), error class, message, counts of fetched / new / revised / unchanged observations.

## `alert_events`

One row per fired rule, with `evidence` JSON listing the exact triggering observations (ids, periods, values, sources) and rule parameters. `dedupe_key` makes re-evaluation idempotent.
