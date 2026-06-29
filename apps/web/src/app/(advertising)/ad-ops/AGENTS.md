Consult this document first instead of relying on memorized knowledge.

# web/ad-ops - Coupang Ads Operations

`ad-ops/` owns the operational ad dashboard: status, campaign, product
drilldown, strategy/planning, scrape targets, exports, and ad sync triggers.

## Owned Surfaces

- Ad status, campaign, exposure, strategy, and product drilldown tabs
- Scrape target CRUD and ad sync controls
- Ad table/chart helpers and XLSX exports

## State Rules

- Use `queryKeys.ads.*` for all ad operation reads.
- Ad sync and scrape target changes invalidate `queryKeys.ads.all`; dashboard
  aggregates affected by ad facts also invalidate `queryKeys.dashboard.all`.
- Keep ad color/status/ROAS display helpers in `lib/` unless a non-ad route
  imports them.
- Browser download/export helpers may run client-side; raw ad ingest and scrape
  execution stay backend/extension-owned.

## Boundary Rules

- Do not duplicate backend ad threshold policy. Read `/api/ads/config`.
- Do not add direct Chrome messaging here without documenting the matching
  extension capability and checking `extensions/coupang-ads-scraper/AGENTS.md`.
- Do not mix finance settlement or catalog editing behavior into ad operations.

## Verification

```bash
npm run build --workspace=apps/web
```
