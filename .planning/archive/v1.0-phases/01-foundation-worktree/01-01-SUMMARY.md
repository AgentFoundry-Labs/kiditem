---
phase: 01-foundation
plan: 01
subsystem: database
tags: [prisma, postgresql, coupang, schema, order, return, product-item]

# Dependency graph
requires: []
provides:
  - CoupangOrder + CoupangOrderItem Prisma models (2-tier shipmentBox structure)
  - CoupangReturn + CoupangReturnItem Prisma models (2-tier receipt structure)
  - ProductItem Prisma model (product options/variants)
  - Product model extension (deliveryInfo, images, delivery charge fields)
  - db:seed-coupang npm script
affects: [01-02, 01-03, 02-order-dashboard, 03-return-dashboard, 04-product-enhancement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coupang large IDs stored as String @db.VarChar(30) to prevent BigInt serialization errors"
    - "2-tier parent-child model pattern (Order->OrderItem, Return->ReturnItem)"
    - "JSON columns for nested objects (orderer, receiver, deliveryInfo, images)"

key-files:
  created: []
  modified:
    - prisma/schema.prisma
    - package.json

key-decisions:
  - "All Coupang IDs use String @db.VarChar(30) per D-07 decision"
  - "Existing Order model preserved for backward compatibility (Plan 02 handles migration)"
  - "Product images stored as Json? @default('[]') for flexible URL array"

patterns-established:
  - "CoupangOrder/CoupangReturn models follow parent(unique coupang ID) + child items pattern"
  - "All new models use UUID PK, camelCase fields with @map('snake_case'), @@map('table_name')"
  - "No native PG enums - all status/type fields are String"

requirements-completed: [SCHM-01, SCHM-02, SCHM-03, SCHM-04]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 1 Plan 01: Schema Models Summary

**CoupangOrder/Return 2-tier models + ProductItem + Product extension added to Prisma schema with VarChar(30) Coupang IDs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T16:36:14Z
- **Completed:** 2026-03-25T16:38:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added CoupangOrder + CoupangOrderItem models with shipmentBox-based 2-tier structure
- Added CoupangReturn + CoupangReturnItem models with receipt-based 2-tier structure
- Added ProductItem model for product variants/options (vendorItemId, prices, isActive)
- Extended Product model with deliveryInfo (Json), images (Json), delivery charge fields
- Added Company relations for coupangOrders and coupangReturns
- Added db:seed-coupang npm script to package.json
- Prisma validate and generate both pass successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema + package.json update** - `1082bca` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `prisma/schema.prisma` - Added 5 new models (CoupangOrder, CoupangOrderItem, CoupangReturn, CoupangReturnItem, ProductItem), extended Product model with 5 fields + 1 relation, added Company relations
- `package.json` - Added db:seed-coupang script

## Decisions Made
- All Coupang large IDs use String @db.VarChar(30) as decided in D-07 to prevent BigInt serialization errors
- Existing Order model preserved unchanged; migration to CoupangOrder handled in Plan 02 (per D-01, D-15-D-18)
- Product.images uses Json? @default("[]") for flexible image URL array storage
- 10 total VarChar(30) fields across all new models for Coupang identifiers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Prisma v7 requires DATABASE_URL environment variable for validate/generate commands. Provided inline for worktree context where Docker is not running. No impact on schema correctness.

## User Setup Required

None - no external service configuration required. Schema changes will be applied to DB via `npm run db:push` when Docker is running.

## Next Phase Readiness
- Schema foundation ready for Plan 02 (service refactoring to use CoupangOrder/CoupangReturn)
- Schema foundation ready for Plan 03 (seed-coupang.ts data import)
- `prisma generate` completed - Prisma Client types available for new models

---
*Phase: 01-foundation*
*Completed: 2026-03-25*
