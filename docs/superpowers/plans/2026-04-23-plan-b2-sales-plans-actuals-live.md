# Plan B2 — Sales Plans Actuals Live Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `SalesPlansService.syncActuals()` dependence on `ProfitLoss.aggregate`, keep the `SalesPlan` row/API shape stable, and compute `actualProfit` from live order/ad cost inputs.

**Architecture:** `syncActuals()` stays a narrow service method. `actualRevenue` and `actualOrders` continue to come from `Order.aggregate()` because that is the persisted business meaning already exposed by the page, while `actualProfit` moves to `buildPerListingMetrics()` and becomes the sum of live monthly `netProfit` values. Tests must be rewritten so the behavior is locked to live metrics rather than the dead `ProfitLoss` table.

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL 16 + `apps/server/src/common/per-listing-profit.ts` + vitest unit/PG integration.

**Predecessors:** Plan D.3, Plan F1, Plan B1 (`2026-04-23-plan-b1-statistics-live-aggregation.md`), Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`)

**Successor:** `B3 settlements-reconcile-live`

---

## Locked decisions

### D1. `actualRevenue` / `actualOrders` stay on `order.aggregate`

Do **not** switch revenue/orders to `buildPerListingMetrics()` sums. `SalesPlan.actualRevenue` already means order-level booked revenue, and `SalesPlan.actualOrders` already means distinct orders. Keep:

```ts
const orderAgg = await this.prisma.order.aggregate({
  where: {
    companyId,
    orderedAt: { gte: from, lt: to },
    status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
  },
  _sum: { totalPrice: true },
  _count: { id: true },
});
```

Only `actualProfit` changes source.

### D2. Excluded order statuses must align with the live helper

`buildPerListingMetrics()` excludes `cancelled`, `returned`, and `refunded`. `syncActuals()` must use the same status set for its order aggregate so revenue/orders/profit are based on the same order population.

```ts
const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;
```

### D3. Persisted `SalesPlan` contract stays unchanged

This plan does **not** add new columns or change controller routes. `syncActuals()` still updates:

- `actualRevenue`
- `actualOrders`
- `actualProfit`

No shared schema or frontend changes are in scope.

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/server/src/sales-plans/sales-plans.service.ts` | live actual-profit basis + unified status/window helpers |
| Modify | `apps/server/src/sales-plans/__tests__/sales-plans.service.spec.ts` | unit tests around helper-based sync |
| Modify | `apps/server/src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts` | real DB actual sync from orders/ads, no `profitLoss.create()` |
| Create | `docs/release-notes/2026-04-sales-plans-live-actuals.md` | release note + verification evidence |

## Review cadence

| Task | Scope | Review |
|---|---|---|
| T1 | service foundation helpers | 1 combined |
| T2 | `syncActuals()` rewrite | 2-stage |
| T3 | unit spec rewrite | 1 combined |
| T4 | PG integration rewrite | 2-stage |
| T5 | release note + verification | no review |

---

## Task 1 — Add live-sync foundation in `sales-plans.service.ts`

**Files:**
- Modify: `apps/server/src/sales-plans/sales-plans.service.ts`

- [ ] **Step 1.1: Import the shared live helper and define one excluded-status constant**

```ts
import { buildPerListingMetrics } from '../common/per-listing-profit';
import { kstMonthStart } from '../common/kst';

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;
```

- [ ] **Step 1.2: Add a month-window helper and reuse it inside `syncActuals()`**

```ts
private resolveWindow(period: string) {
  const [year, month] = period.split('-').map(Number);
  return {
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}
```

- [ ] **Step 1.3: Replace the inline `periodStart` / `periodEnd` variables with `resolveWindow()`**

```ts
const { from, to } = this.resolveWindow(plan.period);
```

- [ ] **Step 1.4: Type-check the service file**

Run:

```bash
rtk bash -lc 'cd apps/server && npx tsc --noEmit'
```

Expected: no new `sales-plans.service.ts` type errors

- [ ] **Step 1.5: Commit**

```bash
rtk git add apps/server/src/sales-plans/sales-plans.service.ts
rtk git commit -m "refactor(server): add sales-plan live actuals foundation"
```

---

## Task 2 — Rewrite `syncActuals()` to use live profit

**Files:**
- Modify: `apps/server/src/sales-plans/sales-plans.service.ts`

- [ ] **Step 2.1: Replace `profitLoss.aggregate()` with `buildPerListingMetrics()`**

```ts
async syncActuals(id: string, companyId: string) {
  const plan = await this.prisma.salesPlan.findFirst({
    where: { id, companyId },
  });
  if (!plan) {
    throw new NotFoundException('판매 계획을 찾을 수 없습니다');
  }

  const { from, to } = this.resolveWindow(plan.period);

  const [orderAgg, metrics] = await Promise.all([
    this.prisma.order.aggregate({
      where: {
        companyId,
        orderedAt: { gte: from, lt: to },
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
      },
      _sum: { totalPrice: true },
      _count: { id: true },
    }),
    buildPerListingMetrics(this.prisma, companyId, from, to),
  ]);

  const actualProfit = metrics.reduce((sum, m) => sum + m.netProfit, 0);

  return this.prisma.salesPlan.update({
    where: { id },
    data: {
      actualRevenue: orderAgg._sum.totalPrice ?? 0,
      actualOrders: orderAgg._count.id ?? 0,
      actualProfit,
    },
  });
}
```

- [ ] **Step 2.2: Prove the service no longer touches `profitLoss`**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/sales-plans/sales-plans.service.ts
```

Expected: no matches

- [ ] **Step 2.3: Commit**

```bash
rtk git add apps/server/src/sales-plans/sales-plans.service.ts
rtk git commit -m "feat(server): migrate sales-plan actual profit to live metrics"
```

---

## Task 3 — Rewrite the unit spec around the live helper

**Files:**
- Modify: `apps/server/src/sales-plans/__tests__/sales-plans.service.spec.ts`

- [ ] **Step 3.1: Replace `profitLoss.aggregate` mocking with a module mock for `buildPerListingMetrics`**

```ts
import { buildPerListingMetrics } from '../../common/per-listing-profit';

vi.mock('../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    salesPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    order: {
      aggregate: vi.fn(),
    },
  };
}
```

- [ ] **Step 3.2: Lock the new `actualProfit` behavior in the sync tests**

```ts
it('writes actualProfit from summed live metrics', async () => {
  prisma.salesPlan.findFirst.mockResolvedValue({
    id: 'p1',
    companyId: 'company-1',
    period: '2026-04',
  });
  prisma.order.aggregate.mockResolvedValue({
    _sum: { totalPrice: 30_000 },
    _count: { id: 2 },
  });
  mockedBuildPerListingMetrics.mockResolvedValue([
    { listingId: 'l1', netProfit: 11_000 } as any,
    { listingId: 'l2', netProfit: -1_000 } as any,
  ]);
  prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

  await service.syncActuals('p1', 'company-1');

  expect(prisma.salesPlan.update).toHaveBeenCalledWith({
    where: { id: 'p1' },
    data: {
      actualRevenue: 30_000,
      actualOrders: 2,
      actualProfit: 10_000,
    },
  });
});
```

- [ ] **Step 3.3: Add a guard that cross-company access does not call the live helper**

```ts
it('rejects cross-company sync before any live queries run', async () => {
  prisma.salesPlan.findFirst.mockResolvedValue(null);

  await expect(service.syncActuals('p1', 'other-company')).rejects.toBeInstanceOf(
    NotFoundException,
  );

  expect(prisma.order.aggregate).not.toHaveBeenCalled();
  expect(mockedBuildPerListingMetrics).not.toHaveBeenCalled();
});
```

- [ ] **Step 3.4: Update the status-window assertion to include `refunded`**

```ts
expect(aggregateCall.where.status).toEqual({
  notIn: ['cancelled', 'returned', 'refunded'],
});
```

- [ ] **Step 3.5: Run the unit spec**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/sales-plans/__tests__/sales-plans.service.spec.ts'
```

Expected: PASS

- [ ] **Step 3.6: Commit**

```bash
rtk git add apps/server/src/sales-plans/__tests__/sales-plans.service.spec.ts
rtk git commit -m "test(server): rewrite sales-plan unit coverage for live actuals"
```

---

## Task 4 — Rewrite PG integration to seed real live profit inputs

**Files:**
- Modify: `apps/server/src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts`

- [ ] **Step 4.1: Import reusable finance seed helpers**

```ts
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';
```

- [ ] **Step 4.2: Replace `profitLoss.create()` fixtures with real listing/order/ad data**

Use one deterministic April fixture:

```ts
const master = await setupMaster(prisma, {
  companyId: TEST_COMPANY_ID,
  code: 'SP-M1',
  name: 'Sync Master',
});
const option = await setupProductOption(prisma, {
  companyId: TEST_COMPANY_ID,
  masterId: master.id,
  sku: 'SP-M1-001',
  costPrice: 5_000,
  commissionRate: 0.1,
  otherCost: 500,
});
const listing = await setupChannelListing(prisma, {
  companyId: TEST_COMPANY_ID,
  masterId: master.id,
  channel: 'coupang',
  externalId: 'SP-EXT-1',
  channelName: 'SP L1',
  optionId: option.id,
  vendorItemId: 'SP-VI-1',
});

await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'SP-PAID-1',
  orderedAt: '2026-04-10T03:00:00.000Z',
  shippingPrice: 3_000,
  status: 'paid',
  lineItems: [{
    quantity: 1,
    totalPrice: 20_000,
    optionId: option.id,
    listingOptionId: listing.listingOptionId,
  }],
});
await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'SP-PAID-2',
  orderedAt: '2026-04-10T03:30:00.000Z',
  shippingPrice: 0,
  status: 'paid',
  lineItems: [{
    quantity: 1,
    totalPrice: 10_000,
    optionId: option.id,
    listingOptionId: listing.listingOptionId,
  }],
});
await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'SP-REFUNDED',
  orderedAt: '2026-04-10T04:00:00.000Z',
  shippingPrice: 0,
  status: 'refunded',
  lineItems: [{
    quantity: 1,
    totalPrice: 99_999,
    optionId: option.id,
    listingOptionId: listing.listingOptionId,
  }],
});
await seedAd(prisma, {
  companyId: TEST_COMPANY_ID,
  listingId: listing.listingId,
  date: '2026-04-10',
  spend: 2_000,
});
```

Expected live math:

- revenue = `30_000`
- orders = `2`
- cost of goods = `10_000`
- commission = `3_000`
- other cost = `1_000`
- shipping = `3_000`
- ad cost = `2_000`
- net profit = `11_000`

- [ ] **Step 4.3: Update the main actuals assertion**

```ts
const synced = await service.syncActuals(plan.id, TEST_COMPANY_ID);

expect(synced.actualRevenue).toBe(30_000);
expect(synced.actualOrders).toBe(2);
expect(synced.actualProfit).toBe(11_000);
```

- [ ] **Step 4.4: Keep and update the KST boundary + cross-tenant tests**

Retain:

- April vs May month-boundary assertions
- cross-tenant exclusion

Update any expected values that formerly depended on `profitLoss.create()` rows so they now depend only on the seeded orders/ads inside the test body.

- [ ] **Step 4.5: Run the PG integration spec**

Run:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts'
```

Expected: PASS

- [ ] **Step 4.6: Commit**

```bash
rtk git add apps/server/src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts
rtk git commit -m "test(server): migrate sales-plan integration to live actuals"
```

---

## Task 5 — Release note + full verification

**Files:**
- Create: `docs/release-notes/2026-04-sales-plans-live-actuals.md`

- [ ] **Step 5.1: Write a concise release note**

Include:

- `syncActuals()` no longer reads `ProfitLoss.aggregate`
- `actualRevenue` / `actualOrders` still come from order aggregates
- `actualProfit` now sums live per-listing `netProfit`
- excluded statuses now align to `cancelled`, `returned`, `refunded`
- out-of-scope statement: `settlements`, `statistics`, `ad-strategy`, `action-task`

- [ ] **Step 5.2: Run the required verification sequence**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/sales-plans/__tests__/sales-plans.service.spec.ts'
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts'
rtk npm run dev:server
```

Expected:

- unit spec PASS
- PG integration PASS
- `npm run dev:server` boots successfully

- [ ] **Step 5.3: Closure grep**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/sales-plans
```

Expected: no matches outside historical comments or release-note prose

- [ ] **Step 5.4: Commit**

```bash
rtk git add docs/release-notes/2026-04-sales-plans-live-actuals.md
rtk git commit -m "docs(release-note): sales-plan live actuals migration"
```

## Final acceptance criteria

- `apps/server/src/sales-plans/sales-plans.service.ts` contains no `profitLoss` reads
- `syncActuals()` computes `actualProfit` from `buildPerListingMetrics()`
- excluded status set is unified to `cancelled`, `returned`, `refunded`
- unit tests mock the live helper instead of `profitLoss.aggregate`
- PG integration proves actuals from seeded orders/ads, not `ProfitLoss` rows
- `npm run dev:server` boots successfully after the change

## Out of scope

- `sales-plans` frontend page rewires
- shared schema additions
- `statistics` migration (`B1`)
- `settlements` migration (`B3`)
- `ad-strategy` migration (`B4`)
- `action-task` migration (`B5`)
