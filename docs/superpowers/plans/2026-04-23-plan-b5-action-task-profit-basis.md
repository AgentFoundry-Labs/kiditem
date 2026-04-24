# Plan B5 — Action Task Live Profit Basis

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `ActionTaskService` dependence on `ProfitLoss`, rebuild warning counts and related-product payloads from live current-month metrics, and require explicit company scope instead of fallback company resolution.

**Architecture:** `getTasks()` remains the daily seed/upsert entry point, but its finance basis changes from `profitLoss.findMany()` to a single `buildPerListingMetrics()` call over the current KST month window. The same live metrics array is reused for warning counts and related products so the service stops doing two independent `profitLoss` scans. The controller contract remains the same because `ActionTaskController` already passes `companyId`; this plan is backend-only and does not include the root dashboard `getParsed('/api/action-tasks')` follow-up.

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL 16 + `apps/server/src/common/per-listing-profit.ts` + action-task service + vitest unit/PG integration.

**Predecessors:** Plan B1, Plan B2, Plan B3, Plan B4, Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`)

**Successor:** `W7 root-action-task-typed-boundary`

---

## Locked decisions

### D1. `getTasks()` requires an explicit `companyId`

Delete the `resolveCompanyId()` fallback. `ActionTaskController` already calls `getTasks(companyId)`, and the service must not query `company.findFirst()` to guess a tenant.

```ts
async getTasks(companyId: string) {
  const { today, from, to } = this.resolveTodayContext();
  const metrics = await buildPerListingMetrics(this.prisma, companyId, from, to);
  void today;
  return metrics;
}
```

### D2. Current-month live metrics must use KST month boundaries

Daily task upserts already use `kstDayStart()`. The monthly finance basis must also be KST-safe.

```ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

private resolveTodayContext(now: Date = new Date()) {
  const today = kstDayStart(now);
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;
  return {
    today,
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}
```

### D3. Use one `PerListingMetrics[]` for both warnings and related products

Do **not** re-query finance data inside `getRelatedProducts()`. `getTasks()` should compute live metrics once and pass them down.

```ts
const metrics = await buildPerListingMetrics(this.prisma, companyId, from, to);
const relatedMap = await this.getRelatedProducts(companyId, metrics);
```

### D4. Supporting reads must be tenant-scoped

The following reads must include `companyId`:

- `inventory.findMany()`
- `thumbnail.count()`
- `masterProduct.findMany()`

This plan does not introduce any company fallback or unscoped dashboard-style query.

### D5. Root `/api/action-tasks` typed-boundary cleanup is deferred to `W7`

ADR-0019 allows same-domain cross-layer work, but this child plan intentionally stops at the backend API/service layer so the live-basis migration is verified separately from the root consumer rewire. `apps/web/src/app/page.tsx` still uses `apiClient.get<ActionTask[]>('/api/action-tasks')`; that frontend typed-boundary work moves to `W7`.

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/server/src/action-task/action-task.service.ts` | explicit company scope + live metrics warnings + related-product rewrite |
| Modify | `apps/server/src/action-task/types.ts` | update related-product comment to match live-basis ownership |
| Create | `apps/server/src/action-task/__tests__/action-task-get-tasks.spec.ts` | unit coverage for live-metric seeding and related products |
| Create | `apps/server/src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts` | real DB tenant-safe `getTasks()` flow |
| Create | `docs/release-notes/2026-04-action-task-live-profit-basis.md` | release note + verification evidence |

## Review cadence

| Task | Scope | Review |
|---|---|---|
| T1 | signature + window helpers | 1 combined |
| T2 | `getTasks()` live warning rewrite | 2-stage |
| T3 | `getRelatedProducts()` live rewrite | 2-stage |
| T4 | unit spec creation | 1 combined |
| T5 | PG integration creation | 2-stage |
| T6 | release note + verification | no review |

---

## Task 1 — Require explicit company scope and add a KST month window helper

**Files:**
- Modify: `apps/server/src/action-task/action-task.service.ts`

- [ ] **Step 1.1: Import the live helper and add a current-day/current-month resolver**

```ts
import {
  buildPerListingMetrics,
  type PerListingMetrics,
} from '../common/per-listing-profit';
import { kstDayStart, kstMonthStart } from '../common/kst';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

private resolveTodayContext(now: Date = new Date()) {
  const today = kstDayStart(now);
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;
  return {
    today,
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}
```

- [ ] **Step 1.2: Delete `resolveCompanyId()` and tighten the public signature**

```ts
async getTasks(companyId: string) {
  const { today, from, to } = this.resolveTodayContext();
  const metrics = await buildPerListingMetrics(this.prisma, companyId, from, to);
  void today;
  return metrics;
}
```

- [ ] **Step 1.3: Prove the service no longer guesses a company**

Run:

```bash
rtk rg -n "resolveCompanyId|company\\.findFirst" apps/server/src/action-task/action-task.service.ts
```

Expected: no matches

- [ ] **Step 1.4: Commit**

```bash
rtk git add apps/server/src/action-task/action-task.service.ts
rtk git commit -m "refactor(server): require explicit company scope for action tasks"
```

---

## Task 2 — Rewrite `getTasks()` warning counts from live metrics

**Files:**
- Modify: `apps/server/src/action-task/action-task.service.ts`

- [ ] **Step 2.1: Replace the `profitLoss.findMany()` batch with a single live metrics query and tenant-scoped support reads**

```ts
const [metrics, inventoryRows, lowCtrCount, lowReviewCount] = await Promise.all([
  buildPerListingMetrics(this.prisma, companyId, from, to),
  this.prisma.inventory.findMany({
    where: { companyId, currentStock: { gt: 0 } },
    select: { currentStock: true, reorderPoint: true },
  }),
  this.prisma.thumbnail.count({
    where: { companyId, ctr: { gt: 0, lt: 1.5 } },
  }),
  this.prisma.masterProduct
    .findMany({
      where: { companyId, isDeleted: false, abcGrade: 'A' },
      include: {
        listings: {
          where: { companyId, isDeleted: false },
          select: { _count: { select: { reviews: true } } },
        },
      },
    })
    .then((products) =>
      products.filter(
        (p) => p.listings.reduce((sum, l) => sum + l._count.reviews, 0) < 10,
      ).length,
    ),
]);
```

- [ ] **Step 2.2: Recompute the warning counts and total ad rate from the live metrics array**

```ts
const minusProducts = metrics.filter((m) => m.netProfit < 0).length;
const lowProfitProducts = metrics.filter(
  (m) => m.profitRate >= 0 && m.profitRate <= 3,
).length;
const highAdProducts = metrics.filter(
  (m) => m.revenue > 0 && m.adCost > 0 && (m.adCost / m.revenue) * 100 > 15,
).length;
const needReorder = inventoryRows.filter(
  (inv) => inv.reorderPoint > 0 && inv.currentStock <= inv.reorderPoint,
).length;

const totalRevenue = metrics.reduce((sum, m) => sum + m.revenue, 0);
const totalAdCost = metrics.reduce((sum, m) => sum + m.adCost, 0);
const adRate = totalRevenue > 0 ? (totalAdCost / totalRevenue) * 100 : 0;
```

- [ ] **Step 2.3: Pass the same live metrics array into related-product assembly**

```ts
const relatedMap = await this.getRelatedProducts(companyId, metrics);
```

- [ ] **Step 2.4: Prove `getTasks()` no longer touches `profitLoss`**

Run:

```bash
rtk rg -n "profitLoss" apps/server/src/action-task/action-task.service.ts
```

Expected: no matches in `getTasks()` and `getRelatedProducts()`

- [ ] **Step 2.5: Commit**

```bash
rtk git add apps/server/src/action-task/action-task.service.ts
rtk git commit -m "feat(server): migrate action-task warnings to live metrics"
```

---

## Task 3 — Rewrite `getRelatedProducts()` to use live metrics

**Files:**
- Modify: `apps/server/src/action-task/action-task.service.ts`
- Modify: `apps/server/src/action-task/types.ts`

- [ ] **Step 3.1: Change the helper signature to accept `PerListingMetrics[]` and remove the unused `inventoryRows` parameter**

```ts
private async getRelatedProducts(
  companyId: string,
  metrics: PerListingMetrics[],
): Promise<Record<string, RelatedProduct[]>> {
  const map: Record<string, RelatedProduct[]> = {};
  if (metrics.length === 0) return map;
  return map;
}
```

- [ ] **Step 3.2: Rebuild high-ad and minus-product related lists directly from `metrics`**

```ts
const highAdRows = metrics
  .filter((m) => m.revenue > 0 && m.adCost > 0 && (m.adCost / m.revenue) * 100 > 15)
  .slice(0, 20);

map['h-ad-bid'] = highAdRows.map((m) => ({
  id: m.masterId,
  name: m.masterName,
  metric: '광고비율',
  value: `${Math.round((m.adCost / m.revenue) * 1000) / 10}%`,
})) satisfies ActionTaskRelatedProduct[];
map['analyze-ad'] = map['h-ad-bid'];

const minusProducts = metrics
  .filter((m) => m.netProfit < 0)
  .slice(0, 20)
  .map((m) => ({
    id: m.masterId,
    name: m.masterName,
    metric: '이익률',
    value: `${Math.round(m.profitRate * 10) / 10}%`,
  })) satisfies ActionTaskRelatedProduct[];

map['h-minus-ad-stop'] = minusProducts;
map['h-minus-price'] = minusProducts;
map['h-price-reset'] = minusProducts;
map['analyze-deficit'] = minusProducts;
```

- [ ] **Step 3.3: Keep reorder-related products on tenant-scoped inventory joins only**

```ts
const invWithOption = await this.prisma.inventory.findMany({
  where: {
    companyId,
    currentStock: { gt: 0 },
    reorderPoint: { gt: 0 },
  },
  include: {
    option: { include: { master: { select: { id: true, name: true } } } },
  },
});

map['h-reorder'] = invWithOption
  .filter((inv) => inv.currentStock <= inv.reorderPoint)
  .slice(0, 20)
  .map((inv) => ({
    id: inv.option?.master.id ?? inv.optionId,
    name: inv.option?.master.name ?? 'N/A',
    metric: '재고',
    value: `${inv.currentStock}개 (기준 ${inv.reorderPoint})`,
  })) satisfies ActionTaskRelatedProduct[];
map['analyze-stock'] = map['h-reorder'];
```

- [ ] **Step 3.4: Update the comment in `types.ts` so it no longer documents the dead `ProfitLoss` path**

```ts
export interface RelatedProduct {
  /**
   * masterId 의미.
   * Live metrics path: `PerListingMetrics.masterId`.
   * Inventory path: option.master.id (fallback: optionId).
   * 필드명은 id 로 유지 — downstream frontend rewire 는 별도 typed-boundary follow-up.
   */
  id: string;
  name: string;
  metric: string;
  value: string;
}
```

- [ ] **Step 3.5: Commit**

```bash
rtk git add apps/server/src/action-task/action-task.service.ts apps/server/src/action-task/types.ts
rtk git commit -m "feat(server): rebuild action-task related products from live metrics"
```

---

## Task 4 — Add unit coverage for live warning seeding

**Files:**
- Create: `apps/server/src/action-task/__tests__/action-task-get-tasks.spec.ts`

- [ ] **Step 4.1: Create a dedicated `getTasks()` spec with a module mock for the live helper**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionTaskService } from '../action-task.service';
import { buildPerListingMetrics } from '../../common/per-listing-profit';

vi.mock('../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    actionTask: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
    },
    thumbnail: {
      count: vi.fn(),
    },
    masterProduct: {
      findMany: vi.fn(),
    },
  };
}
```

- [ ] **Step 4.2: Lock the seed-generation behavior to live metrics and explicit company scope**

```ts
it('derives warning seeds from live metrics without any company fallback', async () => {
  mockedBuildPerListingMetrics.mockResolvedValue([
    {
      listingId: 'listing-minus',
      masterId: 'master-minus',
      masterName: '적자 상품',
      revenue: 10000,
      adCost: 3000,
      netProfit: -1000,
      profitRate: -10,
    } as any,
    {
      listingId: 'listing-high-ad',
      masterId: 'master-high-ad',
      masterName: '광고 과다 상품',
      revenue: 10000,
      adCost: 2000,
      netProfit: 500,
      profitRate: 5,
    } as any,
  ]);
  prisma.inventory.findMany.mockResolvedValue([]);
  prisma.thumbnail.count.mockResolvedValue(0);
  prisma.masterProduct.findMany.mockResolvedValue([]);
  prisma.actionTask.findMany.mockResolvedValue([
    {
      id: 'task-1',
      companyId: 'company-1',
      taskKey: 'h-minus-ad-stop',
      priority: 'urgent',
      apiCall: null,
      result: null,
      notes: [],
      activityLog: [],
      date: new Date('2026-04-23'),
      createdAt: new Date('2026-04-23T00:00:00Z'),
      updatedAt: new Date('2026-04-23T00:00:00Z'),
    },
  ]);

  await service.getTasks('company-1');

  expect(mockedBuildPerListingMetrics).toHaveBeenCalled();
  expect(prisma.actionTask.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        companyId_taskKey_date: expect.objectContaining({ companyId: 'company-1' }),
      },
    }),
  );
});
```

- [ ] **Step 4.3: Assert that related products now come from the live metrics payload**

```ts
it('returns relatedProducts based on live metric rows', async () => {
  mockedBuildPerListingMetrics.mockResolvedValue([
    {
      listingId: 'listing-minus',
      masterId: 'master-minus',
      masterName: '적자 상품',
      revenue: 10000,
      adCost: 3000,
      netProfit: -1000,
      profitRate: -10,
    } as any,
  ]);
  prisma.inventory.findMany.mockResolvedValue([]);
  prisma.thumbnail.count.mockResolvedValue(0);
  prisma.masterProduct.findMany.mockResolvedValue([]);
  prisma.actionTask.findMany.mockResolvedValue([
    {
      id: 'task-1',
      companyId: 'company-1',
      taskKey: 'h-minus-ad-stop',
      priority: 'urgent',
      apiCall: null,
      result: null,
      notes: [],
      activityLog: [],
      date: new Date('2026-04-23'),
      createdAt: new Date('2026-04-23T00:00:00Z'),
      updatedAt: new Date('2026-04-23T00:00:00Z'),
    },
  ]);

  const result = await service.getTasks('company-1');

  expect(result[0].relatedProducts).toEqual([
    {
      id: 'master-minus',
      name: '적자 상품',
      metric: '이익률',
      value: '-10%',
    },
  ]);
});
```

- [ ] **Step 4.4: Run the action-task unit specs**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/action-task/__tests__/action-task-flow.spec.ts src/action-task/__tests__/action-task-claim.spec.ts src/action-task/__tests__/action-task-get-tasks.spec.ts'
```

Expected: PASS

- [ ] **Step 4.5: Commit**

```bash
rtk git add apps/server/src/action-task/__tests__/action-task-get-tasks.spec.ts
rtk git commit -m "test(server): add action-task live metrics unit coverage"
```

---

## Task 5 — Add a PG integration spec for tenant-safe live task seeding

**Files:**
- Create: `apps/server/src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts`

- [ ] **Step 5.1: Build a real Prisma integration harness using the shared finance seed helpers**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ActionTaskService } from '../action-task.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';
```

- [ ] **Step 5.2: Seed one own-company negative/high-ad listing that will also trigger reorder**

```ts
const ownMaster = await setupMaster(prisma, {
  companyId: TEST_COMPANY_ID,
  code: 'M-NEG',
  name: 'Own Negative',
});
const ownOption = await setupProductOption(prisma, {
  companyId: TEST_COMPANY_ID,
  masterId: ownMaster.id,
  sku: 'SKU-NEG',
  costPrice: 6000,
  commissionRate: 0.1,
});
const ownListing = await setupChannelListing(prisma, {
  companyId: TEST_COMPANY_ID,
  masterId: ownMaster.id,
  channel: 'coupang',
  externalId: 'EXT-NEG',
  optionId: ownOption.id,
  vendorItemId: 'VI-NEG',
});

await seedOrderWithLineItems(prisma, {
  companyId: TEST_COMPANY_ID,
  externalOrderId: 'ORD-NEG',
  orderedAt: new Date().toISOString(),
  shippingPrice: 1000,
  lineItems: [
    {
      quantity: 1,
      totalPrice: 10000,
      optionId: ownOption.id,
      listingOptionId: ownListing.listingOptionId,
    },
  ],
});
await seedAd(prisma, {
  companyId: TEST_COMPANY_ID,
  listingId: ownListing.listingId,
  date: new Date().toISOString(),
  spend: 5000,
});
```

- [ ] **Step 5.3: Add the tenant-scoped reorder inventory row and a foreign-company listing that must not leak**

```ts
await prisma.inventory.create({
  data: {
    companyId: TEST_COMPANY_ID,
    optionId: ownOption.id,
    currentStock: 2,
    reorderPoint: 5,
  },
});

const foreignMaster = await setupMaster(prisma, {
  companyId: OTHER_COMPANY_ID,
  code: 'M-FOREIGN',
  name: 'Foreign Negative',
});
const foreignOption = await setupProductOption(prisma, {
  companyId: OTHER_COMPANY_ID,
  masterId: foreignMaster.id,
  sku: 'SKU-FOREIGN',
  costPrice: 6000,
  commissionRate: 0.1,
});
const foreignListing = await setupChannelListing(prisma, {
  companyId: OTHER_COMPANY_ID,
  masterId: foreignMaster.id,
  channel: 'coupang',
  externalId: 'EXT-FOREIGN',
  optionId: foreignOption.id,
  vendorItemId: 'VI-FOREIGN',
});
await seedOrderWithLineItems(prisma, {
  companyId: OTHER_COMPANY_ID,
  externalOrderId: 'ORD-FOREIGN',
  orderedAt: new Date().toISOString(),
  shippingPrice: 1000,
  lineItems: [
    {
      quantity: 1,
      totalPrice: 10000,
      optionId: foreignOption.id,
      listingOptionId: foreignListing.listingOptionId,
    },
  ],
});
await seedAd(prisma, {
  companyId: OTHER_COMPANY_ID,
  listingId: foreignListing.listingId,
  date: new Date().toISOString(),
  spend: 5000,
});
```

- [ ] **Step 5.4: Assert the generated tasks and related products stay within the requested tenant**

```ts
const result = await service.getTasks(TEST_COMPANY_ID);

expect(result.some((t) => t.taskKey === 'h-minus-ad-stop')).toBe(true);
expect(result.some((t) => t.taskKey === 'h-ad-bid')).toBe(true);
expect(result.some((t) => t.taskKey === 'h-reorder')).toBe(true);

const allNames = result.flatMap((t) => t.relatedProducts.map((p) => p.name));
expect(allNames).toContain('Own Negative');
expect(allNames).not.toContain('Foreign Negative');
```

- [ ] **Step 5.5: Run the integration spec**

Run:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts'
```

Expected: PASS

- [ ] **Step 5.6: Commit**

```bash
rtk git add apps/server/src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts
rtk git commit -m "test(server): add action-task live metrics integration flow"
```

---

## Task 6 — Document and verify the migration

**Files:**
- Create: `docs/release-notes/2026-04-action-task-live-profit-basis.md`

- [ ] **Step 6.1: Write the release note**

```md
# 2026-04 Action Task Live Profit Basis

## What changed

- `ActionTaskService.getTasks(companyId)` now derives finance warnings from `buildPerListingMetrics()`
- removed `resolveCompanyId()` fallback and all `profitLoss` reads from action-task
- related products now come from live metrics plus tenant-scoped inventory joins
- added unit and PG integration coverage for `getTasks()`

## Verification

- `cd apps/server && npx vitest run src/action-task/__tests__/action-task-flow.spec.ts src/action-task/__tests__/action-task-claim.spec.ts src/action-task/__tests__/action-task-get-tasks.spec.ts`
- `cd apps/server && npx vitest run src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts`
- `npm run dev:server`
```

- [ ] **Step 6.2: Run the full backend verification gate**

Run:

```bash
rtk bash -lc 'cd apps/server && npx vitest run src/action-task/__tests__/action-task-flow.spec.ts src/action-task/__tests__/action-task-claim.spec.ts src/action-task/__tests__/action-task-get-tasks.spec.ts'
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk bash -lc 'cd apps/server && npx vitest run src/action-task/__tests__/action-task-get-tasks.pg.integration.spec.ts'
rtk npm run dev:server
```

Expected: all commands pass, and `dev:server` boots successfully

- [ ] **Step 6.3: Commit**

```bash
rtk git add docs/release-notes/2026-04-action-task-live-profit-basis.md
rtk git commit -m "docs: record action-task live profit migration"
```

## Acceptance criteria

- `apps/server/src/action-task/action-task.service.ts` no longer reads `profitLoss`
- `getTasks()` requires explicit `companyId` and never calls `company.findFirst()`
- warning counts and related products both come from one live metrics array
- tenant scopes are present on inventory/thumbnail/master-product support reads
- new unit + PG integration coverage exists for `getTasks()`
- `npm run dev:server` still boots after the change

## Out of scope

- root dashboard `apiClient.getParsed('/api/action-tasks')` conversion
- changes to `generateSeeds()` wording or task priorities outside the live-basis inputs
- alert claim/unclaim/list behavior
- any frontend action-task rendering work
