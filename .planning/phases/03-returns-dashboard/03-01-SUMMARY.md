---
phase: 03-returns-dashboard
plan: "01"
subsystem: coupang-dashboard
tags: [returns, analytics, backend, aggregation]
dependency_graph:
  requires:
    - "01-02: CoupangReturn model in Prisma schema (requestedAt, faultByType, cancelReasonCategory1)"
    - "01-01: kstDayStart helper in apps/server/src/common/kst.ts"
    - "02-01: CoupangDashboardService and controller pattern established"
  provides:
    - "GET /api/coupang-dashboard/return-summary — returnCount, orderCount, returnRate"
    - "GET /api/coupang-dashboard/return-reasons — cancelReasonCategory1 breakdown sorted DESC"
    - "GET /api/coupang-dashboard/return-fault-split — { customer, vendor } counts"
  affects:
    - "03-02: Frontend return dashboard page will consume these three endpoints"
tech_stack:
  added: []
  patterns:
    - "Promise.all fan-out for concurrent DB aggregations"
    - "$queryRaw with ::int casts for BigInt-safe COUNT aggregation"
    - "kstDayStart + 86400000ms for exclusive end-of-day boundary"
    - "NULL fallback mapping (미분류) for optional categorical fields"
key_files:
  created: []
  modified:
    - "apps/server/src/coupang-dashboard/coupang-dashboard.service.ts"
    - "apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts"
decisions:
  - "Return rate formula: Math.round((returnCount / orderCount) * 10000) / 100 — avoids floating point drift, produces percentage with 2 decimal places"
  - "fault-split returns object { customer, vendor } not array — frontend can destructure directly without reduce"
  - "NULL cancelReasonCategory1 mapped to '미분류' in TypeScript layer (not SQL COALESCE) — keeps SQL clean"
metrics:
  duration: "8 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 03 Plan 01: Return Analytics Backend Endpoints Summary

Three return analytics endpoints added to CoupangDashboardService and CoupangDashboardController — return rate (returns/orders percentage), reason breakdown by cancelReasonCategory1, and CUSTOMER vs VENDOR fault split — all kstDayStart-aligned with BigInt-safe ::int casts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add getReturnSummary, getReturnReasonBreakdown, getReturnFaultSplit to service | 5e87e59 | coupang-dashboard.service.ts |
| 2 | Add /return-summary, /return-reasons, /return-fault-split controller endpoints | 3e340dd | coupang-dashboard.controller.ts |

## What Was Built

### Service Methods (CoupangDashboardService)

**getReturnSummary(companyId, from, to)**
- Promise.all fan-out: COUNT on coupang_returns (requested_at) + COUNT on coupang_orders (ordered_at)
- returnRate = Math.round((returnCount / orderCount) * 10000) / 100 — division-by-zero guarded
- Returns `{ returnCount, orderCount, returnRate }`

**getReturnReasonBreakdown(companyId, from, to)**
- GROUP BY cancel_reason_category1, COUNT()::int, ORDER BY count DESC
- NULL values mapped to '미분류' in TypeScript map
- Returns `{ reason: string, count: number }[]`

**getReturnFaultSplit(companyId, from, to)**
- GROUP BY fault_by_type, COUNT()::int
- Builds Record<string, number>, returns `{ customer: number, vendor: number }` with 0 defaults
- Handles missing fault types gracefully (e.g., no VENDOR returns → vendor: 0)

### Controller Endpoints (CoupangDashboardController)

All three endpoints follow the same pattern as existing `getRevenueTrend` and `getProductRanking`:
- `@Get('return-summary')` → `GET /api/coupang-dashboard/return-summary?from=&to=`
- `@Get('return-reasons')` → `GET /api/coupang-dashboard/return-reasons?from=&to=`
- `@Get('return-fault-split')` → `GET /api/coupang-dashboard/return-fault-split?from=&to=`

Date parsing: kstDayStart(from), kstDayStart(to) + 86400000ms for exclusive end-of-day.
Default range: last 30 days when no params provided.
Company lookup: `prisma.company.findFirst({ orderBy: { createdAt: 'asc' } })`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all endpoints compute real data from coupang_returns and coupang_orders tables.

## Self-Check: PASSED

Files confirmed present:
- apps/server/src/coupang-dashboard/coupang-dashboard.service.ts — FOUND
- apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts — FOUND

Commits confirmed:
- 5e87e59 — feat(03-01): add getReturnSummary, getReturnReasonBreakdown, getReturnFaultSplit to CoupangDashboardService
- 3e340dd — feat(03-01): add return-summary, return-reasons, return-fault-split controller endpoints

TypeScript: clean (npx tsc --noEmit --project apps/server/tsconfig.json exits 0)
