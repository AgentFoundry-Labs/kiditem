---
phase: 01-dashboard-infrastructure
plan: 01
subsystem: backend-infra, frontend-ui
tags: [kst-timezone, status-constants, nestjs-module, date-picker, dashboard]
dependency_graph:
  requires: []
  provides:
    - kstDayStart helper (apps/server/src/common/kst.ts)
    - ORDER_STATUSES / RETURN_STATUSES constants (apps/server/src/coupang/constants.ts)
    - GET /api/coupang-dashboard endpoint (CoupangDashboardModule)
    - DateRangePicker UI component (apps/web/src/components/ui/DateRangePicker.tsx)
  affects:
    - Phase 2: Orders Dashboard (inherits kstDayStart + status constants)
    - Phase 3: Returns Dashboard (inherits kstDayStart + status constants)
tech_stack:
  added:
    - react-day-picker@9.14.0 (apps/web)
  patterns:
    - KST midnight UTC offset math (9h shift + floor + unshift)
    - Promise.all() fan-out for concurrent Prisma aggregation queries
    - as const status constants with TypeScript narrowing types
    - Radix Popover.Portal + DayPicker mode=range composition
key_files:
  created:
    - apps/server/src/common/kst.ts
    - apps/server/src/coupang/constants.ts
    - apps/server/src/coupang-dashboard/coupang-dashboard.module.ts
    - apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts
    - apps/server/src/coupang-dashboard/coupang-dashboard.service.ts
    - apps/web/src/components/ui/DateRangePicker.tsx
  modified:
    - apps/server/src/app.module.ts
    - apps/web/package.json
    - package-lock.json
decisions:
  - kstDayStart uses UTC timestamp arithmetic (not Date constructor with year/month/day) — avoids server TZ dependency
  - Controller holds companyId derivation via prisma.company.findFirst() matching sourcing.controller.ts pattern
  - Service receives companyId as parameter for testability and separation of concerns
  - DateRangePicker CSS imported inside component (co-located) rather than globals.css
metrics:
  duration: 4 minutes
  completed: 2026-03-26
  tasks_completed: 3
  files_created: 6
  files_modified: 3
---

# Phase 1 Plan 01: Dashboard Infrastructure Summary

**One-liner:** KST midnight helper + typed status constants + CoupangDashboard module (Promise.all fan-out) + react-day-picker@9 DateRangePicker component.

## What Was Built

### Task 1: kstDayStart helper and status constants

Created `apps/server/src/common/kst.ts` with the `kstDayStart(date: Date): Date` helper. The function adds the 9-hour KST offset, floors to UTC day boundary, then subtracts the offset — producing the UTC timestamp that represents midnight KST. Verified: `kstDayStart(new Date('2026-03-23T05:19:48Z')).toISOString() === '2026-03-22T15:00:00.000Z'`.

Created `apps/server/src/coupang/constants.ts` with `ORDER_STATUSES` (ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY/CANCELED) and `RETURN_STATUSES` (UC/RC) as `as const` objects with TypeScript narrowing types `OrderStatus` and `ReturnStatus`.

**Commit:** 520c107

### Task 2: CoupangDashboard NestJS module with Promise.all fan-out

Created three-file module at `apps/server/src/coupang-dashboard/`:
- Module: standard NestJS `@Module` pattern matching DashboardModule
- Controller: `@Controller('coupang-dashboard')` injects PrismaService to derive `companyId` via `prisma.company.findFirst()`, passes to service
- Service: `getSummary(companyId)` uses `Promise.all()` to fan-out three concurrent Prisma queries — `coupangOrder.aggregate()` (today's count + revenue), `coupangOrder.count()` (pending ACCEPT), `coupangReturn.count()` (pending UC)

Registered `CoupangDashboardModule` in `AppModule`. GET /api/coupang-dashboard is now live. No hardcoded status strings in service — all reference constants. TypeScript compiled cleanly.

**Commit:** 053ec83

### Task 3: react-day-picker@9 and DateRangePicker component

Installed `react-day-picker@^9.14.0` in `apps/web`. Created `apps/web/src/components/ui/DateRangePicker.tsx` with:
- `'use client'` directive (CLAUDE.md requirement)
- `DayPicker mode="range"` with `numberOfMonths={2}`
- `import 'react-day-picker/style.css'` (v9 CSS path)
- Radix `Popover.Root/Trigger/Portal/Content` wrapping — Portal renders at document root to avoid z-index conflicts
- `z-50` on Content for stacking context
- Light theme: `bg-white border-gray-200 text-gray-900`
- `date-fns format()` for trigger label display

TypeScript compiled cleanly.

**Commit:** 5270381

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (apps/server) | PASS |
| `npx tsc --noEmit` (apps/web) | PASS |
| `kstDayStart('2026-03-23T05:19:48Z')` === `'2026-03-22T15:00:00.000Z'` | PASS |
| No hardcoded 'ACCEPT'/'UC'/'RC' in coupang-dashboard service | PASS |
| `Promise.all()` in service | PASS (1 match) |
| `CoupangDashboardModule` in AppModule | PASS (2 matches: import + imports array) |
| `react-day-picker` in apps/web | PASS (^9.14.0) |
| `mode="range"` in DateRangePicker | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All files are functional implementations with no placeholder data or stub returns.

## Self-Check: PASSED
