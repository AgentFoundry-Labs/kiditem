# 2026-04 Statistics Live Aggregation

## What changed

- `StatisticsService` no longer reads `ProfitLoss` for `overview`, `products`, `categories`, `grades`, or `pareto`
- `overview.totalOrders` now uses distinct accepted order count instead of summing listing-level counts
- `Statistics.tsx` now fetches each tab through `apiClient.getParsed(...)` with shared statistics schemas
- repurchase `lastOrder` now accepts both ISO JSON strings and server-side `Date` objects via `zIsoDate`
- sales-analysis statistics UI now has explicit loading / error / empty states

## Verification

- `npx vitest run packages/shared/src/schemas/statistics.spec.ts` — PASS (`2 passed`)
- `cd packages/shared && npm run build` — PASS
- `cd apps/web && npx vitest run src/app/sales-analysis/__tests__/Statistics.spec.tsx` — PASS (`4 passed`)
- `npm run build --workspace=apps/web` — BLOCKED by pre-existing `apps/web/src/app/ad-ops/components/AdSidePanel.tsx:19` (`strategy.adIssues` → `strategy.issues` drift), outside `statistics` ownership

## Out of scope

- `sales-plans`
- `settlements`
- `ad-strategy`
- `action-task`
- ProfitLoss writer/cache strategy (`S1`)
