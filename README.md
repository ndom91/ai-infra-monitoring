# Artificial Liabilities

Tracking the balance sheet behind the AI build-out.

A research dashboard for one question: is the AI infrastructure build-out
creating unsustainable overcapacity, leverage, and credit risk? It tracks nine
indicators across GPU economics, credit, physical supply, and company
fundamentals, with source-level provenance and freshness on every series.

**Rules it follows:** values are never invented or interpolated. Derived
figures are labeled "calculated". Stale data is never shown as current.
Sources whose terms forbid automated collection are not used.

Stack: TanStack Start (React, Vite 8, Cloudflare Workers), TypeScript 7, Drizzle
+ libSQL (Turso), valibot, Chart.js, Vitest, Biome, pnpm.

## Setup

```bash
pnpm install
cp .env.example .env     # fill in, or leave TURSO_* empty for a local file DB
pnpm db:migrate
pnpm collect all --backfill   # first run: pulls all available history
pnpm dev                      # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Turso database. Empty = `data/local.db`. |
| `SEC_USER_AGENT` | SEC requires a contact in the User-Agent, e.g. `"AIInfraMonitor you@example.com"`. |

## Operating

```bash
pnpm collect <fred|sec|azure|aws|manual|all> [--backfill] [--no-alerts]
pnpm alerts [--backtest]     # re-evaluate alert rules (backtest replays history)
pnpm db:backup [dir]         # export all tables as gzipped NDJSON
pnpm db:restore <dir>        # load a backup into an empty database
```

- Collectors are idempotent: re-running writes nothing unless a value changed.
  A changed value is stored as a new vintage; history is never overwritten.
- `pnpm collect` exits 1 on a partial or transient failure and 2 on a
  permanent one. Failures appear on the **Coverage** page with their message.
- Hand-curated data (broker reports, useful-life changes, concentration) lives
  in `data/manual/*.yaml`, one cited quote per value. See `data/manual/README.md`.
- Alert thresholds live in `data/alerts.config.yaml`.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm check:bundle   # fails if server-only code reaches the browser
```

## Deployment

1. **Database:** create a Turso database, then run `pnpm db:migrate` and
   `pnpm collect all --backfill` with its credentials in `.env`.
2. **Collection:** push to GitHub and add the repository secrets
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `SEC_USER_AGENT`. Workflows:
   - `collect-fred.yml`: weekdays
   - `collect-sec.yml`: daily (data changes only after filings)
   - `collect-prices.yml`: weekly
   - `backup.yml`: weekly DB export, kept 90 days as an artifact
   - `ci.yml`: build, bundle check, typecheck, lint, tests
3. **Frontend:** create a Cloudflare Worker connected to this repository. Use
   `pnpm build` as its build command and `pnpm deploy` as its deploy command.
   Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as encrypted runtime
   variables for both Production and Preview deployments. They remain managed
   in the Cloudflare dashboard and are preserved by the deploy command. The app
   is rendered by a Worker, not exported as a static site.
    Production is public at [artificialliabilities.com](https://artificialliabilities.com).
    Ensure the deployed data remains consistent with the source terms for each
    collector.

   To deploy from a machine instead, authenticate with `pnpm wrangler login` and
   run `pnpm deploy`.

Locally, `pnpm build && pnpm start` runs the production server.

## Docs

- [Architecture](docs/architecture.md): layers, collectors, error handling, freshness.
- [Data model](docs/data-model.md): tables, vintages, derived metrics.
- [Coverage](docs/coverage.md): what each indicator can and cannot show, and why.

Research dashboard, not investment advice.
