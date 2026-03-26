---
phase: 02-orders-dashboard
plan: 01
subsystem: coupang-dashboard
tags: [backend, api, aggregation, kst, queryRaw]
dependency_graph:
  requires: []
  provides: [GET /api/coupang-dashboard/trend, GET /api/coupang-dashboard/ranking]
  affects: [coupang-dashboard.service.ts, coupang-dashboard.controller.ts]
tech_stack:
  added: []
  patterns: [prisma.$queryRaw tagged template, DATE_TRUNC AT TIME ZONE KST bucketing, BigInt-safe ::int cast]
key_files:
  created: []
  modified:
    - apps/server/src/coupang-dashboard/coupang-dashboard.service.ts
    - apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts
decisions:
  - "Used $queryRaw (not Prisma ORM) for DATE_TRUNC + complex JOIN+GROUP BY — ORM cannot express these"
  - "::int SQL cast + Number() TS conversion both applied to prevent BigInt serialization crash"
  - "sellerProductId used as ranking group key (not vendorItemId) per STATE.md blocker"
  - "kstDayStart applied to both from and to params so date strings from frontend are KST-aligned"
  - "to param adds 86400000ms after kstDayStart to create exclusive end-of-day boundary"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-26"
  tasks_completed: 2
  files_modified: 2
---

# Phase 02 Plan 01: Revenue Trend and Product Ranking Backend Endpoints Summary

**One-liner:** $queryRaw endpoints for KST daily revenue trend and top-20 product ranking with BigInt-safe ::int casts.

## What Was Built

Two new service methods and two new controller endpoints added to the existing CoupangDashboard module:

**Service (`coupang-dashboard.service.ts`):**
- `getRevenueTrend(companyId, from, to)` — uses `$queryRaw` with `DATE_TRUNC('day', ... AT TIME ZONE 'Asia/Seoul')` for KST bucketing, returns `{ day: string, revenue: number, orderCount: number }[]`
- `getProductRanking(companyId, from, to)` — uses `$queryRaw` with JOIN on `coupang_order_items + coupang_orders`, filters `seller_product_id IS NOT NULL`, LIMIT 20, returns `{ sellerProductId, sellerProductName, revenue, orderCount }[]`

**Controller (`coupang-dashboard.controller.ts`):**
- `GET /api/coupang-dashboard/trend` — optional `?from=&to=` params, defaults to last 30 days
- `GET /api/coupang-dashboard/ranking` — optional `?from=&to=` params, defaults to last 30 days
- Both endpoints use `kstDayStart` to align frontend date strings to KST midnight boundaries

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: Service methods | 80fdfe7 | feat(02-01): add getRevenueTrend and getProductRanking to CoupangDashboardService |
| Task 2: Controller endpoints | 833546a | feat(02-01): add GET trend and GET ranking endpoints to CoupangDashboardController |

## Verification Results

- TypeScript compiled cleanly (`npx tsc --noEmit`)
- 2 method definitions in service (`getRevenueTrend`, `getProductRanking`)
- 3 `@Get` decorators in controller (`@Get()`, `@Get('trend')`, `@Get('ranking')`)
- `kstDayStart` imported and applied in controller
- 0 `vendorItemId` references in service (correct: uses `sellerProductId`)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — both endpoints are fully wired to `$queryRaw` database queries. No mock or placeholder data.

## Self-Check: PASSED

- `/Users/yhc125/workspace/kiditem/.claude/worktrees/compassionate-lamarr/apps/server/src/coupang-dashboard/coupang-dashboard.service.ts` — FOUND
- `/Users/yhc125/workspace/kiditem/.claude/worktrees/compassionate-lamarr/apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts` — FOUND
- Commit 80fdfe7 — FOUND (service methods)
- Commit 833546a — FOUND (controller endpoints)
