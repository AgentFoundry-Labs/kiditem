---
phase: 01-foundation
plan: 02
subsystem: database
tags: [prisma, nestjs, coupang-order, service-refactoring]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: CoupangOrder/CoupangOrderItem Prisma models in schema.prisma
provides:
  - dashboard.service.ts using prisma.coupangOrder.aggregate for today's order stats
  - products.service.ts using prisma.coupangOrderItem.groupBy with sellerProductId for order counts
  - reviews.service.ts using prisma.coupangOrderItem.groupBy with sellerProductId for order counts
  - seed.ts generating CoupangOrder + CoupangOrderItem records instead of legacy Order
affects: [01-foundation plan 03, 02-order-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sellerProductId-based groupBy for order counting (CoupangOrderItem.sellerProductId -> Product.coupangProductId mapping)"

key-files:
  created: []
  modified:
    - apps/server/src/dashboard/dashboard.service.ts
    - apps/server/src/products/products.service.ts
    - apps/server/src/reviews/reviews.service.ts
    - prisma/seed.ts

key-decisions:
  - "CoupangOrderItem.sellerProductId mapped to Product.coupangProductId for order count lookups (no UUID FK exists)"
  - "CoupangOrder seed data uses Json orderer/receiver fields with {name: customerName} structure"

patterns-established:
  - "Order count pattern: groupBy sellerProductId on coupangOrderItem, then map via Product.coupangProductId"

requirements-completed: [SCHM-05]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 01 Plan 02: Service Refactoring Summary

**Migrated 3 NestJS services + seed.ts from legacy Order model to CoupangOrder/CoupangOrderItem with sellerProductId-based order counting**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T16:40:39Z
- **Completed:** 2026-03-25T16:42:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Migrated dashboard.service.ts from prisma.order.aggregate to prisma.coupangOrder.aggregate (removed quantity from _sum since CoupangOrder has no quantity field)
- Migrated products.service.ts and reviews.service.ts from prisma.order.groupBy(productId) to prisma.coupangOrderItem.groupBy(sellerProductId) with Product.coupangProductId mapping
- Migrated seed.ts from prisma.order.create to prisma.coupangOrder.create + prisma.coupangOrderItem.create with proper field mapping (shipmentBoxId, orderer Json, CoupangOrderItem vendorItemId/sellerProductId/shippingCount/salesPrice)
- tsc --noEmit passes with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate 3 services from Order to CoupangOrder/CoupangOrderItem** - `c7ac94d` (refactor)
2. **Task 2: Migrate seed.ts from Order to CoupangOrder/CoupangOrderItem** - `5cf0791` (refactor)

## Files Created/Modified
- `apps/server/src/dashboard/dashboard.service.ts` - Changed order.aggregate to coupangOrder.aggregate, removed quantity from _sum
- `apps/server/src/products/products.service.ts` - Changed order.groupBy to coupangOrderItem.groupBy with sellerProductId, mapped via Product.coupangProductId
- `apps/server/src/reviews/reviews.service.ts` - Changed order.groupBy to coupangOrderItem.groupBy with sellerProductId, mapped via Product.coupangProductId
- `prisma/seed.ts` - Replaced Order seeding with CoupangOrder + CoupangOrderItem creation, updated statuses to ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY

## Decisions Made
- CoupangOrderItem has no productId UUID FK, so order counts are mapped via sellerProductId (CoupangOrderItem) -> coupangProductId (Product). Products without coupangProductId will show 0 order count.
- Seed data uses Json fields for orderer/receiver with `{ name: customerName }` structure matching the CoupangOrder schema.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 target files migrated from legacy Order to CoupangOrder/CoupangOrderItem
- tsc --noEmit passes cleanly for apps/server
- Ready for Plan 03 (data import) which will populate CoupangOrder/CoupangOrderItem from JSON data

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 01-foundation*
*Completed: 2026-03-25*
