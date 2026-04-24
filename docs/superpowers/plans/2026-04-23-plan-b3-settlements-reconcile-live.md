# Plan B3 — Settlements Reconcile Live Basis

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `SettlementsService.reconcile()` dependence on `ProfitLoss.findMany()`, keep the existing reconcile response shape stable for the current sales-analysis page, and rebuild the "PL side" of the reconcile report from live per-listing metrics.

**Architecture:** `reconcile()` becomes a live-to-live consistency report. The "PL side" fields (`plRevenue`, `plCommission`, `plNetProfit`, `plOrderCount`) are populated from `buildPerListingMetrics()` for the target month, while the "order side" remains the existing raw SQL grouped by `listing_id`. This preserves the page contract and the tolerance-band algorithm, but stops depending on a dead snapshot table.

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL 16 + `apps/server/src/common/per-listing-profit.ts` + shared `SettlementReconcileResponse` types + vitest unit/PG integration.

**Predecessors:** Plan D.3, Plan B1, Plan B2, Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`)

**Successor:** `B4 ad-strategy-profit-basis`

---

## Locked decisions

### D1. Response field names stay stable

Keep the current response keys for frontend compatibility:

- `plRevenue`
- `plCommission`
- `plNetProfit`
- `plOrderCount`

These names now mean "live finance basis" rather than "persisted ProfitLoss row", but the shape must not change in B3.

### D2. Raw SQL order-side filtering must align with the live helper

`buildPerListingMetrics()` excludes `cancelled`, `returned`, and `refunded`. The reconcile-side raw SQL must exclude the same statuses:

```sql
AND o.status NOT IN ('cancelled', 'returned', 'refunded')
```

### D3. Dead `ProfitLoss` zero rows are not recreated

The old implementation could show listings that existed only because `ProfitLoss` had a row. B3 does **not** synthesize those rows. If there are no live listing metrics in the period, `details` is empty and summary counts are zero.

### D4. Tolerance-band logic stays unchanged

Keep:

- `matched`: `absDiff <= 100`
- `minor_diff`: `100 < absDiff <= 1000`
- `mismatch`: `absDiff > 1000`

Unit tests lock the band math. PG integration focuses on the live-path behavior, KST boundary, and tenant isolation.

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/server/src/settlements/settlements.service.ts` | live reconcile basis + aligned status filter |
| Modify | `apps/server/src/settlements/__tests__/settlements.spec.ts` | unit tests with helper mock |
| Modify | `apps/server/src/settlements/__tests__/settlements-flow.pg.integration.spec.ts` | real DB matched-path + KST + tenant isolation |
| Create | `docs/release-notes/2026-04-settlements-live-reconcile.md` | release note + verification evidence |

## Review cadence

| Task | Scope | Review |
|---|---|---|
| T1 | reconcile foundation helpers | 1 combined |
| T2 | reconcile live rewrite | 2-stage |
| T3 | unit spec rewrite | 1 combined |
| T4 | PG integration rewrite | 2-stage |
| T5 | release note + verification | no review |

---

## Task 1 — Add live reconcile foundation

**Files:**
- Modify: `apps/server/src/settlements/settlements.service.ts`

- [ ] **Step 1.1: Import `buildPerListingMetrics()` and define a period-window helper**

```ts
import { buildPerListingMetrics } from '../common/per-listing-profit';
import { kstMonthStart } from '../common/kst';

private resolveWindow(period: string) {
  const [year, month] = period.split('-').map(Number);
  return {
    year,
    month,
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}
```

- [ ] **Step 1.2: Reuse `resolveWindow()` in `reconcile()`**

```ts
const { year, month, from, to } = this.resolveWindow(period);
```

- [ ] **Step 1.3: Align the raw SQL status filter to the helper**

```sql
AND o.status NOT IN ('cancelled', 'returned', 'refunded')
```

- [ ] **Step 1.4: Type-check the service file**

Run:

```bash
rtk bash -lc 'cd apps/server && npx tsc --noEmit'
```

Expected: no new `settlements.service.ts` type errors

- [ ] **Step 1.5: Commit**

```bash
rtk git add apps/server/src/settlements/settlements.service.ts
rtk git commit -m "refactor(server): add settlements live reconcile foundation"
```

---

## Task 2 — Rewrite `reconcile()` to use live metrics

**Files:**
- Modify: `apps/server/src/settlements/settlements.service.ts`

- [ ] **Step 2.1: Replace `profitLoss.findMany()` with `buildPerListingMetrics()`**

```ts
async reconcile(companyId: string, period: string) {
  const { year, month, from, to } = this.resolveWindow(period);

  const [metrics, rows] = await Promise.all([
    buildPerListingMetrics(this.prisma, companyId, from, to),
    this.prisma.$queryRaw<
      Array<{ listing_id: string; total_price: bigint; order_count: bigint }>
    >`
      SELECT clo.listing_id AS listing_id,
             SUM(oli.total_price)::bigint AS total_price,
             COUNT(DISTINCT o.id)::bigint AS order_count
        FROM order_line_items oli
        JOIN channel_listing_options clo ON oli.listing_option_id = clo.id
        JOIN orders o ON oli.order_id = o.id
       WHERE o.company_id = ${companyId}::uuid
         AND o.ordered_at >= ${from}
         AND o.ordered_at <  ${to}
         AND o.status NOT IN ('cancelled', 'returned', 'refunded')
       GROUP BY clo.listing_id
    `,
  ]);
```

- [ ] **Step 2.2: Rebuild `details` from the live metrics array**

```ts
const orderMap = new Map<string, { total: number; count: number }>(
  rows.map((r) => [r.listing_id, { total: Number(r.total_price), count: Number(r.order_count) }]),
);

let totalPlRevenue = 0;
let totalOrderRevenue = 0;
let matchedCount = 0;
let mismatchCount = 0;

const details = metrics.map((m) => {
  const od = orderMap.get(m.listingId) ?? { total: 0, count: 0 };
  const revenueDiff = m.revenue - od.total;
  const absDiff = Math.abs(revenueDiff);
  const status: 'matched' | 'minor_diff' | 'mismatch' =
    absDiff <= 100 ? 'matched' : absDiff <= 1000 ? 'minor_diff' : 'mismatch';

  totalPlRevenue += m.revenue;
  totalOrderRevenue += od.total;
  if (status === 'matched') matchedCount++;
  else mismatchCount++;

  return {
    listingId: m.listingId,
    externalId: m.externalId,
    channelName: m.channelName,
    masterCode: m.masterCode,
    masterName: m.masterName,
    plRevenue: m.revenue,
    plCommission: m.commission,
    plNetProfit: m.netProfit,
    plOrderCount: m.orderCount,
    orderTotal: od.total,
    orderCount: od.count,
    revenueDiff,
    isMatched: status === 'matched',
    status,
  } satisfies SettlementReconcileDetail;
});
```

- [ ] **Step 2.3: Rebuild the summary from the same live metrics**

```ts
const productCount = details.length;
const matchRate = productCount > 0
  ? Math.round((matchedCount / productCount) * 100)
  : 0;

return {
  success: true,
  period,
  summary: {
    totalPlRevenue,
    totalOrderRevenue,
    totalCommission: metrics.reduce((sum, m) => sum + m.commission, 0),
    totalShipping: metrics.reduce((sum, m) => sum + m.shippingCost, 0),
    revenueDifference: totalPlRevenue - totalOrderRevenue,
    productCount,
    orderCount: rows.reduce((sum, r) => sum + Number(r.order_count), 0),
    matchedCount,
    mismatchCount,
    matchRate,
  },
  details,
} satisfies SettlementReconcileResponse;
```

- [ ] **Step 2.4: Prove the service no longer touches `profitLoss`**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/settlements/settlements.service.ts
```

Expected: no matches

- [ ] **Step 2.5: Commit**

```bash
rtk git add apps/server/src/settlements/settlements.service.ts
rtk git commit -m "feat(server): migrate settlements reconcile to live basis"
```

---

## Task 3 — Rewrite the unit spec around the live helper

**Files:**
- Modify: `apps/server/src/settlements/__tests__/settlements.spec.ts`

- [ ] **Step 3.1: Replace `profitLoss.findMany()` mocking with a helper module mock**

```ts
import { buildPerListingMetrics } from '../../common/per-listing-profit';

vi.mock('../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    settlement: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}
```

- [ ] **Step 3.2: Keep the tolerance-band tests, but feed them through mocked live metrics**

```ts
mockedBuildPerListingMetrics.mockResolvedValue([{
  listingId: 'l1',
  externalId: 'EXT-1',
  channelName: '쿠팡',
  masterCode: 'M-0001',
  masterName: '아기 로션',
  revenue: 10_000,
  commission: 1_000,
  netProfit: 2_000,
  orderCount: 5,
} as any]);
prisma.$queryRaw.mockResolvedValue([
  { listing_id: 'l1', total_price: 10_500n, order_count: 5n },
]);

const result = await service.reconcile('c1', '2025-03');
expect(result.details[0].status).toBe('minor_diff');
```

- [ ] **Step 3.3: Replace the old "missing order aggregate" case with an explicit empty live period**

```ts
it('returns empty details and zero summary when no live metrics exist in the period', async () => {
  mockedBuildPerListingMetrics.mockResolvedValue([]);
  prisma.$queryRaw.mockResolvedValue([]);

  const result = await service.reconcile('c1', '2025-03');

  expect(result.details).toEqual([]);
  expect(result.summary).toEqual({
    totalPlRevenue: 0,
    totalOrderRevenue: 0,
    totalCommission: 0,
    totalShipping: 0,
    revenueDifference: 0,
    productCount: 0,
    orderCount: 0,
    matchedCount: 0,
    mismatchCount: 0,
    matchRate: 0,
  });
});
```

- [ ] **Step 3.4: Run the unit spec**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/settlements/__tests__/settlements.spec.ts'
```

Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
rtk git add apps/server/src/settlements/__tests__/settlements.spec.ts
rtk git commit -m "test(server): rewrite settlements unit coverage for live reconcile"
```

---

## Task 4 — Rewrite PG integration around live metrics

**Files:**
- Modify: `apps/server/src/settlements/__tests__/settlements-flow.pg.integration.spec.ts`

- [ ] **Step 4.1: Replace `profitLoss.create()` fixtures with reusable finance seed helpers**

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

- [ ] **Step 4.2: Add one deterministic matched-path fixture**

```ts
const master = await setupMaster(prisma, {
  companyId: TEST_COMPANY_ID,
  code: 'SET-M1',
  name: 'Settlement Master',
});
const option = await setupProductOption(prisma, {
  companyId: TEST_COMPANY_ID,
  masterId: master.id,
  sku: 'SET-M1-001',
  costPrice: 5_000,
  commissionRate: 0.1,
  otherCost: 500,
});
const listing = await setupChannelListing(prisma, {
  companyId: TEST_COMPANY_ID,
  masterId: master.id,
  channel: 'coupang',
  externalId: 'SET-EXT-1',
  channelName: 'SET L1',
  optionId: option.id,
  vendorItemId: 'SET-VI-1',
});

await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'SET-ORD-1',
  orderedAt: '2026-03-15T00:00:00.000Z',
  shippingPrice: 3_000,
  status: 'paid',
  lineItems: [{
    quantity: 1,
    totalPrice: 20_000,
    optionId: option.id,
    listingOptionId: listing.listingOptionId,
  }],
});
await seedAd(prisma, {
  companyId: TEST_COMPANY_ID,
  listingId: listing.listingId,
  date: '2026-03-15',
  spend: 2_000,
});
```

Expected live values:

- `plRevenue = 20_000`
- `plCommission = 2_000`
- `plNetProfit = 7_500`
- `plOrderCount = 1`
- `orderTotal = 20_000`
- `status = matched`

(`20_000 - 5_000 - 2_000 - 3_000 - 500 - 2_000 = 7_500`)

- [ ] **Step 4.3: Rewrite the core integration assertions around the matched path**

```ts
const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');

expect(result.details).toHaveLength(1);
expect(result.details[0]).toEqual(
  expect.objectContaining({
    listingId: listing.listingId,
    plRevenue: 20_000,
    plCommission: 2_000,
    plNetProfit: 7_500,
    plOrderCount: 1,
    orderTotal: 20_000,
    orderCount: 1,
    revenueDiff: 0,
    status: 'matched',
  }),
);
expect(result.summary.totalPlRevenue).toBe(20_000);
expect(result.summary.totalOrderRevenue).toBe(20_000);
expect(result.summary.totalCommission).toBe(2_000);
expect(result.summary.totalShipping).toBe(3_000);
```

- [ ] **Step 4.4: Keep the KST boundary and cross-tenant tests, but remove all `profitLoss.create()` usage**

Retain:

- March vs April KST-boundary assertions
- cross-tenant isolation

Update each fixture so the listing/order data is seeded from orders/listing-options instead of `ProfitLoss`.

- [ ] **Step 4.5: Run the PG integration spec**

Run:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/settlements/__tests__/settlements-flow.pg.integration.spec.ts'
```

Expected: PASS

- [ ] **Step 4.6: Commit**

```bash
rtk git add apps/server/src/settlements/__tests__/settlements-flow.pg.integration.spec.ts
rtk git commit -m "test(server): migrate settlements integration to live reconcile"
```

---

## Task 5 — Release note + full verification

**Files:**
- Create: `docs/release-notes/2026-04-settlements-live-reconcile.md`

- [ ] **Step 5.1: Write the release note**

Include:

- `SettlementsService.reconcile()` no longer reads `ProfitLoss`
- `pl*` fields are now live finance-basis values, not table snapshots
- raw SQL compare side still exists as the order-side control
- excluded statuses aligned to `cancelled`, `returned`, `refunded`
- out-of-scope statement: page rewire, export redesign, sales-plan/statistics/action-task/ad-strategy migrations

- [ ] **Step 5.2: Run the full verification sequence**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/settlements/__tests__/settlements.spec.ts'
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/settlements/__tests__/settlements-flow.pg.integration.spec.ts'
rtk npm run dev:server
```

Expected:

- unit spec PASS
- PG integration PASS
- `npm run dev:server` boots successfully

- [ ] **Step 5.3: Closure grep**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/settlements
```

Expected: no matches outside release-note prose

- [ ] **Step 5.4: Commit**

```bash
rtk git add docs/release-notes/2026-04-settlements-live-reconcile.md
rtk git commit -m "docs(release-note): settlements live reconcile migration"
```

## Final acceptance criteria

- `apps/server/src/settlements/settlements.service.ts` contains no `profitLoss` reads
- response field names stay stable (`plRevenue`, `plCommission`, `plNetProfit`, `plOrderCount`)
- raw SQL and helper use the same excluded status set
- zero-live periods return empty details instead of dead-table placeholder rows
- unit tests lock tolerance bands through mocked live metrics
- PG integration proves matched live-path behavior, KST month boundaries, and tenant isolation
- `npm run dev:server` boots successfully after the change

## Out of scope

- `Settlements.tsx` frontend rewire
- settlement export redesign
- statistics migration (`B1`)
- sales-plan actuals migration (`B2`)
- ad-strategy migration (`B4`)
- action-task migration (`B5`)
