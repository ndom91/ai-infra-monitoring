# AI Infrastructure Risk Monitor

Dashboard of leading/lagging indicators for an AI-infrastructure capital cycle.
Values are never synthesized: a card stays empty until verified observations exist.

Stack: TanStack Start (React, Vite 8), TypeScript 7 (native Go `tsc`), Biome, pnpm, Chart.js.

## Commands

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm data:refresh   # pull latest FRED credit spreads into data/observations.json
pnpm typecheck
pnpm lint           # pnpm format to auto-fix
pnpm build && pnpm start
```

## Layout

- `data/observations.json`: all series. Read on every request, so edits show on reload.
- `src/lib/indicators.ts`: card definitions (title, unit, source, caveat) and window helpers.
- `src/lib/observations.ts`: server function that reads the data file.
- `src/routes/index.tsx`: dashboard. The time window lives in the URL (`?window=90|365|0`).
- `scripts/refresh-data.ts`: FRED importer. Uses Node built-ins only.
- `.github/workflows/refresh.yml`: runs the importer on weekdays and commits the result.

## Adding observations

Append `{ "date": "YYYY-MM-DD", "value": number, "source": "URL or citation" }` to the matching
`series` array. Keep each series to one consistent cohort, issuer, and definition.
To add a new card, add a series key to the data file and an entry to `INDICATORS`.

Automated: FRED `BAMLH0A0HYM2` (HY OAS) and `BAMLH0A3HYC` (CCC OAS).
Seeded: CBRE H1 2026 vacancy, preleasing, construction; Meta FY2024 asset useful life.
Empty by design: GPU rental, GPU resale, capex/OCF, customer concentration, backlog conversion.

This is a research dashboard, not investment advice.
