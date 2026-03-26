---
phase: 03-returns-dashboard
plan: 02
subsystem: frontend
tags: [returns, dashboard, recharts, date-filter, kpi, sidebar]
dependency_graph:
  requires: [03-01]
  provides: [RET-01, RET-02, RET-03]
  affects: [apps/web/src/app/coupang/returns/page.tsx, apps/web/src/components/layout/Sidebar.tsx]
tech_stack:
  added: []
  patterns: [Promise.all fan-out, DateRangePicker preset filter, Recharts vertical BarChart, IIFE in JSX for inline calculation]
key_files:
  created:
    - apps/web/src/app/coupang/returns/page.tsx
  modified:
    - apps/web/src/components/layout/Sidebar.tsx
decisions:
  - "Used layout='vertical' on BarChart so Korean reason labels render on Y-axis with horizontal bars"
  - "IIFE pattern inside JSX for fault split percentage calculation — no extra component needed"
  - "RotateCcw icon reused for /coupang/returns (same as /returns) for visual consistency"
metrics:
  duration: 108s
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 03 Plan 02: Returns Dashboard Frontend Summary

Returns dashboard page at /coupang/returns with return rate KPI cards, cancelReasonCategory1 bar chart, and CUSTOMER/VENDOR fault split stacked indicator — all controlled by shared 7d/30d/90d preset + DateRangePicker date filter via Promise.all fan-out.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create /coupang/returns dashboard page | 0b94813 | apps/web/src/app/coupang/returns/page.tsx |
| 2 | Add sidebar nav item for /coupang/returns | 8c5341b | apps/web/src/components/layout/Sidebar.tsx |

## What Was Built

### Task 1: Returns Dashboard Page (`apps/web/src/app/coupang/returns/page.tsx`)

- **RET-01 KPI cards:** Three cards showing returnRate (formatPercent), returnCount, and orderCount. Uses TrendingDown/RotateCcw/Package icons with color-coded accent (red/amber/blue).
- **RET-02 Bar chart:** Recharts `BarChart` with `layout="vertical"` — reason labels on Y-axis, horizontal bars extending rightward. `margin={{ left: 120 }}` gives room for Korean category labels. Tooltip formatter uses `(value: any)` per existing codebase pattern.
- **RET-03 Fault split:** IIFE inside JSX computes customerPct/vendorPct, renders stacked horizontal bar (blue=customer, red=vendor) with count+percentage legend.
- **Date filter:** 7d/30d/90d preset buttons + DateRangePicker. Single `dateRange` state drives all three API calls simultaneously via `Promise.all`.
- All fetches use `API_BASE`, 'use client', light theme (bg-white, border-gray-200, text-gray-900).

### Task 2: Sidebar Nav Item (`apps/web/src/components/layout/Sidebar.tsx`)

- Added `{ href: '/coupang/returns', label: '반품 대시보드', icon: RotateCcw }` after `/coupang/orders` and before `/orders` in `operationsNav`.
- One-line change — no other sidebar modifications.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all three API endpoints defined in Plan 01 are wired directly. Data flows from backend through fetch to rendered UI.

## Self-Check: PASSED

- `apps/web/src/app/coupang/returns/page.tsx` — FOUND
- `apps/web/src/components/layout/Sidebar.tsx` — FOUND (modified)
- Commit `0b94813` — FOUND
- Commit `8c5341b` — FOUND
- TypeScript: clean (0 errors)
- All acceptance criteria: PASS
