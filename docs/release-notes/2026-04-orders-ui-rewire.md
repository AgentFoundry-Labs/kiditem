# Orders UI Rewire — April 2026

## Summary

- `/orders` now parses shared `OrderListResponseSchema` / `OrderStatsResponseSchema` / `OrderActionResponseSchema` at the API boundary (no more `apiClient.get<T>` shadow casts).
- The pipeline table renders fields derived from canonical `Order` + `OrderLineItem` data (`primaryProductName`, `displayOrderNumber`, `totalQuantity`, `shipmentBoxId`) instead of a local `OrderRow` shadow type.
- Scheduled Coupang order sync now calls the canonical `POST /api/coupang-sync/orders` with `{ from, to }` (was the broken `POST /api/coupang-sync` with `createdAtFrom`/`createdAtTo`). Polling is owned by React Query `refetchInterval` plus a once-per-date-hour `sessionStorage` guard, not `setInterval`.
- 발주확인 / 송장 입력 actions both call the existing `POST /api/orders` with action body and parse the action response with the shared schema; no new endpoints were added.

## Domain boundary

- Owner domain: `orders`.
- No inventory, ad-ops, root action-task, agent-registry, channel-dashboard, product catalog, procurement, stock-audits backend, or channels/coupang backend implementation modified.
- ADR-0019 same-domain cross-layer rule respected.

## DB impact

- No Prisma schema migration.
- No native PG enum added (status remains string-backed; Zod-only narrowing in the server `toListItem` mapper via `OrderStatusSchema.parse`).

## Verification

All commands run from the W3 worktree at `~/Workspace/omc-worktrees/feat/kiditem-w3-orders-ui` on branch `feat/w3-orders-ui` (base `main @ 5dae905`).

```
# Shared
npx vitest run packages/shared/src/schemas/order.spec.ts   → PASS (4) FAIL (0)
(cd packages/shared && npm run build)                      → Build success; dist/schemas/index.d.ts 6.92 KB

# Server orders
(cd apps/server && npx vitest run src/orders/services/__tests__/order-flow.spec.ts) → PASS (10) FAIL (0)
(cd apps/server && npx tsc --noEmit --pretty false)        → 0 errors in apps/server/src/orders/**
npm run dev:server                                         → "Nest application successfully started"
                                                             (port :4000 EADDRINUSE from a sibling main-session
                                                             server is unrelated; orders module DI imports
                                                             resolve cleanly)

# Web orders
(cd apps/web && npx vitest run src/app/orders/__tests__/order-pipeline.spec.ts \
   src/app/orders/__tests__/orders-page.spec.tsx)          → PASS (7) FAIL (0)
(cd apps/web && npx tsc --noEmit --pretty false)           → 0 errors
npm run build --workspace=apps/web                         → exit 0
```

Static W3 closure greps:

```
rg -n "interface OrderRow|apiClient\.get<|/api/coupang-sync\"|createdAtFrom|createdAtTo|API 연동 예정|toLocale(Date|Time)String|placeholder action" \
  apps/web/src/app/orders apps/server/src/orders packages/shared/src/schemas/order.ts → 0 matches
rg -n "satisfies Order(ListItem|ListResponse|StatsResponse|ActionResponse)" \
  apps/server/src/orders/services/orders.service.ts → 5 matches across 4 unique types
```

First non-W3 failing path: none. Web build is green.
