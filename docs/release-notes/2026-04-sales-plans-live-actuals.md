# 2026-04 Sales Plans Live Actuals

## What changed

- `SalesPlansService.syncActuals()` no longer reads `ProfitLoss.aggregate`
- `actualRevenue` and `actualOrders` still come from `order.aggregate()`
- `actualProfit` now sums live monthly `netProfit` from `buildPerListingMetrics()`
- excluded order statuses are aligned to `cancelled`, `returned`, `refunded`

## Verification

- `cd apps/server && npx vitest run src/sales-plans/__tests__/sales-plans.service.spec.ts`
- `npm run test:integration -- src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts`
- `npm run dev:server`

## Out of scope

- `statistics`
- `settlements`
- `ad-strategy`
- `action-task`
- frontend sales-plans rewires
