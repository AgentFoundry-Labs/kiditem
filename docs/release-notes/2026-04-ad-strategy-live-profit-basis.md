# 2026-04 Ad Strategy Live Profit Basis

## What changed

- `AdStrategyService.loadStrategyContext()` no longer reads `ProfitLoss` rows
- `profitRateByListing` now comes from live monthly `buildPerListingMetrics()` output and stays percentage-shaped, so `20` means `20%`, not `2000%`
- dead `profitLosses` plumbing was removed from the advertising service types and `calcTop20()` input surface
- the ad-strategy routes and frontend contract stay unchanged in this step

## Verification

- `cd apps/server && npx vitest run src/advertising/services/__tests__/ad-strategy.spec.ts src/advertising/services/__tests__/ad-budget-allocator.spec.ts`
- `npm run test:integration -- src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`
- `npm run dev:server`

## Out of scope

- frontend ad-ops rewires
- action-task follow-up work
- writer/cache or snapshot reintroduction
