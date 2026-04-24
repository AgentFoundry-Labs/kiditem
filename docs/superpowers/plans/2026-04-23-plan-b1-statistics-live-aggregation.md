# Plan B1 — Statistics Live Aggregation + Statistics.tsx Boundary Rewire

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining `StatisticsService` dependence on the empty `ProfitLoss` table, keep the existing statistics API contracts stable where the frontend already depends on them, and rewire `apps/web/src/app/sales-analysis/components/Statistics.tsx` to shared Zod schemas via `apiClient.getParsed`.

**Architecture:** Reuse `apps/server/src/common/per-listing-profit.ts:buildPerListingMetrics` as the canonical per-listing live source for `products`, `categories`, `grades`, and `pareto`. `overview` becomes a hybrid read: live per-listing metrics for revenue/profit plus a distinct-order `prisma.order.count` for `totalOrders`, because the root label is order-global, not listing-summed. Frontend keeps one tabbed component, but replaces inline interfaces + `apiClient.get<any>` with shared schemas, URL period sync, and 3-state loading/error/empty rendering consistent with `SalesOverview.tsx`.

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL 16 + `@kiditem/shared` Zod schemas (server); Next.js 16 + React Query v5 + Zod v4 (web); vitest (unit + RTL + PG integration).

**Predecessors:** Plan D.3 (`sales-analysis` live aggregation), Plan F1 (`buildPerListingMetrics` extraction), Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`)

**Successor:** `B2 sales-plans-actuals-live`

---

## Locked decisions

### D1. `period` omitted keeps historical "all-time" behavior

Current `StatisticsService` semantics are:

- `period='YYYY-MM'` → month-scoped query
- `period` omitted → all available history

Keep that behavior. `buildPerListingMetrics` requires a half-open `[from, to)` window, so `StatisticsService` must define an "all-time" window explicitly:

```ts
private resolveWindow(period?: string) {
  if (period) {
    const [year, month] = period.split('-').map(Number);
    return { from: kstMonthStart(year, month), to: kstMonthStart(year, month + 1) };
  }
  const now = new Date();
  return {
    from: new Date(0),
    to: kstMonthStart(now.getFullYear(), now.getMonth() + 2),
  };
}
```

Why `now.getMonth() + 2`:

- `kstMonthStart()` is 1-indexed
- if current month is April (`getMonth() === 3`), `+2` yields May 1 KST, which safely includes the full current month in the half-open window

### D2. `overview.totalOrders` becomes global distinct order count

Do **not** derive `overview.totalOrders` by summing `metrics.orderCount` across listings. That would double-count multi-listing orders. Use:

```ts
this.prisma.order.count({
  where: {
    companyId,
    orderedAt: { gte: from, lt: to },
    status: { notIn: ['cancelled', 'returned', 'refunded'] },
  },
});
```

This is a deliberate semantic correction. The visible card says "전체 주문", so distinct orders are the correct business meaning.

### D3. `StatisticsProductRow.profitRate` / `margin` stay ratio-based

`buildPerListingMetrics().profitRate` is a **percentage number** (`20.0` for 20%). Existing statistics API + frontend expect a **ratio** (`0.2` for 20%), because the component multiplies by 100 before `formatPercent`.

Keep the response contract stable:

```ts
profitRate: metric.revenue > 0
  ? Math.round((metric.netProfit / metric.revenue) * 10000) / 10000
  : 0,
margin: same
```

Do not leak the helper's percentage unit directly into statistics responses.

### D4. Shared schema must accept JSON date strings before `getParsed` rollout

`packages/shared/src/schemas/statistics.ts` currently defines:

```ts
lastOrder: z.date().nullable(),
```

That will fail once frontend starts parsing API JSON, because `Date` serializes to ISO string. Replace with `zIsoDate.nullable()` and add a shared schema test.

---

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `packages/shared/src/schemas/statistics.ts` | `lastOrder` parse fix (`zIsoDate`) |
| Create | `packages/shared/src/schemas/statistics.spec.ts` | shared schema regression test for `lastOrder` |
| Modify | `apps/server/src/statistics/statistics.service.ts` | live aggregation rewrite for 5 methods |
| Modify | `apps/server/src/statistics/__tests__/statistics.service.spec.ts` | unit tests: helper-mocked live mapping semantics |
| Modify | `apps/server/src/statistics/__tests__/statistics-flow.pg.integration.spec.ts` | real DB live fixture rewrite using `finance-seeds` |
| Modify | `apps/web/src/lib/query-keys.ts` | add `queryKeys.salesAnalysis.statistics(tab, period)` |
| Modify | `apps/web/src/app/sales-analysis/components/Statistics.tsx` | `getParsed` + shared schemas + URL period + 3-state |
| Create | `apps/web/src/app/sales-analysis/__tests__/Statistics.spec.tsx` | RTL coverage for statistics tabs |
| Create | `docs/release-notes/2026-04-statistics-live-aggregation.md` | user-visible behavior note + verification evidence |

## Review cadence

| Task | Scope | Review |
|---|---|---|
| T1 | shared schema fix + shared schema test | 1 combined |
| T2 | statistics service foundation helpers | 2-stage |
| T3 | overview/products/categories/grades/pareto service rewrite | 2-stage |
| T4 | statistics unit spec rewrite | 1 combined |
| T5 | PG integration rewrite | 2-stage |
| T6 | frontend rewire + RTL | 2-stage |
| T7 | release note + full verification | no review |

---

## Task 1 — Shared schema guard for `repurchase.lastOrder`

**Files:**
- Modify: `packages/shared/src/schemas/statistics.ts`
- Create: `packages/shared/src/schemas/statistics.spec.ts`

- [ ] **Step 1.1: Replace `z.date()` with `zIsoDate` in repurchase customer schema**

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

export const StatisticsRepurchaseCustomerSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  totalAmount: z.number().int(),
  lastOrder: zIsoDate.nullable(),
});
```

- [ ] **Step 1.2: Add a shared schema regression test**

```ts
import { describe, it, expect } from 'vitest';
import { StatisticsRepurchaseResponseSchema } from './statistics.js';

describe('StatisticsRepurchaseResponseSchema', () => {
  it('accepts ISO string lastOrder values from JSON responses', () => {
    expect(() =>
      StatisticsRepurchaseResponseSchema.parse({
        totalCustomers: 1,
        repeatCount: 1,
        repurchaseRate: 1,
        totalOrders: 2,
        repeatProducts: [],
        repeatCustomers: [{
          name: '홍길동',
          count: 2,
          totalAmount: 30000,
          lastOrder: '2026-04-15T00:00:00.000Z',
        }],
      }),
    ).not.toThrow();
  });

  it('still accepts Date objects on the server side', () => {
    expect(() =>
      StatisticsRepurchaseResponseSchema.parse({
        totalCustomers: 1,
        repeatCount: 1,
        repurchaseRate: 1,
        totalOrders: 2,
        repeatProducts: [],
        repeatCustomers: [{
          name: '홍길동',
          count: 2,
          totalAmount: 30000,
          lastOrder: new Date('2026-04-15T00:00:00.000Z'),
        }],
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 1.3: Verify shared schema test passes**

Run:

```bash
rtk npx vitest run packages/shared/src/schemas/statistics.spec.ts
```

Expected: `2 passed`

- [ ] **Step 1.4: Rebuild shared package**

Run:

```bash
rtk bash -lc 'cd packages/shared && npm run build'
```

Expected: `tsup` completes with updated `dist/`

- [ ] **Step 1.5: Commit**

```bash
rtk git add packages/shared/src/schemas/statistics.ts packages/shared/src/schemas/statistics.spec.ts packages/shared/dist
rtk git commit -m "fix(shared): accept ISO lastOrder in statistics schemas"
```

---

## Task 2 — Statistics live foundation helpers

**Files:**
- Modify: `apps/server/src/statistics/statistics.service.ts`

- [ ] **Step 2.1: Import the shared live helper and define excluded statuses once**

```ts
import { buildPerListingMetrics } from '../common/per-listing-profit';

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;
```

- [ ] **Step 2.2: Add a period window helper that preserves current API semantics**

```ts
private resolveWindow(period?: string) {
  if (period) {
    const [year, month] = period.split('-').map(Number);
    return { from: kstMonthStart(year, month), to: kstMonthStart(year, month + 1) };
  }

  const now = new Date();
  return {
    from: new Date(0),
    to: kstMonthStart(now.getFullYear(), now.getMonth() + 2),
  };
}
```

- [ ] **Step 2.3: Add reusable order/filter helpers**

```ts
private buildOrderWhere(companyId: string, period?: string): Prisma.OrderWhereInput {
  const { from, to } = this.resolveWindow(period);
  return {
    companyId,
    orderedAt: { gte: from, lt: to },
    status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
  };
}

private getListingMetrics(companyId: string, period?: string) {
  const { from, to } = this.resolveWindow(period);
  return buildPerListingMetrics(this.prisma, companyId, from, to);
}
```

- [ ] **Step 2.4: Keep `delivery()` and `repurchase()` untouched**

Do **not** rewrite:

- `delivery(companyId, period?)`
- `repurchase(companyId, period?)`

Only update imports/types if TypeScript requires it. No semantic changes in this task.

- [ ] **Step 2.5: Type-check the statistics service file**

Run:

```bash
rtk bash -lc 'cd apps/server && npx tsc --noEmit'
```

Expected: no new `statistics.service.ts` type errors from helper additions

- [ ] **Step 2.6: Commit**

```bash
rtk git add apps/server/src/statistics/statistics.service.ts
rtk git commit -m "refactor(server): add statistics live aggregation helpers"
```

---

## Task 3 — Rewrite the 5 remaining statistics readers

**Files:**
- Modify: `apps/server/src/statistics/statistics.service.ts`

- [ ] **Step 3.1: Rewrite `overview()` to use live metrics + distinct `order.count`**

```ts
async overview(companyId: string, period?: string) {
  const [metrics, totalProducts, totalOrders] = await Promise.all([
    this.getListingMetrics(companyId, period),
    this.prisma.masterProduct.count({
      where: { companyId, isDeleted: false },
    }),
    this.prisma.order.count({
      where: this.buildOrderWhere(companyId, period),
    }),
  ]);

  const totalRevenue = metrics.reduce((sum, m) => sum + m.revenue, 0);
  const totalProfit = metrics.reduce((sum, m) => sum + m.netProfit, 0);
  const avgMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;

  return {
    totalRevenue,
    totalOrders,
    totalProfit,
    avgMargin: Math.round(avgMargin * 10000) / 10000,
    totalProducts,
  } satisfies StatisticsOverview;
}
```

- [ ] **Step 3.2: Rewrite `products()` from `PerListingMetrics[]`, preserving ratio semantics**

```ts
async products(companyId: string, period?: string) {
  const metrics = await this.getListingMetrics(companyId, period);

  return [...metrics]
    .sort((a, b) => b.revenue - a.revenue)
    .map((m) => ({
      listingId: m.listingId,
      externalId: m.externalId,
      channelName: m.channelName,
      masterId: m.masterId,
      masterCode: m.masterCode,
      productName: m.masterName,
      category: m.category,
      grade: m.grade,
      thumbnailUrl: m.thumbnailUrl,
      totalRevenue: m.revenue,
      netProfit: m.netProfit,
      orderCount: m.orderCount,
      profitRate: m.revenue > 0 ? Math.round((m.netProfit / m.revenue) * 10000) / 10000 : 0,
      margin: m.revenue > 0 ? Math.round((m.netProfit / m.revenue) * 10000) / 10000 : 0,
    } satisfies StatisticsProductRow));
}
```

- [ ] **Step 3.3: Rewrite `categories()` and `grades()` as pure reductions over `PerListingMetrics[]`**

```ts
async categories(companyId: string, period?: string) {
  const metrics = await this.getListingMetrics(companyId, period);
  const categoryMap = new Map<string, { revenue: number; orders: number; profit: number }>();

  for (const m of metrics) {
    const cat = m.category ?? '미분류';
    const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profit: 0 };
    entry.revenue += m.revenue;
    entry.orders += m.orderCount;
    entry.profit += m.netProfit;
    categoryMap.set(cat, entry);
  }

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      name: category,
      revenue: data.revenue,
      orders: data.orders,
      profit: data.profit,
      count: data.orders,
    } satisfies StatisticsCategoryRow))
    .sort((a, b) => b.revenue - a.revenue);
}

async grades(companyId: string, period?: string) {
  const metrics = await this.getListingMetrics(companyId, period);
  const gradeMap = new Map<string, { revenue: number; profit: number; productCount: number; adCost: number }>();

  for (const m of metrics) {
    const grade = m.grade ?? 'N/A';
    const entry = gradeMap.get(grade) ?? { revenue: 0, profit: 0, productCount: 0, adCost: 0 };
    entry.revenue += m.revenue;
    entry.profit += m.netProfit;
    entry.productCount += 1;
    entry.adCost += m.adCost;
    gradeMap.set(grade, entry);
  }

  return Array.from(gradeMap.entries())
    .map(([grade, data]) => ({
      grade,
      revenue: data.revenue,
      profit: data.profit,
      count: data.productCount,
      productCount: data.productCount,
      adCost: data.adCost,
    } satisfies StatisticsGradeRow))
    .sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] **Step 3.4: Rewrite `pareto()` from sorted live metrics**

```ts
async pareto(companyId: string, period?: string) {
  const metrics = [...await this.getListingMetrics(companyId, period)]
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = metrics.reduce((sum, m) => sum + m.revenue, 0);
  let cumulativeRevenue = 0;

  const data = metrics.map((m, index) => {
    cumulativeRevenue += m.revenue;
    const revenuePercent = totalRevenue > 0 ? Math.round((m.revenue / totalRevenue) * 1000) / 10 : 0;
    const cumulativePercent = totalRevenue > 0 ? Math.round((cumulativeRevenue / totalRevenue) * 1000) / 10 : 0;
    const currentGrade = m.grade ?? 'N/A';
    const suggestedGrade = cumulativePercent <= 70 ? 'A' : cumulativePercent <= 90 ? 'B' : 'C';
    return {
      id: m.listingId,
      rank: index + 1,
      name: m.masterName,
      currentGrade,
      suggestedGrade,
      gradeMatch: currentGrade === suggestedGrade,
      revenue: m.revenue,
      revenuePercent,
      cumulativePercent,
    };
  });

  const gradeDistribution: { A: number; B: number; C: number } = { A: 0, B: 0, C: 0 };
  for (const item of data) {
    if (item.currentGrade === 'A' || item.currentGrade === 'B' || item.currentGrade === 'C') {
      gradeDistribution[item.currentGrade] += 1;
    }
  }

  const mismatchCount = data.filter((item) => !item.gradeMatch).length;

  return {
    totalRevenue,
    gradeDistribution,
    mismatchCount,
    data,
  } satisfies StatisticsParetoResponse;
}
```

- [ ] **Step 3.5: Prove the service no longer touches `prisma.profitLoss`**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/statistics/statistics.service.ts
```

Expected: no matches

- [ ] **Step 3.6: Commit**

```bash
rtk git add apps/server/src/statistics/statistics.service.ts
rtk git commit -m "feat(server): migrate statistics to live aggregation"
```

---

## Task 4 — Rewrite statistics unit tests around the live helper

**Files:**
- Modify: `apps/server/src/statistics/__tests__/statistics.service.spec.ts`

- [ ] **Step 4.1: Replace `profitLoss` mocks with a module mock for `buildPerListingMetrics`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatisticsService } from '../statistics.service';
import { buildPerListingMetrics } from '../../common/per-listing-profit';

vi.mock('../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    masterProduct: { count: vi.fn() },
    order: { count: vi.fn(), findMany: vi.fn() },
    shipment: { findMany: vi.fn() },
    orderLineItem: { findMany: vi.fn() },
  };
}
```

- [ ] **Step 4.2: Add an overview test that locks the distinct-order decision**

```ts
it('overview uses distinct order.count instead of summing per-listing orderCount', async () => {
  mockedBuildPerListingMetrics.mockResolvedValue([
    { listingId: 'l1', revenue: 100000, netProfit: 20000, orderCount: 1 } as any,
    { listingId: 'l2', revenue: 50000, netProfit: 10000, orderCount: 1 } as any,
  ]);
  prisma.masterProduct.count.mockResolvedValue(2);
  prisma.order.count.mockResolvedValue(1); // one multi-listing order

  const result = await service.overview('company-1', '2026-04');

  expect(result).toEqual({
    totalRevenue: 150000,
    totalOrders: 1,
    totalProfit: 30000,
    avgMargin: 0.2,
    totalProducts: 2,
  });
});
```

- [ ] **Step 4.3: Add a products test that locks ratio semantics**

```ts
it('products converts helper percent-like metrics into ratio-based API fields', async () => {
  mockedBuildPerListingMetrics.mockResolvedValue([{
    listingId: 'listing-1',
    externalId: 'EXT-1',
    channelName: '쿠팡 상품',
    masterId: 'master-1',
    masterCode: 'M-001',
    masterName: 'Master A',
    category: '유아용품',
    grade: 'A',
    thumbnailUrl: null,
    revenue: 100000,
    netProfit: 20000,
    orderCount: 3,
    profitRate: 20,
  } as any]);

  const result = await service.products('company-1', '2026-04');

  expect(result[0].profitRate).toBe(0.2);
  expect(result[0].margin).toBe(0.2);
});
```

- [ ] **Step 4.4: Rewrite categories / grades / pareto tests to assert live-metric reductions**

Keep existing `delivery()` and `repurchase()` sections. Only rewrite the 5 migrated readers.

Minimum assertions to keep:

- `categories()` groups null category into `미분류`
- `grades()` groups null grade into `N/A`
- `pareto()` sorts by revenue desc and computes cumulative percent

- [ ] **Step 4.5: Run the statistics unit spec**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/statistics/__tests__/statistics.service.spec.ts'
```

Expected: PASS, including unchanged `delivery` / `repurchase` tests

- [ ] **Step 4.6: Commit**

```bash
rtk git add apps/server/src/statistics/__tests__/statistics.service.spec.ts
rtk git commit -m "test(server): rewrite statistics unit coverage for live aggregation"
```

---

## Task 5 — Rewrite PG integration around real orders + ads

**Files:**
- Modify: `apps/server/src/statistics/__tests__/statistics-flow.pg.integration.spec.ts`

- [ ] **Step 5.1: Replace direct `profitLoss.create()` seeding with `finance-seeds` helpers**

Use:

```ts
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';
```

Seed one fixture with:

- master A (`category='유아용품'`, `grade='A'`)
- master B (`category='완구'`, `grade='B'`)
- one listing each
- one multi-listing order touching both listings
- one single-listing order touching only listing B
- one cancelled order to prove exclusion
- one ad row on listing A to prove `adCost` in `grades()`

- [ ] **Step 5.2: Add a dedicated overview test for distinct order count**

```ts
it('overview counts one multi-listing order once', async () => {
  const result = await service.overview(TEST_COMPANY_ID, '2026-04');
  expect(result.totalOrders).toBe(2); // O1 multi-listing + O2 single-listing
});
```

Fixture requirement:

- O1 contains line items for listing A and listing B
- O2 contains only listing B
- O3 is cancelled and excluded

- [ ] **Step 5.3: Rewrite products / categories / grades / pareto expectations to match live math**

Lock these expectations explicitly:

- `products[0].listingId` and `products[1].listingId`
- `products[*].profitRate` is ratio, not percent
- `categories()` totals come from live order line revenues, not `ProfitLoss` fixture rows
- `grades()` includes seeded `adCost`
- `pareto().data[*].id === listingId`

- [ ] **Step 5.4: Keep `delivery()` and `repurchase()` integration cases intact except fixture plumbing**

Do not widen B1 scope into new delivery/repurchase behavior. Only adapt setup if shared fixture extraction changes require it.

- [ ] **Step 5.5: Run the PG integration test after bringing up the test DB**

Run:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/statistics/__tests__/statistics-flow.pg.integration.spec.ts'
```

Expected: PASS against real Postgres

- [ ] **Step 5.6: Commit**

```bash
rtk git add apps/server/src/statistics/__tests__/statistics-flow.pg.integration.spec.ts
rtk git commit -m "test(server): migrate statistics PG integration to live seeds"
```

---

## Task 6 — Rewire `Statistics.tsx` to shared schemas + 3-state

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/app/sales-analysis/components/Statistics.tsx`
- Create: `apps/web/src/app/sales-analysis/__tests__/Statistics.spec.tsx`

- [ ] **Step 6.1: Add a sales-analysis statistics query key**

```ts
salesAnalysis: {
  all: ['salesAnalysis'] as const,
  data: (period: string) => [...queryKeys.salesAnalysis.all, 'data', period] as const,
  statistics: (tab: string, period: string) =>
    [...queryKeys.salesAnalysis.all, 'statistics', tab, period] as const,
},
```

- [ ] **Step 6.2: Replace inline interfaces in `Statistics.tsx` with shared schemas + a typed tab fetcher**

```ts
import { z } from 'zod';
import {
  StatisticsOverviewSchema,
  StatisticsProductRowSchema,
  StatisticsCategoryRowSchema,
  StatisticsDeliveryResponseSchema,
  StatisticsGradeRowSchema,
  StatisticsParetoResponseSchema,
  StatisticsRepurchaseResponseSchema,
  type StatisticsOverview,
  type StatisticsProductRow,
  type StatisticsCategoryRow,
  type StatisticsDeliveryResponse,
  type StatisticsGradeRow,
  type StatisticsParetoResponse,
  type StatisticsRepurchaseResponse,
} from '@kiditem/shared';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ErrorState, EmptyState } from '@/components/ui/EmptyState';

const ProductRowsSchema = z.array(StatisticsProductRowSchema);
const CategoryRowsSchema = z.array(StatisticsCategoryRowSchema);
const GradeRowsSchema = z.array(StatisticsGradeRowSchema);

type StatisticsTab = 'overview' | 'products' | 'categories' | 'delivery' | 'grades' | 'pareto' | 'repurchase';
type Stats = {
  overview?: StatisticsOverview;
  products?: StatisticsProductRow[];
  categories?: StatisticsCategoryRow[];
  delivery?: StatisticsDeliveryResponse;
  grades?: StatisticsGradeRow[];
  pareto?: StatisticsParetoResponse;
  repurchase?: StatisticsRepurchaseResponse;
};
```

- [ ] **Step 6.3: Add URL period sync + `getParsed` query**

Mirror `SalesOverview.tsx`:

```ts
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();
const urlPeriod = searchParams.get('period');

const { period, setPeriod: setPeriodRaw, periodOptions } = usePeriodSelector({
  months: 12,
  defaultTo: 'prev',
  initial: urlPeriod ?? undefined,
});

const setPeriod = (p: string) => {
  setPeriodRaw(p);
  const params = new URLSearchParams(searchParams);
  params.set('period', p);
  router.replace(`${pathname}?${params.toString()}`);
};
```

And:

```ts
const { data, isLoading, error: queryError } = useQuery({
  queryKey: queryKeys.salesAnalysis.statistics(tab, period),
  queryFn: () => fetchStatisticsTab(tab, period),
});

const error = friendlyError(queryError);
```

- [ ] **Step 6.4: Implement `fetchStatisticsTab()` with schema-per-tab parsing**

```ts
async function fetchStatisticsTab(tab: StatisticsTab, period: string): Promise<Stats> {
  switch (tab) {
    case 'overview':
      return {
        overview: await apiClient.getParsed(
          `/api/statistics?type=overview&period=${period}`,
          StatisticsOverviewSchema,
        ),
      };
    case 'products':
      return {
        products: await apiClient.getParsed(
          `/api/statistics?type=products&period=${period}`,
          ProductRowsSchema,
        ),
      };
    case 'categories':
      return {
        categories: await apiClient.getParsed(
          `/api/statistics?type=categories&period=${period}`,
          CategoryRowsSchema,
        ),
      };
    case 'delivery':
      return {
        delivery: await apiClient.getParsed(
          `/api/statistics?type=delivery&period=${period}`,
          StatisticsDeliveryResponseSchema,
        ),
      };
    case 'grades':
      return {
        grades: await apiClient.getParsed(
          `/api/statistics?type=grades&period=${period}`,
          GradeRowsSchema,
        ),
      };
    case 'pareto':
      return {
        pareto: await apiClient.getParsed(
          `/api/statistics?type=pareto&period=${period}`,
          StatisticsParetoResponseSchema,
        ),
      };
    case 'repurchase':
      return {
        repurchase: await apiClient.getParsed(
          `/api/statistics?type=repurchase&period=${period}`,
          StatisticsRepurchaseResponseSchema,
        ),
      };
    default: {
      const unreachable: never = tab;
      throw new Error(`Unknown statistics tab: ${unreachable}`);
    }
  }
}
```

- [ ] **Step 6.5: Replace old `!data` rendering with explicit loading / error / empty states**

Rules:

- `isLoading` → `<PageSkeleton variant="table" />`
- `error` → `<ErrorState message={error} />`
- successful empty tab data → `<EmptyState message="해당 기간 데이터가 없습니다." />`
- successful content → existing tables/cards

Also fix the product table key:

```tsx
<tr key={p.listingId}>
```

not `p.productId`.

- [ ] **Step 6.6: Add RTL coverage**

Create `apps/web/src/app/sales-analysis/__tests__/Statistics.spec.tsx` with at least 4 tests:

1. pending query → skeleton
2. 502 rejection → error state
3. products success → listing-backed rows render after tab click
4. repurchase success → ISO-string `lastOrder` renders without crash

Skeleton:

```ts
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Statistics from '../components/Statistics';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('period=2026-04'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/sales-analysis',
}));

function renderWithProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Statistics />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(apiClient, 'getParsed').mockReset();
});

it('renders products rows after tab switch', async () => {
  vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
    if (path.includes('type=overview')) {
      return Promise.resolve({
        totalRevenue: 0,
        totalOrders: 0,
        totalProfit: 0,
        avgMargin: 0,
        totalProducts: 0,
      });
    }
    if (path.includes('type=products')) {
      return Promise.resolve([{
        listingId: 'listing-1',
        externalId: 'EXT-1',
        channelName: '쿠팡 상품',
        masterId: 'master-1',
        masterCode: 'M-001',
        productName: 'Master A',
        category: '유아용품',
        grade: 'A',
        thumbnailUrl: null,
        totalRevenue: 100000,
        netProfit: 20000,
        orderCount: 3,
        profitRate: 0.2,
        margin: 0.2,
      }]);
    }
    throw new Error(`unexpected path: ${path}`);
  });

  renderWithProvider();
  await userEvent.click(screen.getByRole('button', { name: /제품별/ }));

  await waitFor(() => {
    expect(screen.getByText('Master A')).toBeTruthy();
  });
});
```

- [ ] **Step 6.7: Verify frontend tests and build**

Run:

```bash
rtk bash -lc 'cd apps/web && npx vitest run src/app/sales-analysis/__tests__/Statistics.spec.tsx'
rtk npm run build --workspace=apps/web
```

Expected: RTL PASS + web build success

- [ ] **Step 6.8: Commit**

```bash
rtk git add apps/web/src/lib/query-keys.ts apps/web/src/app/sales-analysis/components/Statistics.tsx apps/web/src/app/sales-analysis/__tests__/Statistics.spec.tsx
rtk git commit -m "feat(web): rewire statistics tab to parsed shared schemas"
```

---

## Task 7 — Release note + full verification

**Files:**
- Create: `docs/release-notes/2026-04-statistics-live-aggregation.md`

- [ ] **Step 7.1: Write a concise release note**

Include:

- `StatisticsService` no longer reads `ProfitLoss`
- `overview.totalOrders` is now distinct-order based
- `Statistics.tsx` now uses `apiClient.getParsed`
- `StatisticsRepurchaseCustomerSchema.lastOrder` accepts ISO strings
- explicit out-of-scope statement: `settlements`, `sales-plans`, `ad-strategy`, `action-task`

- [ ] **Step 7.2: Run the required full verification sequence**

Run:

```bash
rtk bash -lc 'cd packages/shared && npm run build'
rtk bash -lc 'cd apps/server && npx vitest run src/statistics/__tests__/statistics.service.spec.ts'
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/statistics/__tests__/statistics-flow.pg.integration.spec.ts'
rtk npm run dev:server
rtk bash -lc 'cd apps/web && npx vitest run src/app/sales-analysis/__tests__/Statistics.spec.tsx'
rtk npm run build --workspace=apps/web
```

Expected:

- shared build passes
- server unit spec passes
- server PG integration passes
- `npm run dev:server` boots successfully
- frontend RTL passes
- web build passes

- [ ] **Step 7.3: Sanity grep the closure claim**

Run:

```bash
rtk rg -n "prisma\\.profitLoss" apps/server/src/statistics --glob '!**/__tests__/**'
rtk rg -n "apiClient\\.get<any>|interface OverviewStats|interface ProductStat|interface CategoryStat|interface GradeStat|interface ParetoData|interface RepurchaseData|interface DeliveryData" apps/web/src/app/sales-analysis/components/Statistics.tsx
```

Expected:

- first grep: no matches
- second grep: no matches

- [ ] **Step 7.4: Commit**

```bash
rtk git add docs/release-notes/2026-04-statistics-live-aggregation.md
rtk git commit -m "docs(release-note): statistics live aggregation migration"
```

---

## Final acceptance criteria

- `apps/server/src/statistics/statistics.service.ts` contains no `prisma.profitLoss` reads
- `overview.totalOrders` is proven by test to be distinct-order based
- `StatisticsProductRow.profitRate` remains ratio-based (`0.2`, not `20`)
- `packages/shared/src/schemas/statistics.ts` uses `zIsoDate` for `lastOrder`
- `Statistics.tsx` uses shared schemas + `apiClient.getParsed`
- `Statistics.tsx` no longer references `productId`
- Shared build, server unit, server integration, `dev:server`, frontend RTL, and web build all pass

## Out of scope

- `settlements` migration (`B3`)
- `sales-plans` migration (`B2`)
- `ad-strategy` migration (`B4`)
- `action-task` migration (`B5`)
- new statistics endpoint types or route splits
- UX redesign of the statistics page beyond loading/error/empty correctness

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-plan-b1-statistics-live-aggregation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — execute task-by-task via `superpowers:subagent-driven-development`
2. **Inline Execution** — execute in this session via `superpowers:executing-plans`
