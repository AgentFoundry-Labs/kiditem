# 2026-04 Action Task Live Profit Basis

## What changed

- `ActionTaskService.getTasks(organizationId)` now derives finance warnings from `buildPerListingMetrics()`
- removed `resolveOrganizationId()` fallback and all `profitLoss` reads from action-task
- related products now come from one live metrics array plus tenant-scoped inventory joins
- added dedicated unit and PG integration coverage for `getTasks()`

## Verification

- `cd apps/server && npx vitest run src/action-task/__tests__/action-task-flow.spec.ts src/action-task/__tests__/action-task-claim.spec.ts src/action-task/__tests__/action-task-get-tasks.spec.ts`
- `npm run test:integration -- src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts`
- `npm run dev:server`

## Out of scope

- root dashboard `apiClient.getParsed('/api/action-tasks')` follow-up
- claim / unclaim / list behavior changes
- frontend action-task rendering rewires
- writer/cache or snapshot reintroduction
