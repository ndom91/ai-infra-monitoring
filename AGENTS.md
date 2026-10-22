# Artificial Liabilities: contributor guide

## Project

Artificial Liabilities is a TanStack Start research dashboard deployed as a
Cloudflare Worker. It uses Turso for storage and pnpm 12 with Node 24.

Keep the research rules intact: do not invent or interpolate values, label
derived figures as calculated, do not present stale data as current, and do
not collect sources whose terms forbid automation.

## Local configuration

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm collect all --backfill
pnpm dev
```

`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` configure Turso. Leave both empty
to use `data/local.db`. `SEC_USER_AGENT` must provide a contact address, for
example `"AIInfraMonitor you@example.com"`.

## Operating data collection

```bash
pnpm collect <fred|sec|azure|aws|manual|all> [--backfill] [--no-alerts]
pnpm alerts [--backtest]
pnpm db:backup [dir]
pnpm db:restore <dir>
```

- Collectors are idempotent. Changed values are stored as new vintages; prior
  history is never overwritten.
- `pnpm collect` exits 1 for a partial or transient failure and 2 for a
  permanent failure. The Coverage page shows run failures and their messages.
- Hand-curated data belongs in `data/manual/*.yaml`; every value needs a cited
  quote. Follow `data/manual/README.md`.
- Alert thresholds are in `data/alerts.config.yaml`.

## Validation

Run these before committing code changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:bundle
```

`check:bundle` ensures server-only dependencies do not enter the browser
bundle.

## Scheduled workflows

- `collect-fred.yml`: weekdays at 08:07 UTC.
- `collect-sec.yml`: weekdays at 08:13 UTC.
- `collect-sec-filings.yml`: weekdays at 08:00, 13:00, and 18:00 UTC.
- `collect-prices.yml`: weekly.
- `collect-eia.yml`: monthly, after EIA's normal monthly publication window.
- `collect-manual.yml`: when `data/manual/**` changes on `main`, or manually.
- `backup.yml`: weekly database backup, retained for 90 days as an artifact.
- `remind-datacenter-reports.yml`: weekly during February and August; opens a
  review issue with the official CBRE and JLL report links.
- `ci.yml`: build, bundle check, typecheck, lint, and tests.

## Deployment

1. Create the Turso database, set its credentials in `.env`, then run
   `pnpm db:migrate` and `pnpm collect all --backfill`.
2. Add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `SEC_USER_AGENT` as
   repository secrets so collection workflows can access the database.
3. Connect the repository to a Cloudflare Worker. Use `pnpm build` for the
   build command and `pnpm deploy` for deployment.
4. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as encrypted runtime
   variables for both Production and Preview. Keep these dashboard-managed;
   `pnpm deploy` preserves them.

The app is server-rendered by a Worker, not exported as a static site.
Production is public at [artificialliabilities.com](https://artificialliabilities.com).
Ensure deployed data continues to comply with every collector's source terms.

To deploy from a local machine, run `pnpm wrangler login` followed by
`pnpm deploy`. To run the built production server locally, use
`pnpm build && pnpm start`.
