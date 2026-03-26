---
phase: 02-orders-dashboard
plan: 02
subsystem: frontend
tags: [dashboard, recharts, date-filter, sidebar-badges, kpi]
dependency_graph:
  requires: ["02-01"]
  provides: [coupang-orders-dashboard-page, kpi-bar-component, revenue-trend-chart, sidebar-badges]
  affects: [apps/web/src/components/layout/Sidebar.tsx]
tech_stack:
  added: []
  patterns: [promise-all-fan-out, date-range-preset-filter, recharts-line-chart, sidebar-badge-fetch]
key_files:
  created:
    - apps/web/src/app/coupang/orders/page.tsx
    - apps/web/src/components/ui/KpiBar.tsx
    - apps/web/src/components/ui/RevenueTrendChart.tsx
  modified:
    - apps/web/src/components/layout/Sidebar.tsx
decisions:
  - "Used `any` type for Recharts Tooltip formatter due to complex Formatter<ValueType,NameType> generic — matches existing pattern in apps/web/src/app/page.tsx"
  - "Sidebar badge fetch is fire-and-forget on mount with silent catch — badge is supplementary UI, not critical path"
metrics:
  duration: 3 minutes
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 4
---

# Phase 02 Plan 02: Orders Dashboard Frontend Summary

**One-liner:** Coupang orders dashboard page with KPI bar, Recharts LineChart trend, Top-20 ranking table, 7d/30d/90d+custom date filter, and sidebar pending-action badges via Promise.all fan-out.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create KpiBar, RevenueTrendChart, /coupang/orders page | a5fa30d | KpiBar.tsx, RevenueTrendChart.tsx, orders/page.tsx |
| 2 | Add sidebar pending-action badges and coupang orders nav | c5cc35a | Sidebar.tsx |

## What Was Built

### KpiBar component (`apps/web/src/components/ui/KpiBar.tsx`)
3-metric KPI row showing today's order count, today's revenue (₩ formatted), and pending confirm count. Uses ShoppingCart, DollarSign, AlertCircle icons from lucide-react with blue/emerald/amber color coding. Light theme (bg-white, border-gray-200).

### RevenueTrendChart component (`apps/web/src/components/ui/RevenueTrendChart.tsx`)
Recharts `LineChart` wrapper for daily revenue trend. XAxis shows MM-DD slice of day string. YAxis formats in 만원 units. Tooltip shows ₩-formatted revenue. `ResponsiveContainer` fills the 280px container.

### /coupang/orders page (`apps/web/src/app/coupang/orders/page.tsx`)
- Single `dateRange` state (default: 30-day preset) controls all three data fetches
- 7d/30d/90d preset buttons with active highlight via `cn()` + custom `DateRangePicker`
- `useEffect` on `dateRange` change fires `Promise.all` across three endpoints:
  - `GET /api/coupang-dashboard` — KPI data
  - `GET /api/coupang-dashboard/trend?from=&to=` — trend chart data
  - `GET /api/coupang-dashboard/ranking?from=&to=` — ranking table data
- Top-20 ranking table with sellerProductId key, sellerProductName, revenue, orderCount
- Empty state message when no data and not loading

### Sidebar badges (`apps/web/src/components/layout/Sidebar.tsx`)
- Added `주문 대시보드` nav item at `/coupang/orders` with BarChart3 icon (second position in operationsNav)
- `useEffect([], [])` on mount fetches `/api/coupang-dashboard` for badge counts
- Blue badge on `/coupang/orders` when `pendingAccept > 0`
- Amber badge on `/returns` when `pendingReturns > 0`
- Badges only rendered when `sidebarOpen` is true
- Silent `.catch(() => {})` — badge failure does not break sidebar

## Requirements Satisfied

| ID | Description | Status |
|----|-------------|--------|
| ORD-01 | KPI bar with today orders, revenue, pending confirm | Done — KpiBar component wired to coupang-dashboard |
| ORD-02 | 30-day revenue trend line chart (KST) | Done — RevenueTrendChart with Recharts LineChart |
| ORD-03 | Top-20 product ranking by sellerProductId | Done — ranking table fetches /ranking endpoint |
| ORD-04 | Sidebar ACCEPT and UC return badges | Done — badge state from coupang-dashboard |
| ORD-05 | 7d/30d/90d + custom date range filter controls all queries | Done — single dateRange state + Promise.all |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Recharts Tooltip formatter TypeScript type error**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `Formatter<ValueType, NameType>` generic in recharts 3.8.0 expects `value: TValue | undefined` where `TValue extends ValueType = ValueType` — plain `(value: number) => ...` is incompatible
- **Fix:** Used `(value: any)` with runtime check `typeof value === 'number' ? value : 0`, matching the existing pattern in `apps/web/src/app/page.tsx` (line 194: `formatter={(value: any) => ...}`)
- **Files modified:** apps/web/src/components/ui/RevenueTrendChart.tsx
- **Commit:** a5fa30d

## Known Stubs

None — all data fetches are wired to live backend endpoints. KPI data, trend data, and ranking data all come from Plan 01's endpoints. Sidebar badge counts come from the existing `GET /api/coupang-dashboard` endpoint.

## Self-Check: PASSED

All files verified on disk:
- apps/web/src/components/ui/KpiBar.tsx — FOUND
- apps/web/src/components/ui/RevenueTrendChart.tsx — FOUND
- apps/web/src/app/coupang/orders/page.tsx — FOUND
- .planning/phases/02-orders-dashboard/02-02-SUMMARY.md — FOUND

All commits verified in git log:
- a5fa30d — FOUND (feat(02-02): add KpiBar, RevenueTrendChart, and /coupang/orders dashboard page)
- c5cc35a — FOUND (feat(02-02): add coupang orders nav item and pending-action badges to sidebar)
