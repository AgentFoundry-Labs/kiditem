# 2026-04 Settlements Live Reconcile

## What changed

- `SettlementsService.reconcile()` no longer reads `ProfitLoss.findMany()`
- `plRevenue`, `plCommission`, `plNetProfit`, and `plOrderCount` now come from live monthly `buildPerListingMetrics()` output instead of snapshot rows
- the order-side raw SQL compare path remains in place as the control side of the reconcile report
- the order-side raw SQL filter is aligned to `cancelled`, `returned`, and `refunded`
- empty live periods now return empty `details` with zeroed summary totals instead of recreating dead snapshot rows

## Verification

- `cd apps/server && npx vitest run src/settlements/__tests__/settlements.spec.ts`
- `npm run test:integration -- src/settlements/__tests__/settlements-flow.pg.integration.spec.ts`
- `npm run dev:server`

## Out of scope

- `statistics`
- `ad-strategy`
- `action-task`
- reconcile export redesign
- frontend settlements rewires
