# Phase 02: Orders Dashboard - Research

**Researched:** 2026-03-26
**Domain:** NestJS service aggregation, Prisma $queryRaw DATE_TRUNC, Recharts LineChart, Next.js 14 client page with date-range filter state
**Confidence:** HIGH

## Summary

Phase 02 builds the `/coupang/orders` page — a dedicated KPI dashboard for Coupang order data. All Phase 1 guard-rails are in place: `kstDayStart` lives at `apps/server/src/common/kst.ts`, `ORDER_STATUSES` / `RETURN_STATUSES` are at `apps/server/src/coupang/constants.ts`, and `CoupangDashboardModule` is registered at `GET /api/coupang-dashboard`. Phase 2 extends that module with new route overloads and adds a new frontend page.

The backend work is entirely additive: three new query methods in `CoupangDashboardService` (revenue trend, product ranking, pending-action counts for sidebar badge) plus two new controller endpoints that accept `from`/`to` query-param date ranges. The revenue trend requires `prisma.$queryRaw` with `DATE_TRUNC('day', ... AT TIME ZONE 'Asia/Seoul')` because Prisma ORM does not support `DATE_TRUNC` natively; all other queries can use the typed Prisma API.

The frontend work is: one new page at `apps/web/src/app/coupang/orders/page.tsx`, a `KpiBar` component, and a `RevenueTrendChart` component. Recharts 3.8.0 is already installed in the root `node_modules` (hoisted from the monorepo workspace). The `DateRangePicker` from Phase 1 is already built — Phase 2 wires it into filter state with 7d/30d/90d preset buttons plus a custom date picker. The sidebar badge requires reading `pendingAccept` and `pendingReturns` from the existing `GET /api/coupang-dashboard` endpoint already implemented in Phase 1.

**Primary recommendation:** Extend `CoupangDashboardService` with `getRevenueTrend(companyId, from, to)`, `getProductRanking(companyId, from, to)`, and update the controller to expose `GET /api/coupang-dashboard/trend` and `GET /api/coupang-dashboard/ranking`. The sidebar badge reads `GET /api/coupang-dashboard` (existing endpoint — no new route needed). The frontend `/coupang/orders` page manages a single `dateRange` state and fans out three `fetch` calls using `Promise.all` from `useEffect`.

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 02 — no user decisions were locked in a discuss-phase session. All implementation choices are Claude's discretion within CLAUDE.md project constraints.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORD-01 | 주문 페이지에 오늘 주문 수, 오늘 매출(원), 확인 대기 건수 KPI 바가 표시된다 | Phase 1 `CoupangDashboardService.getSummary()` already returns `todayOrders.count`, `todayOrders.revenue`, `pendingAccept`. `GET /api/coupang-dashboard` is live. Frontend only needs a KPI bar component wired to this endpoint. |
| ORD-02 | 30일 일별 매출 트렌드 라인 차트가 KST 기준으로 렌더링된다 | Requires `prisma.$queryRaw` with `DATE_TRUNC('day', ordered_at AT TIME ZONE 'Asia/Seoul')` because Prisma ORM has no DATE_TRUNC. Recharts `LineChart` + `Line` already installed at 3.8.0. New service method `getRevenueTrend`. |
| ORD-03 | 상품별 매출 상위 20개 테이블이 `sellerProductId` 기준으로 집계되어 표시된다 | Must join `coupang_orders` → `coupang_order_items` and group by `seller_product_id` (String, nullable). Use `prisma.$queryRaw` for the JOIN+GROUP BY aggregation. STATE.md warns: use `sellerProductId` NOT `vendorItemId`. |
| ORD-04 | 사이드바에 ACCEPT 대기 주문 수와 UC 반품 수가 배지로 표시된다 | `pendingAccept` and `pendingReturns` already returned from `GET /api/coupang-dashboard` (Phase 1). Sidebar component needs to fetch this endpoint and render numeric badges on the `/orders` nav item. |
| ORD-05 | 7일/30일/90일/사용자 지정 날짜 범위 필터가 모든 주문 대시보드 쿼리에 동시 적용된다 | Frontend `dateRange` state with preset buttons + `DateRangePicker`. All three chart/table queries accept `?from=&to=` params. `useEffect` with `Promise.all` re-fires on `dateRange` change. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### Enforced by CLAUDE.md

- **API paths:** No `/v1/` prefix. New routes: `GET /api/coupang-dashboard/trend` and `GET /api/coupang-dashboard/ranking`.
- **`'use client'` required:** All new frontend components and pages must have `'use client'` directive.
- **API calls via `API_BASE`:** `fetch(\`${API_BASE}/api/coupang-dashboard/trend?from=...&to=...\`)` — never raw `/api/` calls.
- **Light theme:** `bg-white`, `border-gray-200`, `text-gray-900` — no dark mode classes.
- **Domain modules self-contained:** `CoupangDashboardService` only — never inject `OrdersService` or `ReturnsService`.
- **PrismaService only as shared dep:** No cross-domain imports.
- **Native PG enum forbidden:** All status comparisons use `ORDER_STATUSES` / `RETURN_STATUSES` constants.
- **Promise.all() fan-out:** All concurrent aggregations in service use `Promise.all()`.
- **DB reads only in dashboard service:** Never call Coupang live API from `CoupangDashboardService`.
- **companyId guard:** Every Prisma `where` clause includes `companyId`; fetch once via `prisma.company.findFirst()`.
- **Schema changes require `db:push` + `prisma generate`:** Not needed for Phase 2 (no schema changes).
- **`sellerProductId` is the correct join key:** STATE.md blocker: "use sellerProductId NOT vendorItemId" — confirmed by `reviews.service.ts` line 60.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.5.0 (installed) | `$queryRaw` for DATE_TRUNC trend query; typed aggregate for KPI | Project ORM — already in server |
| NestJS | 11 (installed) | Additional controller endpoints with `@Query()` params | Project framework |
| Recharts | 3.8.0 (installed) | `LineChart` + `Line` for revenue trend | Already hoisted to root `node_modules`; already used in `app/page.tsx` |
| react-day-picker | 9.14.0 (installed) | `DateRangePicker` already built in Phase 1 | Phase 1 deliverable |
| date-fns | 4.1.0 (installed) | Format `Date` → `'yyyy-MM-dd'` for query params | Already installed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `kstDayStart` from `common/kst.ts` | n/a (internal) | KST-correct date bounds for all service queries | All date range filters |
| `ORDER_STATUSES` / `RETURN_STATUSES` from `coupang/constants.ts` | n/a (internal) | Type-safe status values | pendingAccept, pendingReturns queries |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `prisma.$queryRaw` for trend | `groupBy` on `orderedAt` | Prisma `groupBy` cannot apply `DATE_TRUNC` — would produce one row per exact timestamp, not per day |
| Recharts `LineChart` | Recharts `AreaChart` | Both work; `LineChart` matches "revenue trend line chart" requirement wording exactly |
| Preset buttons + DateRangePicker | DateRangePicker only | Requirement explicitly names 7d/30d/90d presets AND custom range |

**No new installation needed** — all dependencies already satisfy Phase 2 requirements.

## Architecture Patterns

### New Files to Create

```
apps/server/src/coupang-dashboard/
├── coupang-dashboard.module.ts      # existing — no change
├── coupang-dashboard.controller.ts  # EXTEND: add /trend, /ranking endpoints
└── coupang-dashboard.service.ts     # EXTEND: add getRevenueTrend(), getProductRanking()

apps/web/src/app/coupang/
└── orders/
    └── page.tsx                     # NEW: /coupang/orders page

apps/web/src/components/
└── ui/
    ├── DateRangePicker.tsx          # existing (Phase 1) — no change
    ├── KpiBar.tsx                   # NEW: 3-metric KPI row
    └── RevenueTrendChart.tsx        # NEW: LineChart wrapper
```

Sidebar is modified to add badge counts on the `/orders` nav link.

### Pattern 1: Prisma $queryRaw for DATE_TRUNC Revenue Trend

**What:** Prisma's typed query API (`aggregate`, `groupBy`) does not support `DATE_TRUNC`. For daily bucketing by KST date, use `prisma.$queryRaw` with a tagged template literal. The `AT TIME ZONE 'Asia/Seoul'` clause performs the UTC → KST conversion inside PostgreSQL, so the server's timezone is irrelevant.

**When to use:** Any query needing `DATE_TRUNC`, `EXTRACT`, or other SQL functions not in Prisma ORM.

**CRITICAL — Big Integer serialization:** PostgreSQL `COUNT(*)` and aggregation functions return `bigint` in Prisma `$queryRaw` results, which becomes a JavaScript `BigInt`. These cannot be JSON-serialized directly. Cast to `::int` in the SQL or convert with `Number()` in TypeScript before returning.

**Example:**
```typescript
// apps/server/src/coupang-dashboard/coupang-dashboard.service.ts
async getRevenueTrend(companyId: string, from: Date, to: Date) {
  // DATE_TRUNC in KST using AT TIME ZONE inside Postgres
  const rows = await this.prisma.$queryRaw<
    { day: Date; revenue: bigint; order_count: bigint }[]
  >`
    SELECT
      DATE_TRUNC('day', co.ordered_at AT TIME ZONE 'Asia/Seoul') AS day,
      SUM(co.total_price)::int                                    AS revenue,
      COUNT(*)::int                                               AS order_count
    FROM coupang_orders co
    WHERE co.company_id = ${companyId}::uuid
      AND co.ordered_at >= ${from}
      AND co.ordered_at <  ${to}
    GROUP BY 1
    ORDER BY 1
  `;

  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),  // 'YYYY-MM-DD'
    revenue: Number(r.revenue),
    orderCount: Number(r.order_count),
  }));
}
```

Note: `$queryRaw` uses tagged template literals. Parameters are passed as `${value}` and are automatically parameterized (SQL injection safe). Do NOT use string interpolation.

### Pattern 2: Product Ranking via $queryRaw JOIN + GROUP BY

**What:** `CoupangOrderItem.sellerProductId` is the grouping key. Must join `coupang_orders` → `coupang_order_items` and filter orders by date range + companyId. Revenue is `SUM(coi.order_price)`. Limit to top 20.

**Key warning from STATE.md:** "sellerProductId is the correct join key to Product.coupangProductId — do NOT use vendorItemId". Confirmed in `reviews.service.ts` line 60.

**Example:**
```typescript
async getProductRanking(companyId: string, from: Date, to: Date) {
  const rows = await this.prisma.$queryRaw<
    {
      seller_product_id: string | null;
      seller_product_name: string;
      revenue: bigint;
      order_count: bigint;
    }[]
  >`
    SELECT
      coi.seller_product_id,
      coi.seller_product_name,
      SUM(coi.order_price)::int AS revenue,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM coupang_order_items coi
    JOIN coupang_orders co ON co.id = coi.order_id
    WHERE co.company_id = ${companyId}::uuid
      AND co.ordered_at >= ${from}
      AND co.ordered_at <  ${to}
    GROUP BY coi.seller_product_id, coi.seller_product_name
    ORDER BY revenue DESC
    LIMIT 20
  `;

  return rows.map((r) => ({
    sellerProductId: r.seller_product_id ?? '(unknown)',
    sellerProductName: r.seller_product_name,
    revenue: Number(r.revenue),
    orderCount: Number(r.order_count),
  }));
}
```

### Pattern 3: Controller with @Query() Date Params

**What:** New endpoints accept ISO date strings as query params and parse to `Date` objects for service methods.

**Example:**
```typescript
// coupang-dashboard.controller.ts additions
@Get('trend')
async getRevenueTrend(@Query('from') fromStr: string, @Query('to') toStr: string) {
  const company = await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) throw new NotFoundException('회사 정보 없음');
  const from = fromStr ? new Date(fromStr) : kstDayStart(new Date(Date.now() - 30 * 86400000));
  const to   = toStr   ? new Date(toStr)   : new Date(kstDayStart(new Date()).getTime() + 86400000);
  return this.service.getRevenueTrend(company.id, from, to);
}

@Get('ranking')
async getProductRanking(@Query('from') fromStr: string, @Query('to') toStr: string) {
  const company = await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) throw new NotFoundException('회사 정보 없음');
  const from = fromStr ? new Date(fromStr) : kstDayStart(new Date(Date.now() - 30 * 86400000));
  const to   = toStr   ? new Date(toStr)   : new Date(kstDayStart(new Date()).getTime() + 86400000);
  return this.service.getProductRanking(company.id, from, to);
}
```

Note: `kstDayStart` and `Query` must both be imported. The controller must also import `Query` from `@nestjs/common`.

### Pattern 4: Frontend Date Range Filter with Promise.all Fan-out

**What:** Single `dateRange` state object with `{ from: Date; to: Date }` drives all three `fetch` calls. Preset buttons (7d/30d/90d) set the state directly; `DateRangePicker` handles custom range. `useEffect` depends on `[dateRange]` and calls all three endpoints concurrently via `Promise.all`.

**Example:**
```tsx
'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { format, subDays } from 'date-fns';

function toParam(d: Date) { return format(d, 'yyyy-MM-dd'); }

function getPreset(days: number) {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

export default function CoupangOrdersPage() {
  const [dateRange, setDateRange] = useState(getPreset(30));
  const [kpis, setKpis] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const from = toParam(dateRange.from);
    const to   = toParam(dateRange.to);
    Promise.all([
      fetch(`${API_BASE}/api/coupang-dashboard`).then((r) => r.json()),
      fetch(`${API_BASE}/api/coupang-dashboard/trend?from=${from}&to=${to}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/coupang-dashboard/ranking?from=${from}&to=${to}`).then((r) => r.json()),
    ])
      .then(([kpiData, trendData, rankingData]) => {
        setKpis(kpiData);
        setTrend(trendData);
        setRanking(rankingData);
      })
      .finally(() => setLoading(false));
  }, [dateRange]);

  // ...render KpiBar, RevenueTrendChart, ranking table
}
```

### Pattern 5: Recharts LineChart for Revenue Trend

**What:** `LineChart` with `XAxis` using `day` field, `YAxis` formatted as KRW, `Line` for revenue, `ResponsiveContainer` for full-width. Pattern matches existing `BarChart` usage in `app/page.tsx`.

**Note on recharts 3.x:** The existing `app/page.tsx` imports `{ BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid }` — confirmed working on recharts 3.8.0. `LineChart` and `Line` use identical import pattern.

**Example:**
```tsx
// apps/web/src/components/ui/RevenueTrendChart.tsx
'use client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { formatKRW } from '@/lib/utils';

interface TrendRow { day: string; revenue: number; orderCount: number }

export function RevenueTrendChart({ data }: { data: TrendRow[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">일별 매출 트렌드</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={(v) => v.slice(5)}  // 'MM-DD'
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
            />
            <Tooltip
              formatter={(value: number) => [`₩${formatKRW(value)}`, '매출']}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

### Pattern 6: Sidebar Badge for Pending Actions

**What:** The sidebar (`Sidebar.tsx`) needs to show numeric badges on the `/orders` nav link — ACCEPT count and UC return count. These come from `GET /api/coupang-dashboard` which already returns `pendingAccept` and `pendingReturns`.

**Approach:** Add a `useEffect` in `Sidebar.tsx` that calls `GET /api/coupang-dashboard` on mount and stores the counts in local state. Render the badge beside the `ShoppingCart` icon when the count > 0.

**Key constraint:** Sidebar is already `'use client'` and uses `usePathname()` and `useStore()`. Adding `useState`/`useEffect` for badge data follows the same pattern.

**Badge rendering pattern (matches light theme):**
```tsx
{pendingAccept > 0 && (
  <span className="ml-auto text-xs font-semibold bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
    {pendingAccept}
  </span>
)}
```

### Pattern 7: /coupang/orders Route Setup

**What:** Next.js App Router requires a directory `apps/web/src/app/coupang/orders/` with a `page.tsx`. There is currently no `/coupang` directory — it must be created.

**Navigation:** The sidebar currently maps `/orders` to the old orders page. For Phase 2, the new KPI dashboard page is at `/coupang/orders`. The existing `/orders` page (Coupang live order processing) remains. The sidebar nav item for `주문 처리` may need updating to `/coupang/orders`, or a new nav item added — this is a planner decision.

**Recommended approach:** Add a new sidebar section for "Coupang Dashboard" linking to `/coupang/orders`, leaving the existing `/orders` operational link unchanged. This avoids breaking existing order processing workflow.

### Anti-Patterns to Avoid

- **`Prisma.sql` template literal NOT in $queryRaw:** Use tagged template directly: `` this.prisma.$queryRaw`SELECT...` `` — not `this.prisma.$queryRaw(Prisma.sql`...`)` (both work in Prisma v7, but the tagged template is cleaner and parameterization is automatic).
- **Returning BigInt from controller:** `$queryRaw` COUNT returns BigInt in JavaScript. Cast `::int` in SQL or convert with `Number()` in TypeScript — JSON.stringify throws on BigInt.
- **`Date` passed directly to `$queryRaw` param:** Prisma parameterizes `Date` as a timestamptz literal — this works correctly. No manual `.toISOString()` conversion needed inside the SQL.
- **Mixing `from`/`to` params as KST vs UTC:** The controller receives ISO date strings (e.g., `2026-03-01`). Convert to `new Date('2026-03-01')` which is UTC midnight. The `$queryRaw` comparison uses `ordered_at >= ${from}` where `ordered_at` is stored in UTC. If you want "from March 1 KST", pass the KST-adjusted UTC start. Use `kstDayStart(new Date(fromStr))` rather than `new Date(fromStr)` to maintain KST alignment.
- **String interpolation in $queryRaw:** `\`SELECT * FROM ... WHERE id = '${companyId}'\`` is SQL injection vulnerable. Always use `${variable}` template param syntax inside the tagged template.
- **Sequential awaits for multiple dashboard queries:** Frontend must use `Promise.all` — do not `await` each fetch call sequentially.
- **Sidebar badge fetch in every re-render:** Use `useEffect(fetchBadge, [])` (empty deps) — badge refreshes on page mount, not every render.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Daily revenue bucketing by KST | Custom JS groupBy loop over all orders | `$queryRaw` with `DATE_TRUNC + AT TIME ZONE 'Asia/Seoul'` | PostgreSQL handles DST, timezone math, and does it in one DB round-trip |
| Line chart | `<canvas>` or `<svg>` render loop | Recharts `LineChart` + `Line` | Already installed; handles responsive resize, tooltips, axis formatting |
| Date range picker UI | Custom calendar | `DateRangePicker` (Phase 1 deliverable) | Already built; uses react-day-picker@9 + Radix Popover |
| KRW formatting | Custom number formatter | `formatKRW` from `@/lib/utils` | Already exists; uses `Intl.NumberFormat` with ko-KR locale |
| CompanyId lookup | Auth session extraction | `prisma.company.findFirst({ orderBy: { createdAt: 'asc' } })` | Established pattern from `sourcing.controller.ts` and Phase 1 |

**Key insight:** All chart, UI, and utility dependencies are already installed. Phase 2 is pure service + page assembly.

## Common Pitfalls

### Pitfall 1: BigInt JSON Serialization Crash

**What goes wrong:** `TypeError: Do not know how to serialize a BigInt` at runtime when the controller tries to JSON-serialize the `$queryRaw` result.

**Why it happens:** PostgreSQL's `COUNT(*)`, `SUM(...)` aggregations return `bigint` type. Prisma's `$queryRaw` returns these as JavaScript `BigInt` objects. `JSON.stringify` (used by NestJS response serialization) throws on `BigInt`.

**How to avoid:** In SQL, cast aggregations: `COUNT(*)::int AS order_count`, `SUM(co.total_price)::int AS revenue`. This caps at `~2.1 billion` — acceptable for order counts and KRW revenue. Alternatively, do `Number(row.revenue)` in the TypeScript map step.

**Warning signs:** `500 Internal Server Error` from the trend or ranking endpoints; NestJS logs show `TypeError: Do not know how to serialize a BigInt`.

### Pitfall 2: DATE_TRUNC Returns UTC Day Boundaries, Not KST

**What goes wrong:** `DATE_TRUNC('day', ordered_at)` without `AT TIME ZONE` buckets by UTC day. Korean orders placed 00:00-09:00 KST fall in the previous UTC day, creating day-boundary mismatches.

**Why it happens:** `ordered_at` is stored as `@db.Timestamptz` — PostgreSQL stores it in UTC. Without timezone conversion, `DATE_TRUNC('day', ordered_at)` truncates at UTC midnight.

**How to avoid:** Always use `DATE_TRUNC('day', ordered_at AT TIME ZONE 'Asia/Seoul')`. This converts to KST first, then truncates. The return value is a `timestamp without time zone` in KST — handle accordingly on the frontend (slice to `YYYY-MM-DD` for display).

**Warning signs:** Revenue trend shows orders split across the wrong days; total daily revenue looks lower than expected.

### Pitfall 3: sellerProductId Nullable — NULL Group in Ranking

**What goes wrong:** Ranking table shows a row with `sellerProductId = NULL` and inflated revenue because multiple order items with no `sellerProductId` get grouped together.

**Why it happens:** `CoupangOrderItem.sellerProductId` is `String?` (nullable). Some items may have `null` if the Coupang API did not return this field. SQL `GROUP BY` treats all NULLs as a single group.

**How to avoid:** Either filter them out (`WHERE coi.seller_product_id IS NOT NULL`) or map `null` to `'(미등록)'` in the TypeScript result. The planner should decide; filtering is simpler and is recommended since NULL product IDs are unactionable in a ranking table.

**Warning signs:** Ranking table has a `null` row at position 1 with suspiciously high revenue.

### Pitfall 4: Date Param Timezone Mismatch — KST vs UTC Midnight

**What goes wrong:** Filter for "March 1–31" in KST actually queries UTC midnight March 1 to UTC midnight April 1. Korean orders placed 00:00–08:59 KST on March 1 (= Feb 28 15:00–23:59 UTC) are excluded.

**Why it happens:** `new Date('2026-03-01')` parses as UTC midnight. Korean KST midnight = UTC 15:00 the previous day. Passing raw ISO strings without `kstDayStart` adjustment causes the first 9 hours of each KST day to be excluded.

**How to avoid:** In the controller, wrap `from` and `to` params with `kstDayStart`: `const fromKst = kstDayStart(new Date(fromStr))`. The `to` param should be `kstDayStart(new Date(toStr)).getTime() + 86400000` (exclusive KST end-of-day).

**Warning signs:** Filtering "today" shows 0 orders even though orders appear in DB; filtering "last 30 days" misses 9 hours per day.

### Pitfall 5: CoupangDashboardModule PrismaService Injection for New Route Methods

**What goes wrong:** `getRevenueTrend` or `getProductRanking` throw `this.prisma is undefined`.

**Why it happens:** If the developer copies the service file and forgets the `constructor(private readonly prisma: PrismaService) {}` injection — or accidentally removes it when extending the service.

**How to avoid:** Phase 1's service already has `constructor(private readonly prisma: PrismaService) {}`. Extend by adding methods below the existing `getSummary`. Do not replace the constructor.

**Warning signs:** `TypeError: Cannot read properties of undefined (reading '$queryRaw')` on first call to new methods.

### Pitfall 6: New Route Order Conflicts (@Get() vs @Get('trend'))

**What goes wrong:** `GET /api/coupang-dashboard/trend` returns 404.

**Why it happens:** NestJS `@Get('trend')` must be on a method _other_ than the `@Get()` default handler. If placed in wrong order or with wrong decorator, route may not register.

**How to avoid:** Each new method gets its own `@Get('trend')` and `@Get('ranking')` decorator. The base `@Get()` remains for `getSummary`. Order of methods in the class does not matter in NestJS, but decorator must match exactly.

**Warning signs:** `curl localhost:4000/api/coupang-dashboard/trend` → 404.

## Code Examples

### Revenue Trend Service Method
```typescript
// Source: Prisma $queryRaw tagged template literal pattern (verified against Prisma v7 docs)
// apps/server/src/coupang-dashboard/coupang-dashboard.service.ts — add below getSummary()

async getRevenueTrend(companyId: string, from: Date, to: Date) {
  const rows = await this.prisma.$queryRaw<
    { day: Date; revenue: number; order_count: number }[]
  >`
    SELECT
      DATE_TRUNC('day', co.ordered_at AT TIME ZONE 'Asia/Seoul') AS day,
      SUM(co.total_price)::int                                    AS revenue,
      COUNT(*)::int                                               AS order_count
    FROM coupang_orders co
    WHERE co.company_id = ${companyId}::uuid
      AND co.ordered_at >= ${from}
      AND co.ordered_at <  ${to}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    revenue: Number(r.revenue),
    orderCount: Number(r.order_count),
  }));
}
```

### Product Ranking Service Method
```typescript
// Source: CoupangOrderItem schema — sellerProductId verified as correct key
// (reviews.service.ts line 60: orderCounts by sellerProductId)

async getProductRanking(companyId: string, from: Date, to: Date) {
  const rows = await this.prisma.$queryRaw<
    {
      seller_product_id: string | null;
      seller_product_name: string;
      revenue: number;
      order_count: number;
    }[]
  >`
    SELECT
      coi.seller_product_id,
      coi.seller_product_name,
      SUM(coi.order_price)::int      AS revenue,
      COUNT(DISTINCT co.id)::int     AS order_count
    FROM coupang_order_items coi
    JOIN coupang_orders co ON co.id = coi.order_id
    WHERE co.company_id = ${companyId}::uuid
      AND co.ordered_at >= ${from}
      AND co.ordered_at <  ${to}
      AND coi.seller_product_id IS NOT NULL
    GROUP BY coi.seller_product_id, coi.seller_product_name
    ORDER BY revenue DESC
    LIMIT 20
  `;
  return rows.map((r) => ({
    sellerProductId: r.seller_product_id ?? '(미등록)',
    sellerProductName: r.seller_product_name,
    revenue: Number(r.revenue),
    orderCount: Number(r.order_count),
  }));
}
```

### Controller Extension Pattern
```typescript
// Source: NestJS @Query() decorator; existing coupang-dashboard.controller.ts pattern
import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { kstDayStart } from '../common/kst';

// Add to CoupangDashboardController (keep existing @Get() getSummary):

@Get('trend')
async getRevenueTrend(
  @Query('from') fromStr?: string,
  @Query('to') toStr?: string,
) {
  const company = await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) throw new NotFoundException('회사 정보 없음');

  const defaultFrom = kstDayStart(new Date(Date.now() - 30 * 86400000));
  const defaultTo   = new Date(kstDayStart(new Date()).getTime() + 86400000);

  const from = fromStr ? kstDayStart(new Date(fromStr)) : defaultFrom;
  const to   = toStr   ? new Date(kstDayStart(new Date(toStr)).getTime() + 86400000) : defaultTo;

  return this.service.getRevenueTrend(company.id, from, to);
}

@Get('ranking')
async getProductRanking(
  @Query('from') fromStr?: string,
  @Query('to') toStr?: string,
) {
  const company = await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) throw new NotFoundException('회사 정보 없음');

  const defaultFrom = kstDayStart(new Date(Date.now() - 30 * 86400000));
  const defaultTo   = new Date(kstDayStart(new Date()).getTime() + 86400000);

  const from = fromStr ? kstDayStart(new Date(fromStr)) : defaultFrom;
  const to   = toStr   ? new Date(kstDayStart(new Date(toStr)).getTime() + 86400000) : defaultTo;

  return this.service.getProductRanking(company.id, from, to);
}
```

### KpiBar Component
```tsx
// apps/web/src/components/ui/KpiBar.tsx
'use client';
import { ShoppingCart, DollarSign, AlertCircle } from 'lucide-react';
import { formatKRW } from '@/lib/utils';

interface KpiBarProps {
  todayOrderCount: number;
  todayRevenue: number;
  pendingConfirmCount: number;
}

export function KpiBar({ todayOrderCount, todayRevenue, pendingConfirmCount }: KpiBarProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <ShoppingCart className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-gray-500">오늘 주문 수</p>
          <p className="text-xl font-bold text-gray-900">{todayOrderCount}건</p>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <DollarSign className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-gray-500">오늘 매출</p>
          <p className="text-xl font-bold text-gray-900">₩{formatKRW(todayRevenue)}</p>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-gray-500">확인 대기</p>
          <p className="text-xl font-bold text-gray-900">{pendingConfirmCount}건</p>
        </div>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts v1/v2 (separate `recharts/es6` import path needed) | Recharts v3.8.0 (direct named imports from `'recharts'`) | v3.0 (2024) | No change in import syntax — same `LineChart, Line, XAxis` etc. |
| Prisma v5 `$queryRaw` required `Prisma.sql` helper | Prisma v7 tagged template literal: `` prisma.$queryRaw`SELECT...` `` | v5+ | Tagged template is the current standard — simpler and auto-parameterized |

**Deprecated/outdated:**
- `$queryRawUnsafe(string)`: Do not use. No parameterization — SQL injection risk. Only use tagged template `$queryRaw`.

## Open Questions

1. **Sidebar navigation: update `/orders` or add new nav item?**
   - What we know: Existing sidebar maps `{ href: '/orders', label: '주문 처리', icon: ShoppingCart }` to the live order processing page.
   - What's unclear: Should `/coupang/orders` replace `/orders` in the sidebar, coexist as a new item, or be a tab within the orders section?
   - Recommendation: Add a new sidebar item `{ href: '/coupang/orders', label: '주문 대시보드', icon: BarChart3 }` in the operations section, above or near `주문 처리`. This avoids disrupting the existing order processing workflow. The planner should confirm.

2. **KPI bar: date range filter applies to trend/ranking but NOT to today's KPIs?**
   - What we know: ORD-01 says "updating on filter change" for the KPI bar. The KPI endpoint `GET /api/coupang-dashboard` returns `todayOrders` — always today, regardless of filter.
   - What's unclear: Should `todayOrders.count` and `todayOrders.revenue` change when the filter is set to, say, 90d? The requirement says "today's order count, revenue, and pending-confirmation count" — these are inherently "today" values, not filtered period values.
   - Recommendation: KPI bar always shows today's data (from `GET /api/coupang-dashboard`); it does NOT change with the date filter. Only the trend chart and ranking table respond to filter changes. The "updating on filter change" language in ORD-01 likely refers to the overall dashboard (trend + ranking) refreshing, not the today-specific KPIs. Planner should confirm this interpretation.

3. **Recharts v3 breaking changes from v2?**
   - What we know: The existing `app/page.tsx` successfully uses `BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid` from `recharts` at version 3.8.0.
   - What's unclear: Whether `LineChart` or `Line` have any v3-specific API changes.
   - Recommendation: The existing code proves v3.8.0 works in this project. `LineChart` and `Line` follow identical patterns to `BarChart` and `Bar`. HIGH confidence no changes needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Recharts (`LineChart`) | RevenueTrendChart component | Already installed (hoisted) | 3.8.0 | — |
| react-day-picker | DateRangePicker (Phase 1) | Already installed | 9.14.0 | — |
| date-fns (`subDays`, `format`) | Date param calculation | Already installed | 4.1.0 | — |
| Prisma `$queryRaw` | Revenue trend, product ranking | Available (Prisma 7.5.0) | 7.5.0 | — |
| PostgreSQL `AT TIME ZONE 'Asia/Seoul'` | KST date bucketing | Available (pg standard function) | — | — |
| `kstDayStart` from `common/kst.ts` | Controller date param conversion | Phase 1 deliverable — present | — | — |
| `ORDER_STATUSES` / `RETURN_STATUSES` | Service constants | Phase 1 deliverable — present | — | — |
| `CoupangDashboardModule` registered | Existing base endpoint | Phase 1 deliverable — present | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Note:** No new npm packages need to be installed for Phase 2. All required libraries were installed in Phase 1 or are already in the project.

## Validation Architecture

> `workflow.nyquist_validation` is not set in config.json — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no jest.config, no vitest.config detected — same as Phase 1) |
| Config file | none |
| Quick run command | Manual: `curl http://localhost:4000/api/coupang-dashboard/trend` |
| Full suite command | Manual: HTTP smoke tests + `npx tsc --noEmit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORD-01 | `GET /api/coupang-dashboard` returns `todayOrders.count`, `todayOrders.revenue`, `pendingAccept` | smoke | `curl -s localhost:4000/api/coupang-dashboard \| jq '{count: .todayOrders.count, revenue: .todayOrders.revenue, pending: .pendingAccept}'` | Runtime only |
| ORD-02 | `GET /api/coupang-dashboard/trend?from=2026-02-24&to=2026-03-25` returns array with `day`, `revenue`, `orderCount` fields | smoke | `curl -s "localhost:4000/api/coupang-dashboard/trend?from=2026-02-24&to=2026-03-25" \| jq 'length'` | Runtime only |
| ORD-02 | Each `day` value is `YYYY-MM-DD` format (KST bucketed) | smoke | `curl -s "..." \| jq '.[0].day'` | Runtime only |
| ORD-03 | `GET /api/coupang-dashboard/ranking` returns array of ≤ 20 with `sellerProductId`, `revenue`, `orderCount` | smoke | `curl -s "localhost:4000/api/coupang-dashboard/ranking" \| jq 'length'` | Runtime only |
| ORD-03 | No `null` `sellerProductId` in results | smoke | `curl -s "..." \| jq '[.[] \| select(.sellerProductId == null)] \| length'` should be 0 | Runtime only |
| ORD-04 | Sidebar badge shows count matching `pendingAccept` from API | manual | Visual inspection in browser | Manual |
| ORD-05 | Changing date preset or custom range refetches all three endpoints | manual | Browser network tab shows 3 requests on filter change | Manual |
| ALL | TypeScript compiles without errors | compile | `npx tsc --noEmit --project apps/server/tsconfig.json` | Build-time |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit --project apps/server/tsconfig.json` (TypeScript compile check)
- **Per wave merge:** HTTP smoke: all three endpoints return HTTP 200 with correct JSON shapes
- **Phase gate:** TypeScript clean + HTTP 200 on all endpoints + browser visual check of charts before marking complete

### Wave 0 Gaps

- [ ] No automated test framework — all validation is manual/smoke (same constraint as Phase 1)

*(No existing test infrastructure covers phase requirements)*

## Sources

### Primary (HIGH confidence)

- `apps/server/src/coupang-dashboard/coupang-dashboard.service.ts` — Phase 1 deliverable; existing `getSummary()` pattern confirmed
- `apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts` — existing controller structure
- `apps/server/src/common/kst.ts` — `kstDayStart` helper confirmed present
- `apps/server/src/coupang/constants.ts` — `ORDER_STATUSES`, `RETURN_STATUSES` confirmed present
- `prisma/schema.prisma` — `CoupangOrder.totalPrice`, `CoupangOrderItem.sellerProductId`, `CoupangOrderItem.orderPrice` field names verified
- `apps/web/src/app/page.tsx` — Recharts v3.8.0 `BarChart/Bar/XAxis/YAxis/Tooltip/ResponsiveContainer` usage confirmed working
- `apps/web/package.json` — `recharts: ^3.8.0`, `date-fns: ^4.1.0`, `react-day-picker: ^9.14.0`, all confirmed installed
- `apps/web/src/components/ui/DateRangePicker.tsx` — Phase 1 deliverable confirmed
- `apps/server/src/reviews/reviews.service.ts` line 60 — `sellerProductId` as correct join key confirmed
- `.planning/STATE.md` — "sellerProductId is the correct join key — do NOT use vendorItemId" blocker documented
- `node_modules/recharts/lib/index.js` — `LineChart` export verified present in recharts 3.8.0

### Secondary (MEDIUM confidence)

- Prisma `$queryRaw` tagged template literal pattern — standard Prisma documentation pattern; consistent with Prisma v7.5.0 installed
- PostgreSQL `DATE_TRUNC + AT TIME ZONE` — standard PostgreSQL timezone conversion; no codebase usage found yet (no prior `$queryRaw` in codebase), but pattern is well-established SQL

### Tertiary (LOW confidence)

- None — all critical claims verified from primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed in package.json or node_modules
- Architecture patterns: HIGH — verified from existing Phase 1 code, schema, and codebase patterns
- $queryRaw SQL syntax: MEDIUM — Prisma v7 installed but no existing $queryRaw usage in codebase; BigInt cast pattern and AT TIME ZONE syntax are standard PostgreSQL and consistent with Prisma docs
- Recharts LineChart: HIGH — existing BarChart usage in same version proves the import pattern works

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable stack; no moving parts)
