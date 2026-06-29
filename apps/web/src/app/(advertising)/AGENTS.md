Consult this document first instead of relying on memorized knowledge.

# web/advertising - Ad Operations

`app/(advertising)/` owns the ad operations UI for Coupang ads, campaign
performance, scrape targets, rules, planning, and benchmark/recommendation
surfaces. It consumes backend advertising APIs and does not own catalog,
finance, or dashboard aggregation logic.

## Folder Map

```text
(advertising)/
└── ad-ops/
    ├── page.tsx
    ├── components/
    ├── hooks/
    └── lib/
```

## Owned Surfaces

- Ad operations dashboard and tab composition
- Campaign, product, trend, rule, plan, recommendation, and benchmark views
- Coupang ad scrape target configuration
- XLSX export helpers for ad operations tables

## Data Flow

```text
React Query + apiClient
  -> /api/ads/*
  -> ad-ops hooks/components
  -> queryKeys.ads + related dashboard invalidation
```

## State Rules

- `queryKeys.ads.*` owns ad data cache boundaries.
- Mutations that refresh ad facts should invalidate `queryKeys.ads.all`; changes
  that affect dashboard totals should also invalidate `queryKeys.dashboard.all`.
- Keep status/color helpers in `ad-ops/lib/` unless another route group imports
  them.
- Scrape target management is configuration only; scraping execution and raw
  ingest remain backend/extension concerns.

## Boundary Rules

- Do not pull finance settlement, catalog product editing, or raw scraper rows
  into this route group.
- Do not add browser extension messaging here without also checking the relevant
  `extensions/*/AGENTS.md`.
- Keep ad threshold display aligned with `/api/ads/config`; do not duplicate
  backend threshold policy in component state.

## Verification

```bash
npm run build --workspace=apps/web
```
