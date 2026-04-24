# Plan B4 — Ad Strategy Live Profit Basis

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `AdStrategyService.loadStrategyContext()` dependence on `ProfitLoss` rows, keep the current ad-strategy API shape stable, and drive rule evaluation / weekly-plan context from live monthly per-listing metrics.

**Architecture:** `loadStrategyContext()` remains the orchestrator boundary for ad aggregates, hydrated listings, and config. The only semantic change is the profit basis: monthly `profitRateByListing` now comes from `buildPerListingMetrics()` instead of `prisma.profitLoss.findMany()`, and the dead `profitLosses` plumbing is removed from `types.ts`, `calcTop20()`, and all related tests. PG integration must stop fabricating `profitLoss` snapshot rows and instead seed real orders plus ads so the new live basis is exercised end-to-end.

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL 16 + `apps/server/src/common/per-listing-profit.ts` + advertising service layer + vitest unit/PG integration.

**Predecessors:** Plan B1, Plan B2, Plan B3, Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`)

**Successor:** `B5 action-task-profit-basis`

---

## Locked decisions

### D1. `profitRateByListing` remains percentage-shaped

`buildPerListingMetrics()` already returns `profitRate` as a percentage-like number (`20`, `-5.4`, `0`), not a ratio (`0.2`). `AdStrategyService` must stop multiplying by `100`.

```ts
const profitRateByListing = new Map(
  liveMetrics.map((m) => [m.listingId, m.profitRate]),
);
```

`ad-grade-rules.service.ts` already rounds `profitRate` directly into `proposedValue`, so feeding `20` must produce `20`, not `2000`.

### D2. Remove dead `profitLosses` plumbing instead of carrying a stale name

`Top20Input.profitLosses` is not used by `calcTop20()`. Do not keep an unused `profitLosses` array in the service context just to preserve old naming.

```ts
export interface Top20Input {
  listings: HydratedListing[];
  adGroups: AdAggregateRow[];
}
```

### D3. The period stays "current month", but the month window must be explicit

Keep `getCurrentPeriod()` as the caller-facing decision for "which month", but convert `year/month` into `[from, to)` with `kstMonthStart()` before calling the live helper.

```ts
private resolveMonthWindow(year: number, month: number) {
  return {
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}
```

### D4. No controller or frontend contract changes in B4

This plan does **not** change:

- `/api/ad-strategy/*` routes
- shared response schemas
- frontend ad-ops pages

Only the backend profit basis and its tests move.

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/server/src/advertising/services/ad-strategy.service.ts` | live monthly profit basis + `calcTop20()` caller cleanup |
| Modify | `apps/server/src/advertising/services/types.ts` | remove `ProfitLossRow` / `Top20Input.profitLosses`; fix comments |
| Modify | `apps/server/src/advertising/services/ad-budget-allocator.service.ts` | remove dead `profitLosses` references from docs/signature |
| Modify | `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts` | unit spec with helper mock + percentage assertion |
| Modify | `apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts` | update `calcTop20()` call sites to new input shape |
| Modify | `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts` | real order/ad seeds; no `profitLoss.create()` fixtures |
| Create | `docs/release-notes/2026-04-ad-strategy-live-profit-basis.md` | release note + verification evidence |

## Review cadence

| Task | Scope | Review |
|---|---|---|
| T1 | type surface + allocator cleanup | 1 combined |
| T2 | service live rewrite | 2-stage |
| T3 | unit spec rewrite | 1 combined |
| T4 | PG integration rewrite | 2-stage |
| T5 | release note + verification | no review |

---

## Task 1 — Remove dead `ProfitLoss` plumbing from advertising types

**Files:**
- Modify: `apps/server/src/advertising/services/types.ts`
- Modify: `apps/server/src/advertising/services/ad-budget-allocator.service.ts`

- [ ] **Step 1.1: Delete `ProfitLossRow` and simplify `Top20Input`**

```ts
// types.ts
export interface GradeRulesInput {
  adGroups: AdAggregateRow[];
  listings: HydratedListing[];
  gradeMap: Map<string, 'A' | 'B' | 'C' | null>;
  /** listingId -> live monthly profitRate percentage (e.g. 20, -5.4). */
  profitRateByListing: Map<string, number>;
}

export interface Top20Input {
  listings: HydratedListing[];
  adGroups: AdAggregateRow[];
}
```

- [ ] **Step 1.2: Remove `profitLosses` from `calcTop20()` comments and destructuring**

```ts
// ad-budget-allocator.service.ts
calcTop20(input: Top20Input): AdTop20Item[] {
  const { listings, adGroups } = input;
  const adGroupMap = new Map(adGroups.map((g) => [g.listingId, g]));
  // remaining body unchanged
}
```

- [ ] **Step 1.3: Type-check the advertising services after the signature cleanup**

Run:

```bash
rtk bash -lc 'cd apps/server && npx tsc --noEmit'
```

Expected: no new `advertising/services/*` type errors

- [ ] **Step 1.4: Commit**

```bash
rtk git add apps/server/src/advertising/services/types.ts apps/server/src/advertising/services/ad-budget-allocator.service.ts
rtk git commit -m "refactor(server): remove ad-strategy profitloss type plumbing"
```

---

## Task 2 — Rewrite `loadStrategyContext()` to use live monthly metrics

**Files:**
- Modify: `apps/server/src/advertising/services/ad-strategy.service.ts`

- [ ] **Step 2.1: Import the live helper and add an explicit month-window helper**

```ts
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';

private resolveMonthWindow(year: number, month: number) {
  return {
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}
```

- [ ] **Step 2.2: Replace `prisma.profitLoss.findMany()` with `buildPerListingMetrics()` filtered to the active listing set**

```ts
private async loadStrategyContext(companyId: string, year: number, month: number) {
  const since14d = new Date();
  since14d.setDate(since14d.getDate() - 14);

  const [adAggAll, adAgg14d, config] = await Promise.all([
    this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId },
      _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
    }),
    this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId, date: { gte: since14d } },
      _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
    }),
    this.adConfigService.getConfig(companyId),
  ]);

  const listingIds = uniqueIds([
    ...adAggAll.map((a) => a.listingId),
    ...adAgg14d.map((a) => a.listingId),
  ]);
  const listingIdSet = new Set(listingIds);
  const { from, to } = this.resolveMonthWindow(year, month);

  const [listings, liveMetrics] = await Promise.all([
    hydrateListings(this.prisma, companyId, listingIds),
    listingIds.length === 0
      ? Promise.resolve([])
      : buildPerListingMetrics(this.prisma, companyId, from, to).then((rows) =>
          rows.filter((row) => listingIdSet.has(row.listingId)),
        ),
  ]);

  const profitRateByListing = new Map<string, number>(
    liveMetrics.map((m) => [m.listingId, m.profitRate]),
  );

  return {
    adGroups: toAdAggregateRows(adAggAll),
    adIssuesAdGroups: toAdAggregateRows(adAgg14d),
    listings,
    profitRateByListing,
    gradeMap: buildGradeMap(listings),
    config: config satisfies AdsConfig,
  };
}
```

- [ ] **Step 2.3: Remove the dead `profitLosses` argument from `getWeeklyPlan()`**

```ts
top20: this.adBudgetAllocator.calcTop20({
  listings: ctx.listings,
  adGroups: ctx.adGroups,
}),
```

- [ ] **Step 2.4: Prove the service/type surface no longer mentions `profitLoss`**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/advertising/services/ad-strategy.service.ts apps/server/src/advertising/services/ad-budget-allocator.service.ts apps/server/src/advertising/services/types.ts
```

Expected: no matches

- [ ] **Step 2.5: Commit**

```bash
rtk git add apps/server/src/advertising/services/ad-strategy.service.ts apps/server/src/advertising/services/types.ts apps/server/src/advertising/services/ad-budget-allocator.service.ts
rtk git commit -m "feat(server): migrate ad-strategy profit basis to live metrics"
```

---

## Task 3 — Rewrite unit specs around the live helper

**Files:**
- Modify: `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts`
- Modify: `apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts`

- [ ] **Step 3.1: Mock `buildPerListingMetrics()` in the orchestrator spec and remove the old Prisma stub**

```ts
import { buildPerListingMetrics } from '../../../common/per-listing-profit';

vi.mock('../../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

beforeEach(() => {
  prisma = {
    ad: { groupBy: vi.fn().mockResolvedValue([]) },
    channelListing: { findMany: vi.fn().mockResolvedValue([]) },
    channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
    review: { groupBy: vi.fn().mockResolvedValue([]) },
    trafficStats: { findMany: vi.fn().mockResolvedValue([]) },
  };
  mockedBuildPerListingMetrics.mockResolvedValue([]);
});
```

- [ ] **Step 3.2: Add an assertion that `profitRateByListing` receives `20`, not `2000`, and that `calcTop20()` no longer gets `profitLosses`**

```ts
it('getWeeklyPlan passes live percentage profit rates to rule evaluation', async () => {
  prisma.ad.groupBy
    .mockResolvedValueOnce([
      {
        listingId: 'L1',
        _sum: { spend: 10000, revenue: 50000, clicks: 100, impressions: 10000, conversions: 10 },
      },
    ])
    .mockResolvedValueOnce([]);

  mockedBuildPerListingMetrics.mockResolvedValue([
    {
      listingId: 'L1',
      profitRate: 20,
      revenue: 20000,
      adCost: 2000,
      netProfit: 4000,
    } as any,
  ]);

  await service.getWeeklyPlan('14d', 'company-1');

  const gradeArg = adGradeRules.calcActions.mock.calls[0][0];
  expect(gradeArg.profitRateByListing.get('L1')).toBe(20);

  const top20Arg = adBudgetAllocator.calcTop20.mock.calls[0][0];
  expect(top20Arg).not.toHaveProperty('profitLosses');
});
```

- [ ] **Step 3.3: Update `calcTop20()` unit call sites to the new input shape**

```ts
const result = service.calcTop20({
  listings: [listingA, listingB, listingC],
  adGroups,
});
```

- [ ] **Step 3.4: Run the advertising unit specs**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/advertising/services/__tests__/ad-strategy.spec.ts src/advertising/services/__tests__/ad-budget-allocator.spec.ts'
```

Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
rtk git add apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts
rtk git commit -m "test(server): cover ad-strategy live profit basis"
```

---

## Task 4 — Replace `profitLoss` integration fixtures with real orders and ads

**Files:**
- Modify: `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`

- [ ] **Step 4.1: Extend the local listing seed helper to return the created `listingOption`**

```ts
async function seedGradedListing(params: {
  companyId: string;
  abcGrade: 'A' | 'B' | 'C';
  adTier?: string | null;
  healthScore?: number | null;
  availableStock?: number | null;
  costPrice?: number | null;
  sellPrice?: number | null;
  commissionRate?: number | null;
  shippingCost?: number | null;
  suffix: string;
}) {
  const master = await prisma.masterProduct.create({
    data: {
      companyId: params.companyId,
      code: `M-${params.suffix}`,
      name: `Master ${params.suffix}`,
      abcGrade: params.abcGrade,
      adTier: params.adTier ?? null,
      healthScore: params.healthScore ?? null,
      optionCounter: 0,
    },
  });
  const option = await prisma.productOption.create({
    data: {
      companyId: params.companyId,
      masterId: master.id,
      sku: `SKU-${params.suffix}`,
      optionName: `Option ${params.suffix}`,
      availableStock: params.availableStock ?? 100,
      costPrice: params.costPrice ?? 5000,
      sellPrice: params.sellPrice ?? 20000,
      commissionRate: params.commissionRate ?? 0.1,
      shippingCost: params.shippingCost ?? 2500,
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      companyId: params.companyId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `EXT-${params.suffix}`,
      channelName: `Channel ${params.suffix}`,
    },
  });
  const listingOption = await prisma.channelListingOption.create({
    data: {
      companyId: params.companyId,
      listingId: listing.id,
      optionId: option.id,
      vendorItemId: `VI-${params.suffix}`,
      isActive: true,
    },
  });
  return { master, option, listing, listingOption };
}
```

- [ ] **Step 4.2: Replace the first `profitLoss.create()` fixture with real monthly order + ad inputs and assert the live `proposedValue`**

```ts
import { seedOrderWithLineItems } from '../../test-helpers/finance-seeds';

const a = await seedGradedListing({
  companyId: TEST_COMPANY_ID,
  abcGrade: 'A',
  adTier: '1차',
  healthScore: 80,
  costPrice: 10000,
  shippingCost: 2000,
  suffix: 'A-EXPAND',
});

await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'ORD-A-EXPAND',
  orderedAt: new Date().toISOString(),
  shippingPrice: 2000,
  lineItems: [
    {
      quantity: 1,
      totalPrice: 20000,
      optionId: a.option.id,
      listingOptionId: a.listingOption.id,
    },
  ],
});
await seedAd({
  companyId: TEST_COMPANY_ID,
  listingId: a.listing.id,
  optionId: a.option.id,
  spend: 10000,
  revenue: 50000,
  clicks: 100,
  impressions: 10000,
  conversions: 10,
});

const rules = await service.getRules('14d', TEST_COMPANY_ID);
const aAction = rules.recommendations.find(
  (r) => r.listing.listingId === a.listing.id,
);
expect(aAction?.proposedValue).toBe(20);
```

- [ ] **Step 4.3: Replace the second `profitLoss.create()` fixture in the weekly-plan shape test with a concrete live monthly order plus the existing 10-day ad history**

```ts
const a = await seedGradedListing({
  companyId: TEST_COMPANY_ID,
  abcGrade: 'A',
  adTier: '1차',
  costPrice: 10000,
  shippingCost: 2000,
  suffix: 'A-TOP',
});

for (let i = 0; i < 10; i += 1) {
  await seedAd({
    companyId: TEST_COMPANY_ID,
    listingId: a.listing.id,
    optionId: a.option.id,
    daysAgo: i,
    spend: 15000,
    revenue: 30000,
    clicks: 50,
    impressions: 5000,
    conversions: 5,
  });
}

await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'ORD-A-TOP',
  orderedAt: new Date().toISOString(),
  shippingPrice: 2000,
  lineItems: [
    {
      quantity: 1,
      totalPrice: 20000,
      optionId: a.option.id,
      listingOptionId: a.listingOption.id,
    },
  ],
});

const plan = await service.getWeeklyPlan('14d', TEST_COMPANY_ID);
expect(plan.top20[0].listing.listingId).toBe(a.listing.id);
expect(plan.top20[0].rank).toBe(1);
```

- [ ] **Step 4.4: Prove the integration spec no longer seeds `profitLoss`**

Run:

```bash
rtk rg -n "profitLoss\\.create|profitLoss" apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts
```

Expected: no matches

- [ ] **Step 4.5: Run the PG integration spec**

Run:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts'
```

Expected: PASS

- [ ] **Step 4.6: Commit**

```bash
rtk git add apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts
rtk git commit -m "test(server): migrate ad-strategy integration to live profit seeds"
```

---

## Task 5 — Document and verify the migration

**Files:**
- Create: `docs/release-notes/2026-04-ad-strategy-live-profit-basis.md`

- [ ] **Step 5.1: Write the release note**

```md
# 2026-04 Ad Strategy Live Profit Basis

## What changed

- `AdStrategyService.loadStrategyContext()` now builds monthly `profitRateByListing` from `buildPerListingMetrics()`
- removed dead `profitLosses` plumbing from ad-strategy service types and `calcTop20()`
- advertising integration tests now seed real orders plus ads instead of `profitLoss` rows

## Verification

- `cd apps/server && npx vitest run src/advertising/services/__tests__/ad-strategy.spec.ts src/advertising/services/__tests__/ad-budget-allocator.spec.ts`
- `cd apps/server && npx vitest run src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`
- `npm run dev:server`
```

- [ ] **Step 5.2: Run the full backend verification gate**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/advertising/services/__tests__/ad-strategy.spec.ts src/advertising/services/__tests__/ad-budget-allocator.spec.ts'
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts'
rtk npm run dev:server
```

Expected: all commands pass, and `dev:server` boots successfully

- [ ] **Step 5.3: Commit**

```bash
rtk git add docs/release-notes/2026-04-ad-strategy-live-profit-basis.md
rtk git commit -m "docs: record ad-strategy live profit migration"
```

## Acceptance criteria

- `apps/server/src/advertising/services/ad-strategy.service.ts` no longer reads `prisma.profitLoss`
- `Top20Input` no longer carries `profitLosses`
- `adGradeRules.calcActions()` receives live percentage values directly
- advertising PG integration no longer seeds `profitLoss` snapshot rows
- `npm run dev:server` still boots after the change

## Out of scope

- ad-ops frontend page rewires
- `buildPerListingMetrics()` semantic changes
- reintroducing any ProfitLoss writer/cache
- typed-boundary cleanup for ad-strategy frontend consumers
