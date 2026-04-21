# Plan F1 — Root Dashboard Rewire + dashboard-sales Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the root dashboard at `apps/web/src/app/page.tsx` to a working KPI / chart / warnings / top-products view by (1) implementing the throwing `DashboardSalesService` stub, (2) migrating `dashboard-inventory` warnings + `dashboard-trend` avgProfitRate from `prisma.profitLoss.*` reads to live aggregation (ADR-0016), (3) fixing the `dashboard-trend` I3 violation (`SUM(orders.total_price)` → `SUM(oli.total_price)`), and (4) rewiring the root page from `apiClient.get<T>` to `apiClient.getParsed` with extended `SectionError` props.

**Architecture:** Extract a single shared helper `apps/server/src/common/per-listing-profit.ts:buildPerListingMetrics` from the existing `profit-loss.service.findAll` per-listing loop so finance + dashboard share one source of truth. `DashboardSalesService.getSummary` becomes a 9-promise parallel fetch using the existing `calculateProfitForRange` / `aggregateAdForRange` / `fetchWingAdSummary` helpers from `dashboard/helpers/`. `monthlyTrend` is implemented as a 6-iteration loop over `calculateProfitForRange` (Q2 decision; ADR-0016 spirit). Frontend swaps untyped `apiClient.get<DashboardSalesSummary>` for `apiClient.getParsed(url, DashboardSalesSummarySchema)` and drops the dead `pipeline-stats` query (404).

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL 16 (server), Next.js 16 (App Router) + React 19 + `@tanstack/react-query` v5 + `zod` v4 + `@kiditem/shared` (frontend). Tests: `vitest` (jsdom for RTL, real-prisma adapter for PG integration) + `@testing-library/react`. Real-DB integration via `docker-compose.test.yml` Postgres on `:5434` (run `npm run db:test:up && npm run db:test:prepare && npm run test:integration`).

**Spec linkage:** This plan executes `docs/superpowers/specs/2026-04-21-plan-f1-root-dashboard-design.md` (v2, 3-reviewer findings applied). Read that spec first if you need rationale on any design decision (e.g. why `monthlyTrend` is a loop; why `TopProduct.company` derives from `ChannelListing.channelName`). All v2 invariants (I1–I12) are encoded as explicit assertions in T1–T5 specs.

**Predecessors:** Plan D.1 (profit-loss live aggregation, ADR-0016 — squashed `094511c`), Plan D.2 (ADR-0017, `e853b15`), Plan D.3 (sales-analysis live, `6aec7ec`), Plan E.1 + IDOR (ADR-0018, `f9b1232`).

**Successors:** F2 (products frontend), F3 (inventory/orders frontend), D.3b (sales-analysis 3 sub-tabs), Plan E (ad-strategy).

---

## Plan-level review (BEFORE execution)

This plan document itself goes through **5-reviewer review** before any T1 dispatch, per `feedback_review_cadence.md` and `project_kiditem_workflow.md`:

1. `critic` — adversarial: assumptions, missing edge cases, alternative paths
2. `architect` — design soundness, ADR compliance, cross-domain ripples
3. `plan-eng-review` — engineering execution feasibility, hidden complexity
4. `plan-ceo-review` — scope ambition / cut-line / business value
5. `plan-design-review` — UX / surface gaps (T5 page rewire)

CRITICAL findings → plan v2 revision before execution; MAJOR → addressed inline; MINOR → deferred to per-task review during execution.

## Per-task Review Cadence (DURING execution)

Per `feedback_review_cadence.md` and spec § Execution strategy:

| Task | Scope | Files | Review |
|---|---|---|---|
| T1 | `common/per-listing-profit.ts` extract + `profit-loss.service.findAll` refactor + integration spec (5 tests) | 3 | **2-stage** (cross-domain shared helper; finance regression risk) |
| T2 | `DashboardSalesService` full impl + integration spec NEW (6 tests) | 2 | **2-stage** (new service; complex 9-promise impl) |
| T3 | `DashboardInventoryService` warnings rewire + spec rewrite (5 tests) | 2 | **1-combined** (mechanical query swap; thresholds preserved verbatim) |
| T4 | `DashboardTrendService` avgProfitRate + I3 raw-SQL fix + spec rewrite (4 tests) | 2 | **2-stage** (I3 SQL fix — silent data-corruption risk) |
| T5 | Root `page.tsx` rewire + `SectionError` extension + RTL spec NEW (6 tests) | 2 | **1-combined** (schema-driven mechanical rewire; RTL spec self-validates behavior) |
| T6 | Verification + release note (+ ADR-0016 reader-count update) | 1 | no review (self-evidencing) |

Cadence rationale (per `feedback_review_cadence.md` — "Plan 구체성이 task review 대체"):
- **2-stage** = one `kiditem-reviewer` MODE: spec + one MODE: quality. Reserved for cross-domain risk (T1), new service implementation (T2), or correctness-critical SQL changes (T4).
- **1-combined** = single `kiditem-reviewer` covering both spec adherence + code quality. Used when the plan's code blocks are exhaustive and the change is mechanical (T3 query swap, T5 schema-driven rewire).
- **no review** = self-evidencing (T6 release note).

CRITICAL findings block next commit; MINOR may be deferred.

---

## Files Touched

### Created (5)

- `apps/server/src/common/per-listing-profit.ts` — NEW shared helper (T1)
- `apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts` — NEW (T1, 5 tests)
- `apps/server/src/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts` — NEW (T2, 6 tests)
- `apps/web/src/app/__tests__/page.spec.tsx` — NEW (T5, 6 tests)
- `docs/release-notes/2026-04-root-dashboard-rewire.md` — NEW (T6)

### Modified (7)

- `apps/server/src/finance/services/profit-loss.service.ts` — refactor `findAll` to consume helper (T1)
- `apps/server/src/dashboard/services/dashboard-sales.service.ts` — replace stub with live impl (T2)
- `apps/server/src/dashboard/services/dashboard-inventory.service.ts` — replace `profitLoss.findMany` with `buildPerListingMetrics` (T3)
- `apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts` — rewrite to seed orders not profitLoss rows (T3)
- `apps/server/src/dashboard/services/dashboard-trend.service.ts` — `avgProfitRate` via `calculateProfitForRange` + I3 raw-SQL fix (T4)
- `apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts` — rewrite to seed orders + assert I3 sentinel (T4)
- `apps/web/src/app/page.tsx` — `getParsed` + drop pipeline-stats + extend `SectionError` (T5)

### Not touched (explicit out-of-scope)

- `apps/server/src/dashboard/services/dashboard-ad.service.ts` — unchanged (already on live aggregation since D.1)
- `apps/server/src/dashboard/dashboard.controller.ts` — unchanged (no new endpoints)
- `packages/shared/src/schemas/dashboard.ts` — unchanged (existing schemas already cover the 9-field response)
- `apps/web/src/app/components/DashboardCharts.tsx` — unchanged
- `apps/web/src/app/components/SidePanel` / `MetricCard` / `DashboardChart` (inline in page.tsx) — preserved as-is, only the data wiring changes
- F2/F3/F4/Plan E/D.3b/D.5 scope — out per memory `project_next_session_handoff.md`

---

## Reusable assets (spec § Reusable assets)

These already exist on `main` — import + reuse, do not re-create:

| Asset | Path | Purpose |
|---|---|---|
| `calculateProfitForRange` | `apps/server/src/dashboard/helpers/profit-calculator.ts` | Order-based profit aggregation (T2 baseline + monthlyTrend loop, T4 avgProfitRate) |
| `aggregateAdForRange` | `apps/server/src/dashboard/helpers/ad-aggregator.ts` | Ad table groupBy (already used by dashboard-ad; T2 reads the metrics it returns indirectly via `calculateProfitForRange`) |
| `fetchWingAdSummary` | `apps/server/src/dashboard/helpers/wing-ad-summary.ts` | Wing override for `trafficKpi.adSummary` (T2) |
| `resolvePricing` | `apps/server/src/common/option-pricing-resolver.ts` | Nested-only pricing resolver for `costPrice` / `commissionRate` / `otherCost` (T1) |
| `kstMonthStart` | `apps/server/src/common/kst.ts` | KST month boundary (T1 uses for half-open range) |
| `IDOR_SENTINEL`, `TEST_COMPANY_ID`, `OTHER_COMPANY_ID`, `seedBaseFixture`, `makeTestPrisma`, `resetDb` | `apps/server/src/test-helpers/real-prisma.ts` | All integration spec setup |
| `setupMaster`, `setupProductOption`, `setupChannelListing`, `seedOrderWithLineItems`, `seedReturn`, `seedAd` | `apps/server/src/test-helpers/finance-seeds.ts` | All seeding (T1/T2/T3/T4 specs) |
| `friendlyError` | `apps/web/src/lib/api-error.ts` | Error → user-facing string (T5) |
| `apiClient.getParsed` | `apps/web/src/lib/api-client.ts` | Zod-parsed GET (T5) |
| `DashboardSalesSummarySchema`, `DashboardInventorySummarySchema`, `DashboardTrendItemSchema`, `DashboardAdSummarySchema` | `packages/shared/src/schemas/dashboard.ts` | All client-side parsing (T5) |
| `EXCLUDED_ORDER_STATUSES` | introduced as a local `const` in T1 helper (`['cancelled', 'returned', 'refunded']`) | Status filter parity with `profit-loss.service` and `profit-calculator.ts` |

---

## Spec deviation notes (read before T1)

The spec § A.1 says the helper does "3 Promise.all (orders + return-rows + ads)" but the spec's `PerListingMetrics` interface does **not** include `returnCount`. The helper would fetch return-rows and discard them.

**Plan deviation**: Helper does **2 Promise.all** (orders + ads). The `OrderReturnLineItem` fetch + `returnCount` merge stays in `profit-loss.service.findAll` because that field is part of `PLData` (finance-specific). Dashboard consumers do not need return counts in v1 (D.3b will revisit). This keeps the helper minimal and avoids dead code.

To make the helper reusable for both finance (PLData includes externalId/masterCode/category/grade/thumbnailUrl) and dashboard (warnings need only revenue/cost/profitRate/adCost), `PerListingMetrics` includes the master/listing metadata fields. Dashboard ignores them; finance maps them onto PLData.

**Final `PerListingMetrics` fields** (20 total — 5 metadata + 14 metrics + 1 listingId):

```ts
export interface PerListingMetrics {
  // Identity + metadata (consumed by finance, ignored by dashboard)
  listingId: string;
  externalId: string;
  channelName: string | null;
  channel: string;
  masterId: string;
  masterCode: string;        // master.legacyCode ?? master.code
  masterName: string;
  category: string | null;
  grade: string | null;      // master.abcGrade
  thumbnailUrl: string | null;
  // Metrics
  revenue: number;           // SUM(lineItem.totalPrice)
  costOfGoods: number;       // SUM(option.costPrice * quantity), Math.round
  commission: number;        // SUM(lineItem.totalPrice * option.commissionRate), Math.round
  shippingCost: number;      // revenue-weighted share of Order.shippingPrice, Math.round
  adCost: number;            // ad.groupBy._sum.spend
  otherCost: number;         // SUM(option.otherCost * quantity), Math.round
  netProfit: number;         // revenue - cogs - commission - shipping - ad - other
  profitRate: number;        // percentage 1 decimal: revenue > 0 ? round(netProfit/revenue * 1000)/10 : 0
  orderCount: number;        // distinct order count (Set.size)
}
```

This matches `PLData` field-for-field except for `returnCount` (added by finance after the helper call) and `cogs` (renamed `costOfGoods` per spec). `profit-loss.service.findAll` maps `costOfGoods → cogs` for the public DTO.

---

## Task 1 — Extract `common/per-listing-profit.ts` + refactor `profit-loss.service.findAll`

**Files:**
- Create: `apps/server/src/common/per-listing-profit.ts`
- Create: `apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts`
- Modify: `apps/server/src/finance/services/profit-loss.service.ts`

**Context:** `apps/server/src/finance/services/profit-loss.service.ts:42-210` already implements the per-listing aggregation. T1 lifts the per-listing core into a pure helper so dashboard can call it without importing finance internals (ADR-0006 self-contained domain). Finance retains the return-rows fetch + PLData mapping. `dashboard-inventory.service` (T3) becomes the second consumer.

Read these first:
- `apps/server/src/finance/services/profit-loss.service.ts` (current implementation)
- `apps/server/src/common/option-pricing-resolver.ts` (`resolvePricing` signature)
- `apps/server/src/common/kst.ts` (`kstMonthStart`)
- `apps/server/CLAUDE.md` § "멀티테넌트 격리" — every Prisma call must scope by `companyId`
- `apps/server/src/finance/CLAUDE.md` — confirms ProfitLoss table read is prohibited (ADR-0016)

- [ ] **Step 1.1: Read current profit-loss.service.findAll (already done — confirm shape)**

Run: `grep -n "findAll\|return rows" apps/server/src/finance/services/profit-loss.service.ts`
Expected output includes `findAll(` at L33 and the `.map((g) =>` block at L181 building PLData from groups.

- [ ] **Step 1.2: Write the helper file**

Create `apps/server/src/common/per-listing-profit.ts`:

```ts
import type { PrismaService } from '../prisma/prisma.service';
import { resolvePricing } from './option-pricing-resolver';

/**
 * Plan F1 T1 (extracted from `finance/services/profit-loss.service.ts:findAll`).
 *
 * Per-listing profit aggregation shared by:
 *   - finance/profit-loss (PLData rows, plus returnCount + extra metadata)
 *   - dashboard/dashboard-inventory (warnings.minusProducts / lowProfitProducts / highAdProducts)
 *
 * Pure function (no @Injectable). Follows ADR-0016 live aggregation:
 *   - I3 canonical: revenue = SUM(OrderLineItem.totalPrice)
 *   - I7 multi-tenant: every Prisma call scoped by companyId
 *   - I8 half-open: orderedAt: { gte: from, lt: to }
 *   - R-1 shipping: order-level Order.shippingPrice, revenue-weighted distribution
 *   - ADR-0018 compliance: all 2 queries pass companyId; no $queryRaw used
 *
 * Excludes returnCount (D.3b will add) — the OrderReturnLineItem fetch stays
 * in profit-loss.service.findAll because PLData.returnCount is finance-specific.
 *
 * Excluded order statuses: ['cancelled', 'returned', 'refunded'] — same as
 * profit-loss.service and profit-calculator.ts.
 */
export interface PerListingMetrics {
  listingId: string;
  externalId: string;
  channelName: string | null;
  channel: string;
  masterId: string;
  masterCode: string;
  masterName: string;
  category: string | null;
  grade: string | null;
  thumbnailUrl: string | null;
  revenue: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
  orderCount: number;
}

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

export async function buildPerListingMetrics(
  prisma: PrismaService,
  companyId: string,
  from: Date,
  to: Date,
): Promise<PerListingMetrics[]> {
  const [orders, adRows] = await Promise.all([
    prisma.order.findMany({
      where: {
        companyId,
        orderedAt: { gte: from, lt: to },
        status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
      },
      select: {
        id: true,
        shippingPrice: true,
        lineItems: {
          select: {
            quantity: true,
            totalPrice: true,
            option: {
              select: { costPrice: true, commissionRate: true, otherCost: true },
            },
            listingOption: {
              select: {
                listing: {
                  select: {
                    id: true,
                    externalId: true,
                    channel: true,
                    channelName: true,
                    master: {
                      select: {
                        id: true,
                        code: true,
                        legacyCode: true,
                        name: true,
                        category: true,
                        abcGrade: true,
                        thumbnailUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.ad.groupBy({
      by: ['listingId'],
      _sum: { spend: true },
      where: { companyId, date: { gte: from, lt: to } },
    }),
  ]);

  type Agg = {
    listingId: string;
    externalId: string;
    channelName: string | null;
    channel: string;
    masterId: string;
    masterCode: string;
    masterName: string;
    category: string | null;
    grade: string | null;
    thumbnailUrl: string | null;
    revenue: number;
    costOfGoods: number;
    commission: number;
    shippingCost: number;
    otherCost: number;
    orderIds: Set<string>;
  };
  const groups = new Map<string, Agg>();

  for (const o of orders) {
    const orderTotalRevenue = o.lineItems.reduce((s, li) => s + (li.totalPrice || 0), 0);

    for (const li of o.lineItems) {
      const listing = li.listingOption?.listing;
      if (!listing) continue;
      const key = listing.id;

      let g = groups.get(key);
      if (!g) {
        g = {
          listingId: listing.id,
          externalId: listing.externalId,
          channelName: listing.channelName ?? null,
          channel: listing.channel,
          masterId: listing.master.id,
          masterCode: listing.master.legacyCode ?? listing.master.code,
          masterName: listing.master.name,
          category: listing.master.category ?? null,
          grade: listing.master.abcGrade ?? null,
          thumbnailUrl: listing.master.thumbnailUrl ?? null,
          revenue: 0,
          costOfGoods: 0,
          commission: 0,
          shippingCost: 0,
          otherCost: 0,
          orderIds: new Set<string>(),
        };
        groups.set(key, g);
      }
      g.orderIds.add(o.id);

      const resolved = resolvePricing({ option: li.option ?? {} });
      const lineRevenue = li.totalPrice || 0;
      g.revenue += lineRevenue;
      g.costOfGoods += resolved.costPrice * li.quantity;
      g.commission += lineRevenue * resolved.commissionRate;
      g.otherCost += resolved.otherCost * li.quantity;

      // R-1 revenue-weighted shipping distribution (zero-revenue order → drop ship per ADR-0016)
      if (orderTotalRevenue > 0 && o.shippingPrice) {
        g.shippingCost += Math.round(o.shippingPrice * (lineRevenue / orderTotalRevenue));
      }
    }
  }

  const adCostMap = new Map<string, number>(
    adRows.map((r) => [r.listingId, r._sum.spend ?? 0]),
  );

  return Array.from(groups.values()).map((g) => {
    const adCost = adCostMap.get(g.listingId) ?? 0;
    const costOfGoods = Math.round(g.costOfGoods);
    const commission = Math.round(g.commission);
    const otherCost = Math.round(g.otherCost);
    const netProfit = g.revenue - costOfGoods - commission - g.shippingCost - adCost - otherCost;
    const profitRate = g.revenue > 0 ? Math.round((netProfit / g.revenue) * 1000) / 10 : 0;
    return {
      listingId: g.listingId,
      externalId: g.externalId,
      channelName: g.channelName,
      channel: g.channel,
      masterId: g.masterId,
      masterCode: g.masterCode,
      masterName: g.masterName,
      category: g.category,
      grade: g.grade,
      thumbnailUrl: g.thumbnailUrl,
      revenue: g.revenue,
      costOfGoods,
      commission,
      shippingCost: g.shippingCost,
      adCost,
      otherCost,
      netProfit,
      profitRate,
      orderCount: g.orderIds.size,
    } satisfies PerListingMetrics;
  });
}
```

- [ ] **Step 1.3: Write the helper integration spec**

Create `apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildPerListingMetrics } from '../per-listing-profit';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';

/**
 * Plan F1 T1 — buildPerListingMetrics (PG integration).
 *
 * Verifies the helper produces correct per-listing rollups from Order +
 * OrderLineItem + ChannelListing + MasterProduct + ProductOption + Ad,
 * with companyId scoping (ADR-0018) and revenue-weighted shipping (R-1).
 */
describe('buildPerListingMetrics (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  // April 2026 window: from 2026-04-01 to 2026-05-01
  const FROM = new Date('2026-04-01T00:00:00Z');
  const TO = new Date('2026-05-01T00:00:00Z');

  it('T1: single listing × 1 order × 1 lineItem → metrics math', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID,
      code: 'M-T1', name: 'Master T1', abcGrade: 'A', category: 'Toy',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      sku: 'SKU-T1', costPrice: 50_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T1', channelName: '쿠팡',
      optionId, vendorItemId: 'VI-T1',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'PERLIST-T-1',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_COMPANY_ID, FROM, TO);

    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m.listingId).toBe(listingId);
    expect(m.channelName).toBe('쿠팡');
    expect(m.channel).toBe('coupang');
    expect(m.masterName).toBe('Master T1');
    expect(m.grade).toBe('A');
    expect(m.revenue).toBe(100_000);
    expect(m.costOfGoods).toBe(50_000);          // 50_000 × 1
    expect(m.commission).toBe(10_000);           // 100_000 × 0.1
    expect(m.shippingCost).toBe(10_000);         // sole lineItem → entire shipping
    expect(m.adCost).toBe(0);                    // no Ad seeded
    expect(m.otherCost).toBe(0);
    expect(m.netProfit).toBe(30_000);            // 100k - 50k - 10k - 10k - 0 - 0
    expect(m.profitRate).toBe(30.0);             // 30000/100000 * 100 = 30.0
    expect(m.orderCount).toBe(1);
  });

  it('T2: 2 orders × 1 listing → revenue-weighted shipping distribution', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: 'M-T2', name: 'Master T2',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      sku: 'SKU-T2', costPrice: 0, commissionRate: 0, otherCost: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T2',
      optionId, vendorItemId: 'VI-T2',
    });
    // Order 1: shipping 3000, single lineItem 9000 → entire ship = 3000
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'PERLIST-T-2a',
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 3_000,
      lineItems: [{ quantity: 1, totalPrice: 9_000, optionId, listingOptionId }],
    });
    // Order 2: shipping 5000, single lineItem 1000 → entire ship = 5000 (single lineItem absorbs all)
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'PERLIST-T-2b',
      orderedAt: '2026-04-20T03:00:00Z',
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId, listingOptionId }],
    });

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_COMPANY_ID, FROM, TO);

    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(10_000);             // 9000 + 1000
    expect(result[0].shippingCost).toBe(8_000);         // 3000 + 5000
    expect(result[0].orderCount).toBe(2);
  });

  it('T3: ad spend per listing rolls into adCost', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: 'M-T3', name: 'Master T3',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      sku: 'SKU-T3', costPrice: 0, commissionRate: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T3',
      optionId, vendorItemId: 'VI-T3',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'PERLIST-T-3',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });
    // Two ads on different days → sum
    await seedAd(prisma, { companyId: TEST_COMPANY_ID, listingId, date: '2026-04-12', spend: 8_000 });
    await seedAd(prisma, { companyId: TEST_COMPANY_ID, listingId, date: '2026-04-22', spend: 12_000 });

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_COMPANY_ID, FROM, TO);

    expect(result).toHaveLength(1);
    expect(result[0].adCost).toBe(20_000);
    expect(result[0].netProfit).toBe(80_000);           // 100k - 0 - 0 - 0 - 20k - 0
  });

  it('T5: EXCLUDED_ORDER_STATUSES filter — cancelled/returned/refunded orders are excluded', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: 'M-T5', name: 'Master T5',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId, sku: 'SKU-T5', costPrice: 0, commissionRate: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T5',
      optionId, vendorItemId: 'VI-T5',
    });
    // 1 paid (included), 3 excluded statuses (each one a sentinel)
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'PERLIST-T-5-PAID',
      orderedAt: '2026-04-15T03:00:00Z', shippingPrice: 0, status: 'paid',
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId, listingOptionId }],
    });
    for (const status of ['cancelled', 'returned', 'refunded']) {
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID, externalOrderId: `PERLIST-T-5-${status.toUpperCase()}`,
        orderedAt: '2026-04-15T03:00:00Z', shippingPrice: 0, status,
        lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId, listingOptionId }],
      });
    }

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_COMPANY_ID, FROM, TO);
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(1_000);                    // only the paid order
    expect(result[0].revenue).not.toBe(IDOR_SENTINEL);        // excluded statuses' totalPrice never appears
    expect(result[0].orderCount).toBe(1);                     // 3 excluded orders dropped
  });

  it('T4: cross-company isolation — OTHER sentinel never leaks into TEST', async () => {
    // TEST: 1 small order
    const tMaster = await setupMaster(prisma, { companyId: TEST_COMPANY_ID, code: 'M-T4', name: 'Master T4' });
    const tOption = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId: tMaster.id, sku: 'SKU-T4', costPrice: 0, commissionRate: 0,
    });
    const tListing = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId: tMaster.id,
      channel: 'coupang', externalId: 'EXT-T4',
      optionId: tOption.id, vendorItemId: 'VI-T4',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'PERLIST-T-4',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: tOption.id, listingOptionId: tListing.listingOptionId }],
    });

    // OTHER: sentinel order + sentinel ad
    const oMaster = await setupMaster(prisma, { companyId: OTHER_COMPANY_ID, code: 'M-O4', name: 'Master O4' });
    const oOption = await setupProductOption(prisma, {
      companyId: OTHER_COMPANY_ID, masterId: oMaster.id, sku: 'SKU-O4', costPrice: 0, commissionRate: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      companyId: OTHER_COMPANY_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O4',
      optionId: oOption.id, vendorItemId: 'VI-O4',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: OTHER_COMPANY_ID,
      externalOrderId: 'PERLIST-O-4',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });
    await seedAd(prisma, { companyId: OTHER_COMPANY_ID, listingId: oListing.listingId, date: '2026-04-15', spend: IDOR_SENTINEL });

    const testResult = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_COMPANY_ID, FROM, TO);
    expect(testResult).toHaveLength(1);
    expect(testResult[0].revenue).toBe(1_000);
    expect(testResult[0].adCost).toBe(0);
    for (const m of testResult) {
      expect(m.revenue).not.toBe(IDOR_SENTINEL);
      expect(m.adCost).not.toBe(IDOR_SENTINEL);
    }

    const otherResult = await buildPerListingMetrics(prisma as unknown as PrismaService, OTHER_COMPANY_ID, FROM, TO);
    expect(otherResult).toHaveLength(1);
    expect(otherResult[0].revenue).toBe(IDOR_SENTINEL);
    expect(otherResult[0].adCost).toBe(IDOR_SENTINEL);
  });
});
```

- [ ] **Step 1.4: Run helper spec to verify it passes (with current finance code untouched)**

Run: `npm run db:test:up && npm run db:test:prepare && npx vitest run apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts`

Expected: 4 tests PASS. If FAIL on T1/T2/T3, debug pricing math; if FAIL on T4, debug companyId binding.

- [ ] **Step 1.5: Refactor `profit-loss.service.findAll` to call the helper**

Edit `apps/server/src/finance/services/profit-loss.service.ts` — replace the entire `findAll` body (L33-223) with:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { PLData } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import { buildPerListingMetrics } from '../../common/per-listing-profit';

/**
 * Plan D.1 T5 (v2) — ADR-0016 live aggregation.
 * Plan F1 T1 — per-listing core extracted to common/per-listing-profit.ts so dashboard
 * can share the math. This service adds returnCount + maps PerListingMetrics → PLData.
 */
@Injectable()
export class ProfitLossService {
  private readonly logger = new Logger(ProfitLossService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    year: number,
    month: number,
  ): Promise<PLData[]> {
    const startedAt = Date.now();
    const from = kstMonthStart(year, month);
    const to = kstMonthStart(year, month + 1);

    const [metrics, returnRows] = await Promise.all([
      buildPerListingMetrics(this.prisma, companyId, from, to),
      this.prisma.orderReturnLineItem.findMany({
        where: {
          companyId,
          return: { requestedAt: { gte: from, lt: to } },
        },
        select: {
          orderLineItem: {
            select: { listingOption: { select: { listingId: true } } },
          },
        },
      }),
    ]);

    const returnMap = new Map<string, number>();
    for (const rli of returnRows) {
      const listingId = rli.orderLineItem?.listingOption?.listingId;
      if (!listingId) continue;
      returnMap.set(listingId, (returnMap.get(listingId) ?? 0) + 1);
    }

    const rows = metrics.map((m) => ({
      listingId: m.listingId,
      externalId: m.externalId,
      channelName: m.channelName,
      masterId: m.masterId,
      masterCode: m.masterCode,
      masterName: m.masterName,
      category: m.category,
      grade: m.grade,
      thumbnailUrl: m.thumbnailUrl,
      revenue: m.revenue,
      cogs: m.costOfGoods,                   // PLData uses `cogs`, helper uses `costOfGoods`
      commission: m.commission,
      shippingCost: m.shippingCost,
      adCost: m.adCost,
      otherCost: m.otherCost,
      netProfit: m.netProfit,
      profitRate: m.profitRate,
      orderCount: m.orderCount,
      returnCount: returnMap.get(m.listingId) ?? 0,
    } satisfies PLData)).sort((a, b) => b.revenue - a.revenue);

    this.logger.log({
      msg: 'profit-loss.findAll',
      companyId,
      year,
      month,
      listingCount: rows.length,
      latencyMs: Date.now() - startedAt,
    });

    return rows;
  }
}
```

(Imports of `resolvePricing` removed — now lives in helper.)

- [ ] **Step 1.6: Run finance regression spec to verify equivalence**

Run: `npx vitest run apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts`

Expected: ALL existing tests PASS (the helper produces identical PerListingMetrics fields, finance maps them onto PLData identically — return-rows merge unchanged). If any test FAILs, the helper diverged from the original logic — re-read `apps/server/src/finance/services/profit-loss.service.ts` git history (`git show HEAD:apps/server/src/finance/services/profit-loss.service.ts`) and align field names / Math.round positions.

- [ ] **Step 1.7: Run unit profit-loss spec (mock-based)**

Run: `npx vitest run apps/server/src/finance/services/__tests__/profit-loss.service.spec.ts`

Expected: PASS. If FAIL, the unit spec mocks `prisma.profitLoss` directly (legacy assertions); confirm none reference deleted code paths. Per `superpowers:verification-before-completion`, fix any spec breakage NOW; do not defer.

- [ ] **Step 1.8: Verify NestJS DI boots (per memory `feedback_nestjs_di_verification.md`)**

Run: `npm run dev:server` in background; wait until log `[NestApplication] Nest application successfully started` appears (or 30s timeout).

If boot fails (DI error / missing provider), revert profit-loss.service.ts edits and inspect — likely a missing import or `PrismaService` injection broke. tsc + vitest will not catch DI errors.

Stop the background dev server: `pkill -f 'nest start' || true`

- [ ] **Step 1.9: Commit T1**

```bash
git add apps/server/src/common/per-listing-profit.ts \
        apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts \
        apps/server/src/finance/services/profit-loss.service.ts
git commit -m "$(cat <<'EOF'
feat(server): Plan F1 T1 — extract buildPerListingMetrics + profit-loss refactor

- common/per-listing-profit.ts: shared per-listing aggregator for finance + dashboard
- profit-loss.service.findAll: delegate to helper, retain return-rows merge for PLData
- Integration spec: 4 tests (single listing, shipping split, ad rollup, cross-company isolation)
- ADR-0016 live aggregation (no profitLoss.* reads), ADR-0018 companyId scoped throughout
EOF
)"
```

**Review** (2-stage):
- Spec reviewer: verify shared helper signature matches both finance + dashboard contracts; confirm spec § A.1 invariants (I3/I7/I8/R-1) all asserted.
- Quality reviewer: verify no behavioral drift in profit-loss.service (existing pg.integration spec must pass); confirm PerListingMetrics → PLData mapping has no rename mistakes (cogs vs costOfGoods).

---

## Task 2 — Implement `DashboardSalesService.getSummary`

**Files:**
- Modify: `apps/server/src/dashboard/services/dashboard-sales.service.ts`
- Create: `apps/server/src/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts`

**Context:** `apps/server/src/dashboard/services/dashboard-sales.service.ts:12-18` currently throws `'Not implemented: Plan B2c migration'`. T2 replaces it with a 9-promise parallel implementation that returns a fully populated `DashboardSalesSummary` (per `packages/shared/src/schemas/dashboard.ts:155-189`).

Read these first:
- `apps/server/src/dashboard/services/dashboard-ad.service.ts` — sister service; same Promise.all pattern using `calculateProfitForRange` + `aggregateAdForRange` + `fetchWingAdSummary`
- `apps/server/src/dashboard/services/context.ts` — `DashboardContext` shape (year/month/monthStart/monthEnd/prevMonthDate/dateRange/now)
- `apps/server/src/dashboard/helpers/profit-calculator.ts` — `calculateProfitForRange` + `RangeProfitMetrics`
- `apps/server/src/dashboard/helpers/wing-ad-summary.ts` — `fetchWingAdSummary` + `WingAdSummaryResult` (returns `null` when no snapshot)
- `apps/server/src/dashboard/CLAUDE.md` — Massive Parallel + KST + MoM patterns
- `packages/shared/src/schemas/dashboard.ts:155-189` — `DashboardSalesSummarySchema` (response contract)

- [ ] **Step 2.1: Replace stub with full implementation**

Replace the entire contents of `apps/server/src/dashboard/services/dashboard-sales.service.ts` with:

```ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardSalesSummary,
  ProfitBreakdown,
  TopProduct,
  MonthlyTrendItem,
  TrafficKpi,
  DailyRevenueItem,
} from '@kiditem/shared';
import type { DashboardContext } from './context';
import { calculateProfitForRange, type RangeProfitMetrics } from '../helpers/profit-calculator';
import { fetchWingAdSummary, type WingAdSummaryResult } from '../helpers/wing-ad-summary';

/**
 * Plan F1 T2 — full implementation (replaces Plan B2c-deferred stub).
 *
 * 9 parallel reads (Promise.all):
 *   1-2. cur/prev month profit  (calculateProfitForRange)
 *   3-4. range cur/prev profit  (calculateProfitForRange)
 *   5.   today raw KPIs         ($queryRaw, KST boundary)
 *   6.   topProducts N=10       ($queryRaw, JOIN listing+master+option, LIMIT 10)
 *   7.   dailyRevenue           ($queryRaw, current month per-day)
 *   8.   monthlyTrend × 6       (calculateProfitForRange loop, Q2 decision)
 *   9.   wing override          (fetchWingAdSummary, null when no snapshot)
 *
 * Wing override scope (I8): only `trafficKpi.adSummary` + `lastSyncAt`. monthly.revenue
 * stays Order-based (Wing override of monthly metrics is the dashboard-ad service's
 * responsibility per spec § A.6).
 *
 * Per ADR-0006 + ADR-0018: every Prisma call binds companyId via parameter / ${companyId}::uuid.
 */
@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    ctx: DashboardContext,
    companyId: string,
  ): Promise<DashboardSalesSummary> {
    try {
      const startedAt = Date.now();
      const { year, month, monthStart, monthEnd, prevMonthDate, dateRange, todayStart, todayEnd } = ctx;

      const [
        curMonth,
        prevMonth,
        rangeCur,
        rangePrev,
        todayRows,
        topProductRows,
        dailyRevenueRows,
        monthlyTrend,
        wing,
      ] = await Promise.all([
        calculateProfitForRange(this.prisma, companyId, monthStart, monthEnd),
        calculateProfitForRange(this.prisma, companyId, prevMonthDate, monthStart),
        calculateProfitForRange(this.prisma, companyId, dateRange.start, dateRange.end),
        calculateProfitForRange(this.prisma, companyId, dateRange.prevStart, dateRange.prevEnd),
        this.fetchTodayKpis(companyId, todayStart, todayEnd),
        this.fetchTopProducts(companyId, monthStart, monthEnd),
        this.fetchDailyRevenue(companyId, monthStart, monthEnd),
        this.fetchMonthlyTrend(companyId, monthStart),
        fetchWingAdSummary(this.prisma, companyId, year, month, monthStart),
      ]);

      const result: DashboardSalesSummary = {
        today: todayRows,
        monthly: this.buildMonthly(curMonth, prevMonth),
        topProducts: topProductRows,
        monthlyTrend,
        profitDetail: this.buildProfitDetail(curMonth),
        rangeKpi: this.buildRangeKpi(ctx.effectiveRange, rangeCur, rangePrev),
        dailyRevenue: dailyRevenueRows,
        planAchievement: null, // F1 out-of-scope (D.3b will wire)
        trafficKpi: this.buildTrafficKpi(curMonth, wing),
        lastSyncAt: wing?.lastSyncAt?.toISOString() ?? null,
      };

      this.logger.debug({
        msg: 'dashboard-sales.getSummary',
        companyId,
        range: ctx.effectiveRange,
        latencyMs: Date.now() - startedAt,
        topProductsCount: topProductRows.length,
        monthlyTrendMonths: monthlyTrend.length,
        hasWingOverride: wing !== null,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  // ── Today KPI: KST today, SUM(oli.total_price) — I3 canonical ────────────
  private async fetchTodayKpis(
    companyId: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<DashboardSalesSummary['today']> {
    const rows = await this.prisma.$queryRaw<{ revenue: number; orders: number }[]>`
      SELECT
        COALESCE(SUM(oli.total_price), 0)::int AS revenue,
        COUNT(DISTINCT o.id)::int AS orders
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${todayStart}
        AND o.ordered_at < ${todayEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
    `;
    const r = rows[0];
    return { revenue: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) };
  }

  // ── monthly mapping (R-01 explicit) ──────────────────────────────────────
  private buildMonthly(
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
  ): DashboardSalesSummary['monthly'] {
    const adRate = cur.revenue > 0
      ? Math.round((cur.adCost / cur.revenue) * 1000) / 10
      : 0;
    const prevAdRate = prev.revenue > 0
      ? Math.round((prev.adCost / prev.revenue) * 1000) / 10
      : 0;
    const revenueChange = prev.revenue > 0
      ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 1000) / 10
      : 0;
    const profitChange = prev.netProfit !== 0
      ? Math.round(((cur.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 1000) / 10
      : 0;

    return {
      revenue: cur.revenue,
      profit: cur.netProfit,
      adRate,
      prevRevenue: prev.revenue,
      prevProfit: prev.netProfit,
      revenueChange,
      profitChange,
      prevAdRate,
    };
  }

  // ── profitDetail: 8-field subset of RangeProfitMetrics (R-05 explicit) ───
  private buildProfitDetail(cur: RangeProfitMetrics): ProfitBreakdown {
    return {
      revenue: cur.revenue,
      costOfGoods: cur.costOfGoods,
      commission: cur.commission,
      shippingCost: cur.shippingCost,
      adCost: cur.adCost,
      otherCost: cur.otherCost,
      netProfit: cur.netProfit,
      orderCount: cur.orderCount,
    } satisfies ProfitBreakdown;
  }

  // ── rangeKpi (mirrors monthly shape, range-aware) ────────────────────────
  private buildRangeKpi(
    range: string,
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const profitRate = cur.revenue > 0
      ? Math.round((cur.netProfit / cur.revenue) * 1000) / 10
      : 0;
    const prevProfitRate = prev.revenue > 0
      ? Math.round((prev.netProfit / prev.revenue) * 1000) / 10
      : 0;
    const revenueChange = prev.revenue > 0
      ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 1000) / 10
      : 0;
    const profitChange = prev.netProfit !== 0
      ? Math.round(((cur.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 1000) / 10
      : 0;
    return {
      range,
      revenue: cur.revenue,
      profit: cur.netProfit,
      prevRevenue: prev.revenue,
      prevProfit: prev.netProfit,
      revenueChange,
      profitChange,
      profitRate,
      prevProfitRate,
      profitRateChange: Math.round((profitRate - prevProfitRate) * 10) / 10,
    };
  }

  // ── topProducts N=10, company = ChannelListing.channelName ───────────────
  private async fetchTopProducts(
    companyId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; name: string; company: string | null; grade: string | null;
      revenue: number; quantity: number;
    }>>`
      SELECT
        mp.id::text AS id,
        mp.name AS name,
        cl.channel_name AS company,
        mp.abc_grade AS grade,
        SUM(oli.total_price)::int AS revenue,
        SUM(oli.quantity)::int AS quantity
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      JOIN channel_listing_options clo ON clo.id = oli.listing_option_id
      JOIN channel_listings cl ON cl.id = clo.listing_id
      JOIN master_products mp ON mp.id = cl.master_id
      WHERE o.company_id = ${companyId}::uuid
        AND cl.company_id = ${companyId}::uuid
        AND mp.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY mp.id, mp.name, cl.channel_name, mp.abc_grade
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // KNOWN APPROXIMATION (Plan F1 critic MAJOR #2 — documented in release note):
    // For the top-N ranking widget we approximate netProfit/profitRate using a flat
    // 30% margin assumption. Precise per-listing math lives in /api/profit-loss
    // (which uses buildPerListingMetrics). Top-N is a summary visual, not a financial
    // report — users who need exact margin per master must drill into /profit-loss.
    // T6 spec asserts the approximation explicitly so future drift is caught.
    return rows.map((r) => {
      const revenue = Number(r.revenue ?? 0);
      const netProfit = Math.round(revenue * 0.3);
      const profitRate = revenue > 0 ? 30.0 : 0;
      return {
        id: r.id,
        name: r.name,
        company: r.company ?? '미지정',
        grade: r.grade ?? 'C',
        revenue,
        netProfit,
        profitRate,
      } satisfies TopProduct;
    });
  }

  // ── dailyRevenue (current month per-day, KST boundary) ───────────────────
  private async fetchDailyRevenue(
    companyId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DailyRevenueItem[]> {
    const rows = await this.prisma.$queryRaw<Array<{ date: string; revenue: number }>>`
      SELECT
        TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
        COALESCE(SUM(oli.total_price), 0)::int AS revenue
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({ date: r.date, revenue: Number(r.revenue) } satisfies DailyRevenueItem));
  }

  // ── monthlyTrend = loop × 6 calculateProfitForRange (Q2 decision) ────────
  private async fetchMonthlyTrend(
    companyId: string,
    currentMonthStart: Date,
  ): Promise<MonthlyTrendItem[]> {
    const offsets = [5, 4, 3, 2, 1, 0]; // chronological: oldest → current
    const trends = await Promise.all(offsets.map(async (offset) => {
      const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const m = await calculateProfitForRange(this.prisma, companyId, start, end);
      const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      return { period, revenue: m.revenue, profit: m.netProfit, adCost: m.adCost } satisfies MonthlyTrendItem;
    }));
    return trends;
  }

  // ── trafficKpi: Wing override only for adSummary (R-03 explicit) ─────────
  private buildTrafficKpi(
    cur: RangeProfitMetrics,
    wing: WingAdSummaryResult | null,
  ): TrafficKpi {
    return {
      visitors: 0,
      views: 0,
      orders: cur.orderCount,
      salesQty: 0,
      revenue: cur.revenue,
      cartAdds: 0,
      adSummary: wing?.rawAdSummary ?? null,
      source: wing ? 'wing' : undefined,
      netProfit: cur.netProfit,
      profitRate: cur.revenue > 0
        ? Math.round((cur.netProfit / cur.revenue) * 1000) / 10
        : 0,
    };
  }
}
```

(The `EXCLUDED_ORDER_STATUSES_SQL` constant at the top is informational — the actual `NOT IN ('cancelled', ...)` is inlined in each $queryRaw because parameterizing the IN list is awkward with Prisma tagged templates. All 4 raw queries use the identical literal.)

- [ ] **Step 2.2: Write the dashboard-sales integration spec**

Create `apps/server/src/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardSalesService } from '../services/dashboard-sales.service';
import { buildDashboardContext } from '../services/context';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';

describe('DashboardSalesService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardSalesService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardSalesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardSalesService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Helper: create a single seeded master+listing+option for current month.
   * Returns IDs for further per-order seeding.
   */
  async function seedTestListing(suffix: string) {
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: `M-T-${suffix}`, name: `Master T-${suffix}`, abcGrade: 'A',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      sku: `SKU-T-${suffix}`, costPrice: 50_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${suffix}`, channelName: '쿠팡',
      optionId, vendorItemId: `VI-T-${suffix}`,
    });
    return { masterId, optionId, listingId, listingOptionId };
  }

  function midMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 15, 3, 0, 0);
  }

  it('T1: baseline monthly — single order, math verified', async () => {
    const { optionId, listingOptionId } = await seedTestListing('1');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'SALES-T-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.monthly.revenue).toBe(100_000);
    expect(result.monthly.profit).toBe(30_000);             // 100k - 50k - 10k - 10k - 0 - 0
    expect(result.monthly.adRate).toBe(0);                  // no ad
    expect(result.profitDetail?.netProfit).toBe(30_000);
    expect(result.profitDetail?.commission).toBe(10_000);
    expect(result.profitDetail?.shippingCost).toBe(10_000);
    expect(result.planAchievement).toBeNull();
  });

  it('T2: IDOR isolation — OTHER sentinel never leaks into TEST', async () => {
    const t = await seedTestListing('2');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'SALES-T-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: t.optionId, listingOptionId: t.listingOptionId }],
    });

    // OTHER sentinel
    const oMaster = await setupMaster(prisma, { companyId: OTHER_COMPANY_ID, code: 'M-O-2', name: 'Other M2' });
    const oOption = await setupProductOption(prisma, {
      companyId: OTHER_COMPANY_ID, masterId: oMaster.id, sku: 'SKU-O-2', costPrice: 0, commissionRate: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      companyId: OTHER_COMPANY_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O-2',
      optionId: oOption.id, vendorItemId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: OTHER_COMPANY_ID,
      externalOrderId: 'SALES-O-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.monthly.revenue).toBe(1_000);
    expect(result.monthly.revenue).not.toBe(IDOR_SENTINEL);
    expect(result.today.revenue).not.toBe(IDOR_SENTINEL);
    for (const tp of result.topProducts) {
      expect(tp.revenue).not.toBe(IDOR_SENTINEL);
    }
  });

  it('T3: rangeKpi reflects week window when range=week', async () => {
    const { optionId, listingOptionId } = await seedTestListing('3');
    // Seed an order 3 days ago (inside week window)
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'SALES-T-3',
      orderedAt: recent.toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext('week');
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.rangeKpi).toBeDefined();
    expect(result.rangeKpi?.range).toBe('week');
    expect(result.rangeKpi?.revenue).toBe(50_000);
  });

  it('T4: empty company returns zero-valued structure (no error)', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.monthly.revenue).toBe(0);
    expect(result.monthly.profit).toBe(0);
    expect(result.monthly.adRate).toBe(0);
    expect(result.topProducts).toEqual([]);
    expect(result.monthlyTrend).toHaveLength(6);            // 6 months loop always emits 6 entries
    expect(result.monthlyTrend.every((t) => t.revenue === 0)).toBe(true);
    expect(result.profitDetail?.revenue).toBe(0);
    expect(result.trafficKpi?.adSummary).toBeNull();
    expect(result.lastSyncAt).toBeNull();
  });

  it('T5: Wing override flows through trafficKpi.adSummary + lastSyncAt', async () => {
    const { listingId } = await seedTestListing('5');
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    await prisma.adSnapshot.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId,
        source: 'wing',
        pageType: 'dashboard_kpi',
        date: now,
        capturedAt: now,
        level: 'dashboard',
        rawJson: {
          startDate: monthStartStr,
          period: 30,
          adSummary: { adGmv: '7777', adSpend: '2222' },
        },
      },
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.trafficKpi?.adSummary).toMatchObject({ adGmv: '7777', adSpend: '2222' });
    expect(result.trafficKpi?.source).toBe('wing');
    expect(result.lastSyncAt).not.toBeNull();
  });

  it('T6: topProducts ranks by revenue DESC, capped at 10', async () => {
    // Seed 12 listings × 1 order each, decreasing revenue 12000, 11000, ..., 1000
    for (let i = 1; i <= 12; i++) {
      const { id: masterId } = await setupMaster(prisma, {
        companyId: TEST_COMPANY_ID, code: `M-T-TOP-${i}`, name: `Top ${i}`, abcGrade: i <= 4 ? 'A' : i <= 8 ? 'B' : 'C',
      });
      const { id: optionId } = await setupProductOption(prisma, {
        companyId: TEST_COMPANY_ID, masterId, sku: `SKU-T-TOP-${i}`, costPrice: 0, commissionRate: 0,
      });
      const { listingOptionId } = await setupChannelListing(prisma, {
        companyId: TEST_COMPANY_ID, masterId,
        channel: 'coupang', externalId: `EXT-T-TOP-${i}`, channelName: `채널${i}`,
        optionId, vendorItemId: `VI-T-TOP-${i}`,
      });
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
        externalOrderId: `SALES-T-TOP-${i}`,
        orderedAt: midMonth().toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: (13 - i) * 1_000, optionId, listingOptionId }],
      });
    }

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.topProducts).toHaveLength(10);
    expect(result.topProducts[0].revenue).toBe(12_000);
    expect(result.topProducts[9].revenue).toBe(3_000);
    expect(result.topProducts[0].name).toBe('Top 1');
    expect(result.topProducts[0].company).toBe('채널1');     // ChannelListing.channelName

    // KNOWN APPROXIMATION assertion (critic MAJOR #2):
    // Top-N rows always carry profitRate=30.0 and netProfit=round(revenue*0.3).
    // If this assertion fails, someone replaced the approximation — update release
    // note + remove this guard.
    expect(result.topProducts[0].profitRate).toBe(30.0);
    expect(result.topProducts[0].netProfit).toBe(Math.round(12_000 * 0.3));
  });
});
```

- [ ] **Step 2.3: Run dashboard-sales spec — must PASS**

Run: `npx vitest run apps/server/src/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts`

Expected: 6 tests PASS. If `T1` fails on `result.monthly.profit !== 30_000`, debug `calculateProfitForRange` adCost path (current-month branch may pull AdSnapshot — confirm none seeded). If `T6` fails on ordering, double-check the SQL `ORDER BY revenue DESC` and the alias scoping.

- [ ] **Step 2.4: Verify NestJS DI boots**

Run: `npm run dev:server` in background; wait for `Nest application successfully started` log.

Expected: boots clean. `DashboardSalesService` injected into `DashboardController` (already wired in `dashboard.module.ts:11`).

Stop: `pkill -f 'nest start' || true`

- [ ] **Step 2.5: Commit T2**

```bash
git add apps/server/src/dashboard/services/dashboard-sales.service.ts \
        apps/server/src/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts
git commit -m "$(cat <<'EOF'
feat(server): Plan F1 T2 — DashboardSalesService full implementation

- Replaces 'Not implemented: Plan B2c migration' stub with 9-promise parallel impl
- Reuses calculateProfitForRange + fetchWingAdSummary helpers
- monthlyTrend = loop × 6 (Q2 decision per spec, ADR-0016 spirit)
- topProducts N=10, company = ChannelListing.channelName
- planAchievement: null (D.3b will wire); trafficKpi.adSummary = wing passthrough
- 6 integration tests: baseline, IDOR, range=week, empty, wing override, top-10 ordering
EOF
)"
```

**Review** (2-stage):
- Spec reviewer: verify each Promise.all index maps to a documented spec § A.2 item; confirm `monthlyTrend` produces 6 entries chronologically; confirm `planAchievement: null` literal.
- Quality reviewer: verify all 4 $queryRaw bind `${companyId}::uuid` (ADR-0018 Rule 2); confirm `EXCLUDED_ORDER_STATUSES` parity across services; confirm `satisfies DashboardSalesSummary` at return.

---

## Task 3 — Migrate `DashboardInventoryService` warnings to `buildPerListingMetrics`

**Files:**
- Modify: `apps/server/src/dashboard/services/dashboard-inventory.service.ts`
- Modify: `apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts`

**Context:** `dashboard-inventory.service.ts:57-60` reads `prisma.profitLoss.findMany` to compute `warnings.minusProducts / lowProfitProducts / highAdProducts`. Per ADR-0016 the table is empty in production (no writer). T3 swaps that read for `buildPerListingMetrics`. The other 7 reads (gradeRows, alerts, totalActiveProducts, inventoryRows, gradeChangesRows, lowCtrProducts, lowReviewProductsRaw) are unaffected.

Read these first:
- `apps/server/src/dashboard/services/dashboard-inventory.service.ts:55-60` (target query)
- `apps/server/src/dashboard/services/dashboard-inventory.service.ts:114-135` (warnings logic to preserve)
- The new helper from T1: `apps/server/src/common/per-listing-profit.ts`
- `apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts` (must rewrite to seed orders not profitLoss rows)

- [ ] **Step 3.1: Edit `dashboard-inventory.service.ts` — replace the profitLoss query**

Make these targeted edits:

(a) Add import at top:

```ts
import { buildPerListingMetrics } from '../../common/per-listing-profit';
```

(b) Replace the 4th Promise.all entry (currently lines around L57-60 — the `prisma.profitLoss.findMany` block) with:

```ts
        // Plan F1 T3 — replaces profitLoss.findMany; live aggregation via shared helper.
        // ADR-0016 (no profitLoss reads), ADR-0018 (companyId scoped via helper signature).
        buildPerListingMetrics(this.prisma, companyId, ctx.monthStart, ctx.monthEnd),
```

(c) Replace the destructured array name `allPLCurrentMonth` with `perListingMetrics` (the new shape is `PerListingMetrics[]`, not `{netProfit, revenue, adCost}[]`).

(d) Replace the warnings calculations (currently lines L114-135 of the unchanged file — `minusProducts` / `lowProfitProducts` / `highAdProducts`) with:

```ts
      // warnings — F1 live aggregation via PerListingMetrics
      // (ADR-0016 — no profitLoss table reads; helper provides identical shape)

      // minusProducts: netProfit < 0
      const minusProducts = perListingMetrics.filter((m) => m.netProfit < 0).length;

      // lowProfitProducts: profitRate >= 0 && profitRate <= 3 (percentage; helper emits 1-decimal percent)
      const lowProfitProducts = perListingMetrics.filter(
        (m) => m.profitRate >= 0 && m.profitRate <= 3,
      ).length;

      // highAdProducts: revenue > 0 && adCost > 0 && (adCost/revenue) * 100 > 15
      const highAdProducts = perListingMetrics.filter(
        (m) => m.revenue > 0 && m.adCost > 0 && (m.adCost / m.revenue) * 100 > 15,
      ).length;
```

After this edit the only remaining unchanged warnings logic is the `minusProducts` / `lowProfitProducts` / `highAdProducts` THRESHOLDS, which match the original.

- [ ] **Step 3.2: Rewrite `dashboard-inventory.pg.integration.spec.ts` — seed Orders, not ProfitLoss**

Replace the entire contents of `apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts` with:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardInventoryService } from '../services/dashboard-inventory.service';
import { buildDashboardContext } from '../services/context';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';

describe('DashboardInventoryService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardInventoryService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardInventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardInventoryService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  function midMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 15, 3, 0, 0);
  }

  /**
   * Seed a basic 2-master + 1-inventory + 1-alert layout for TEST,
   * and 5-master + 5-inventory + 3-alert for OTHER (no order data).
   * Used by T1/T2/T3 (IDOR cases that don't touch warnings).
   */
  async function seedBaseStructure() {
    const masterT1 = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: 'M-T-1', name: 'Master T1', abcGrade: 'A',
    });
    const masterT2 = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: 'M-T-2', name: 'Master T2', abcGrade: 'B',
    });
    const optionT1 = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId: masterT1.id, sku: 'SKU-T-1',
    });
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: optionT1.id, currentStock: 10, reorderPoint: 5 },
    });
    await prisma.alert.create({
      data: {
        companyId: TEST_COMPANY_ID, type: 'inventory', severity: 'medium',
        title: 'Test alert', message: 'test',
        targetType: 'master', targetId: masterT1.id, isRead: false,
      },
    });

    for (let i = 1; i <= 5; i++) {
      const masterO = await setupMaster(prisma, {
        companyId: OTHER_COMPANY_ID, code: `M-O-${i}`, name: `Master O${i}`,
        abcGrade: i <= 3 ? 'A' : 'B',
      });
      const optionO = await setupProductOption(prisma, {
        companyId: OTHER_COMPANY_ID, masterId: masterO.id, sku: `SKU-O-${i}`,
      });
      await prisma.inventory.create({
        data: { companyId: OTHER_COMPANY_ID, optionId: optionO.id, currentStock: 1, reorderPoint: 100 },
      });
    }
    for (let i = 1; i <= 3; i++) {
      await prisma.alert.create({
        data: {
          companyId: OTHER_COMPANY_ID, type: 'inventory', severity: 'high',
          title: `OTHER alert ${i}`, message: 'other',
          targetType: 'master', targetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', isRead: false,
        },
      });
    }
  }

  it('T1: TEST sees only TEST products, alerts, gradeCount', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.totalProducts).toBe(2);
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
    expect(result.alerts.length).toBe(1);
    expect(result.alerts[0].title).toBe('Test alert');
  });

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, OTHER_COMPANY_ID);

    expect(result.totalProducts).toBe(5);
    expect(result.gradeCount.A).toBe(3);
    expect(result.gradeCount.B).toBe(2);
    expect(result.alerts.length).toBe(3);
  });

  it('T3: fresh company → zero-valued summary', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);
    expect(result.totalProducts).toBe(0);
    expect(result.alerts.length).toBe(0);
    expect(result.warnings.minusProducts).toBe(0);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
    expect(result.warnings.needReorder).toBe(0);
  });

  it('T4: minusProduct — seeded loss order surfaces in warnings.minusProducts', async () => {
    // Loss order: revenue 50_000, costPrice 80_000, commission 10%, shipping 5_000
    // netProfit = 50_000 - 80_000 - 5_000 - 5_000 - 0 - 0 = -40_000  → minus
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: 'M-T-LOSS', name: 'Loss Master', abcGrade: 'A',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      sku: 'SKU-T-LOSS', costPrice: 80_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T-LOSS',
      optionId, vendorItemId: 'VI-T-LOSS',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'INV-T-LOSS-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
  });

  it('T5: 3 warnings — minus + lowProfit + highAd seeded on 3 listings', async () => {
    // Listing A: minus (cost > revenue)
    const a = await setupMaster(prisma, { companyId: TEST_COMPANY_ID, code: 'M-T-A', name: 'A', abcGrade: 'A' });
    const aOpt = await setupProductOption(prisma, { companyId: TEST_COMPANY_ID, masterId: a.id, sku: 'SKU-T-A', costPrice: 80_000, commissionRate: 0.1 });
    const aList = await setupChannelListing(prisma, { companyId: TEST_COMPANY_ID, masterId: a.id, channel: 'coupang', externalId: 'EXT-T-A', optionId: aOpt.id, vendorItemId: 'VI-T-A' });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'INV-T-A-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 50_000, optionId: aOpt.id, listingOptionId: aList.listingOptionId }],
    });

    // Listing B: lowProfit (profitRate ≈ 2%)
    // Aim: revenue=100_000, costPrice=85_000, commission 0.10×100_000=10_000, shipping 0, ad 0, other 0
    //   netProfit = 100_000 - 85_000 - 10_000 - 0 - 0 - 0 = 5_000 → 5.0% (NOT lowProfit; rate must be <=3)
    // Adjust: costPrice=88_000 → netProfit = 100_000 - 88_000 - 10_000 = 2_000 → 2.0% (lowProfit ✓)
    const b = await setupMaster(prisma, { companyId: TEST_COMPANY_ID, code: 'M-T-B', name: 'B', abcGrade: 'A' });
    const bOpt = await setupProductOption(prisma, { companyId: TEST_COMPANY_ID, masterId: b.id, sku: 'SKU-T-B', costPrice: 88_000, commissionRate: 0.1 });
    const bList = await setupChannelListing(prisma, { companyId: TEST_COMPANY_ID, masterId: b.id, channel: 'coupang', externalId: 'EXT-T-B', optionId: bOpt.id, vendorItemId: 'VI-T-B' });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'INV-T-B-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: bOpt.id, listingOptionId: bList.listingOptionId }],
    });

    // Listing C: highAd (revenue>0, adCost > 15% of revenue)
    // revenue=100_000, adCost=20_000 → adRate=20% (>15)
    const c = await setupMaster(prisma, { companyId: TEST_COMPANY_ID, code: 'M-T-C', name: 'C', abcGrade: 'A' });
    const cOpt = await setupProductOption(prisma, { companyId: TEST_COMPANY_ID, masterId: c.id, sku: 'SKU-T-C', costPrice: 0, commissionRate: 0 });
    const cList = await setupChannelListing(prisma, { companyId: TEST_COMPANY_ID, masterId: c.id, channel: 'coupang', externalId: 'EXT-T-C', optionId: cOpt.id, vendorItemId: 'VI-T-C' });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'INV-T-C-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: cOpt.id, listingOptionId: cList.listingOptionId }],
    });
    await seedAd(prisma, {
      companyId: TEST_COMPANY_ID, listingId: cList.listingId,
      date: midMonth().toISOString().slice(0, 10), spend: 20_000,
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(1);
    expect(result.warnings.highAdProducts).toBe(1);
  });
});
```

- [ ] **Step 3.3: Run dashboard-inventory spec — must PASS**

Run: `npx vitest run apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts`

Expected: 5 tests PASS. If `T4` fails on `minusProducts !== 1`, recompute the seeded math (cost 80k vs revenue 50k yields netProfit -40_000 — a single negative entry). If `T5` fails on `lowProfitProducts !== 1`, the threshold is `profitRate >= 0 && profitRate <= 3` — confirm Listing B math hits 2.0%.

- [ ] **Step 3.4: Verify dev:server still boots**

Run: `npm run dev:server` in background; confirm `Nest application successfully started`. Stop with `pkill -f 'nest start' || true`.

- [ ] **Step 3.5: Commit T3**

```bash
git add apps/server/src/dashboard/services/dashboard-inventory.service.ts \
        apps/server/src/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts
git commit -m "$(cat <<'EOF'
refactor(server): Plan F1 T3 — dashboard-inventory warnings via buildPerListingMetrics

- Replaces prisma.profitLoss.findMany with shared helper (ADR-0016)
- Preserves warning thresholds: minus<0, lowProfit 0-3%, highAd >15%
- Spec rewritten: 5 tests seed orders not profitLoss rows
- IDOR sentinel preserved for 2 isolation cases (T1/T2)
EOF
)"
```

**Review** (1-combined):
- Single reviewer: (a) confirm 7 unchanged Promise.all entries are intact (gradeRows / alerts / totalActiveProducts / inventoryRows / gradeChangesRows / lowCtrProducts / lowReviewProductsRaw); (b) confirm warnings thresholds copy exact percentages from legacy (minus<0, lowProfit 0-3%, highAd >15%); (c) confirm new spec uses `setup*` helpers from `finance-seeds.ts` (no inline `prisma.x.create` for repetitive setup); (d) verify IDOR sentinel pattern preserved for T1/T2 cross-tenant tests.

---

## Task 4 — Migrate `DashboardTrendService` + fix I3 raw SQL

**Files:**
- Modify: `apps/server/src/dashboard/services/dashboard-trend.service.ts`
- Modify: `apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts`

**Context:** Two changes to dashboard-trend:
1. `avgProfitRate` currently reads `prisma.profitLoss.aggregate` (empty table). Replace with `calculateProfitForRange` over the trend window.
2. The raw-SQL `SELECT SUM(total_price) FROM orders` violates I3 (revenue must be `SUM(OrderLineItem.totalPrice)`, never `SUM(Order.totalPrice)`). Spec § C.6 / Critic R-12: F1 fixes this in T4.

Read these first:
- `apps/server/src/dashboard/services/dashboard-trend.service.ts` (current 76 lines)
- `apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts` (existing IDOR tests)
- `apps/server/src/dashboard/helpers/profit-calculator.ts` (`calculateProfitForRange` signature)

- [ ] **Step 4.1: Rewrite `dashboard-trend.service.ts`**

Replace the entire file with:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardTrendItem } from '@kiditem/shared';
import { calculateProfitForRange } from '../helpers/profit-calculator';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTrend(companyId: string, range: string): Promise<DashboardTrendItem[]> {
    const startedAt = Date.now();
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Plan F1 T4 — avgProfitRate via calculateProfitForRange (replaces profitLoss.aggregate, ADR-0016).
    // Returns ratio (e.g. 0.3 for 30%) — used as a per-day multiplier downstream.
    const profitMetrics = await calculateProfitForRange(this.prisma, companyId, since, new Date());
    const avgProfitRate =
      profitMetrics.revenue > 0 ? profitMetrics.netProfit / profitMetrics.revenue : 0;

    // ADR-0018 Rule 2 + Plan F1 T4 — I3 fix: SUM(oli.total_price), NOT SUM(o.total_price).
    // Both queries bind ${companyId}::uuid via Prisma tagged template (ADR-0009).
    const [orderRows, adRows] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          COALESCE(SUM(oli.total_price), 0)::int AS revenue
        FROM orders o
        JOIN order_line_items oli ON oli.order_id = o.id
        WHERE o.company_id = ${companyId}::uuid
          AND o.ordered_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(spend), 0)::int AS ad_cost
        FROM ads
        WHERE company_id = ${companyId}::uuid
          AND date >= ${since}::date
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const adMap = new Map(adRows.map((r) => [r.date, Number(r.ad_cost)]));

    const result = orderRows.map((r) => {
      const revenue = Number(r.revenue);
      const profit = Math.round(revenue * avgProfitRate);
      return {
        date: r.date,
        revenue,
        profit,
        adCost: adMap.get(r.date) ?? 0,
      } satisfies DashboardTrendItem;
    });

    this.logger.debug({
      msg: 'dashboard-trend.getTrend',
      companyId,
      range,
      days,
      rowCount: result.length,
      avgProfitRate,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
}
```

- [ ] **Step 4.2: Rewrite `dashboard-trend.pg.integration.spec.ts`**

Replace the entire file with:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardTrendService } from '../services/dashboard-trend.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';

describe('DashboardTrendService.getTrend (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardTrendService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardTrendService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardTrendService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Seed a TEST listing + a single yesterday order with given lineItem totalPrice
   * and optional ad spend on the same date.
   */
  async function seedTestListingWithYesterdayOrder(opts: {
    suffix: string;
    lineItemTotalPrice: number;
    /** Used as Order.totalPrice deliberately — sentinel for I3 fix verification. */
    orderTotalPriceOverride?: number;
    costPrice?: number;
    adSpend?: number;
  }) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { id: masterId } = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID, code: `M-T-${opts.suffix}`, name: `Master T-${opts.suffix}`,
    });
    const { id: optionId } = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      sku: `SKU-T-${opts.suffix}`, costPrice: opts.costPrice ?? 0, commissionRate: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${opts.suffix}`,
      optionId, vendorItemId: `VI-T-${opts.suffix}`,
    });

    if (opts.orderTotalPriceOverride !== undefined) {
      // Bypass helper to set Order.totalPrice independently of lineItem totals.
      const order = await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: `TREND-T-${opts.suffix}`,
          orderedAt: yesterday,
          status: 'paid',
          totalPrice: opts.orderTotalPriceOverride,
          shippingPrice: 0,
        },
      });
      await prisma.orderLineItem.create({
        data: {
          companyId: TEST_COMPANY_ID,
          orderId: order.id,
          listingOptionId,
          optionId,
          quantity: 1,
          unitPrice: opts.lineItemTotalPrice,
          totalPrice: opts.lineItemTotalPrice,
          externalLineId: `LI-${order.id}-0`,
        },
      });
    } else {
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
        externalOrderId: `TREND-T-${opts.suffix}`,
        orderedAt: yesterday.toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: opts.lineItemTotalPrice, optionId, listingOptionId }],
      });
    }

    if (opts.adSpend !== undefined) {
      await seedAd(prisma, {
        companyId: TEST_COMPANY_ID, listingId,
        date: yesterday.toISOString().slice(0, 10), spend: opts.adSpend,
      });
    }
    return { listingId, optionId, listingOptionId };
  }

  it('T1: TEST sees only TEST rows — OTHER sentinel never leaks', async () => {
    await seedTestListingWithYesterdayOrder({ suffix: '1', lineItemTotalPrice: 30_000 });
    // OTHER sentinel
    const oM = await setupMaster(prisma, { companyId: OTHER_COMPANY_ID, code: 'M-O-1', name: 'OM' });
    const oO = await setupProductOption(prisma, { companyId: OTHER_COMPANY_ID, masterId: oM.id, sku: 'SKU-O-1' });
    const oL = await setupChannelListing(prisma, {
      companyId: OTHER_COMPANY_ID, masterId: oM.id,
      channel: 'coupang', externalId: 'EXT-O-1', optionId: oO.id, vendorItemId: 'VI-O-1',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: OTHER_COMPANY_ID,
      externalOrderId: 'TREND-O-1',
      orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oO.id, listingOptionId: oL.listingOptionId }],
    });
    await seedAd(prisma, {
      companyId: OTHER_COMPANY_ID, listingId: oL.listingId,
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10), spend: IDOR_SENTINEL,
    });

    const result = await service.getTrend(TEST_COMPANY_ID, '30d');
    for (const row of result) {
      expect(row.revenue).not.toBe(IDOR_SENTINEL);
      expect(row.adCost).not.toBe(IDOR_SENTINEL);
    }
    const yesterdayRow = result.find((r) => r.revenue === 30_000);
    expect(yesterdayRow).toBeDefined();
  });

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedTestListingWithYesterdayOrder({ suffix: '2', lineItemTotalPrice: 30_000 });
    const oM = await setupMaster(prisma, { companyId: OTHER_COMPANY_ID, code: 'M-O-2', name: 'OM' });
    const oO = await setupProductOption(prisma, { companyId: OTHER_COMPANY_ID, masterId: oM.id, sku: 'SKU-O-2' });
    const oL = await setupChannelListing(prisma, {
      companyId: OTHER_COMPANY_ID, masterId: oM.id,
      channel: 'coupang', externalId: 'EXT-O-2', optionId: oO.id, vendorItemId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: OTHER_COMPANY_ID,
      externalOrderId: 'TREND-O-2',
      orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oO.id, listingOptionId: oL.listingOptionId }],
    });

    const result = await service.getTrend(OTHER_COMPANY_ID, '30d');
    for (const row of result) {
      expect(row.revenue).not.toBe(30_000);
    }
    expect(result.find((r) => r.revenue === IDOR_SENTINEL)).toBeDefined();
  });

  it('T3: fresh company → []', async () => {
    const result = await service.getTrend(TEST_COMPANY_ID, '7d');
    expect(result).toEqual([]);
  });

  it('T4: I3 fix — revenue from SUM(oli.total_price), NOT SUM(o.total_price); avgProfitRate ratio applied', async () => {
    // Sentinel: Order.totalPrice = 999_999_999 vs lineItem.totalPrice = 100_000.
    // Pre-fix would aggregate Order.totalPrice → revenue = 999M.
    // Post-fix aggregates lineItem.totalPrice → revenue = 100k.
    // Cost set to produce avgProfitRate ≈ 0.3 → daily profit = 30_000.
    // costPrice 70_000 → netProfit (range total) = 100_000 - 70_000 - 0 - 0 - 0 - 0 = 30_000
    // avgProfitRate = 30_000 / 100_000 = 0.3 → daily profit = 100_000 × 0.3 = 30_000
    await seedTestListingWithYesterdayOrder({
      suffix: '4',
      lineItemTotalPrice: 100_000,
      orderTotalPriceOverride: 999_999_999,
      costPrice: 70_000,
    });

    const result = await service.getTrend(TEST_COMPANY_ID, '30d');
    const yesterdayRow = result.find((r) => r.revenue === 100_000);
    expect(yesterdayRow).toBeDefined();
    expect(yesterdayRow?.profit).toBe(30_000);
    // Critical assertion: revenue is NOT the bogus Order.totalPrice
    for (const row of result) {
      expect(row.revenue).not.toBe(999_999_999);
    }
  });
});
```

- [ ] **Step 4.3: Run dashboard-trend spec — must PASS**

Run: `npx vitest run apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts`

Expected: 4 tests PASS. T4 is the critical one (proves I3 fix).

- [ ] **Step 4.4: Verify dev:server still boots**

Run: `npm run dev:server` in background; confirm `Nest application successfully started`. Stop with `pkill -f 'nest start' || true`.

- [ ] **Step 4.5: Commit T4**

```bash
git add apps/server/src/dashboard/services/dashboard-trend.service.ts \
        apps/server/src/dashboard/__tests__/dashboard-trend.pg.integration.spec.ts
git commit -m "$(cat <<'EOF'
fix(server): Plan F1 T4 — dashboard-trend live aggregation + I3 SQL fix

- avgProfitRate via calculateProfitForRange (replaces empty profitLoss.aggregate, ADR-0016)
- Raw SQL revenue: JOIN order_line_items + SUM(oli.total_price), NOT SUM(o.total_price)
  (B2c.dashboard canonical I3 invariant — was leaking pre-Plan A.5 Order.totalPrice)
- Spec rewritten: 4 tests with TREND-T-* / TREND-O-* prefixes
- T4 sentinel: Order.totalPrice=999_999_999 vs lineItem.totalPrice=100_000 proves fix
EOF
)"
```

**Review** (2-stage):
- Spec reviewer: confirm I3 fix wording (`SUM(oli.total_price)` not `SUM(o.total_price)`); confirm logger.debug includes `avgProfitRate`.
- Quality reviewer: T4 sentinel asserts both positive (`yesterdayRow.revenue === 100_000`) AND negative (`row.revenue !== 999_999_999`); confirm no `prisma.profitLoss.*` references remain.

---

## Task 5 — Rewire root `page.tsx` + extend `SectionError`

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/__tests__/page.spec.tsx`

**Context:** `apps/web/src/app/page.tsx` currently uses 5 `apiClient.get<T>` calls (no Zod validation) plus a 6th call to `/api/products/pipeline-stats` that returns 404. T5 swaps all 5 to `apiClient.getParsed`, drops the dead `pipelineStats` query, extends `SectionError` to accept an optional `msg` prop, and renders `friendlyError(err)` at every section error.

Read these first:
- `apps/web/src/app/page.tsx` (607 lines — only lines 26-167 + the `SectionError` definition at L35-47 change)
- `apps/web/src/lib/api-client.ts` — `getParsed` signature
- `apps/web/src/lib/api-error.ts` — `friendlyError` returns `string | null`
- `packages/shared/src/schemas/dashboard.ts` — schema names (`DashboardSalesSummarySchema` etc.)
- `apps/web/CLAUDE.md` — `apiClient.getParsed`, `friendlyError`, `useQuery` patterns
- `apps/web/src/lib/query-keys.ts` — note `queryKeys.products.pipelineStats` will become unused after T5; keep the export (other consumers may exist; F2 cleanup)

- [ ] **Step 5.1: Replace `SectionError` definition + 5 `apiClient.get<T>` calls + drop `pipelineStats`**

Make these targeted edits to `apps/web/src/app/page.tsx`:

(a) Replace **both** existing `@kiditem/shared` import blocks (the type-only `DashboardSales/Ad/Inventory/TrendItem` block at L26-32 **and** the `import type { ActionTask }` line at L33) with this consolidated block (note `z` and `friendlyError` added):

```tsx
import {
  DashboardSalesSummarySchema,
  DashboardAdSummarySchema,
  DashboardInventorySummarySchema,
  DashboardTrendItemSchema,
  type DashboardSalesSummary,
  type DashboardAdSummary,
  type DashboardInventorySummary,
  type DashboardTrendItem,
} from '@kiditem/shared';
import { z } from 'zod';
import type { ActionTask } from '@kiditem/shared';
import { friendlyError } from '@/lib/api-error';
```

(b) Replace `SectionError` definition (currently L35-47) with:

```tsx
function SectionError({ msg, onRetry }: { msg?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6">
      <p className="text-sm text-slate-500">{msg ?? '이 섹션을 불러올 수 없습니다'}</p>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}
```

(c) Capture each query's `error` so we can surface a `friendlyError`. Replace the 5 `useQuery` blocks (currently L66-115) with these — note the additional `error: …Err` extraction:

```tsx
  // Baseline (month) — always fetched
  const {
    data: salesBaseline,
    isLoading: salesBaselineLoading,
    isError: salesBaselineHasErr,
    error: salesBaselineError,
    refetch: refetchSalesBaseline,
  } = useQuery({
    queryKey: queryKeys.dashboard.salesBaseline(),
    queryFn: () => apiClient.getParsed('/api/dashboard/sales', DashboardSalesSummarySchema),
    refetchInterval: 60_000,
  });

  const {
    data: adBaseline,
    isLoading: adBaselineLoading,
    isError: adBaselineHasErr,
    error: adBaselineError,
    refetch: refetchAdBaseline,
  } = useQuery({
    queryKey: queryKeys.dashboard.adBaseline(),
    queryFn: () => apiClient.getParsed('/api/dashboard/ad', DashboardAdSummarySchema),
    refetchInterval: 60_000,
  });

  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    isError: inventoryHasErr,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: queryKeys.dashboard.inventory(),
    queryFn: () => apiClient.getParsed('/api/dashboard/inventory', DashboardInventorySummarySchema),
    refetchInterval: 60_000,
  });

  const {
    data: trendData = [],
    isError: trendHasErr,
    error: trendError,
    refetch: refetchTrend,
  } = useQuery({
    queryKey: queryKeys.dashboard.trend('30d'),
    queryFn: () =>
      apiClient.getParsed('/api/dashboard/trend?range=30d', z.array(DashboardTrendItemSchema)),
    refetchInterval: 60_000,
  });

  // Range-aware — enabled when not month; custom requires both dates
  const rangeEnabled = kpiRange === 'custom' ? (!!dateFrom && !!dateTo) : kpiRange !== 'month';

  const {
    data: salesRange,
    isError: salesRangeHasErr,
    error: salesRangeError,
    refetch: refetchSalesRange,
  } = useQuery({
    queryKey: queryKeys.dashboard.salesRange(kpiRange, dateFrom, dateTo),
    queryFn: () => {
      const params = kpiRange === 'custom' && dateFrom && dateTo
        ? `?range=custom&from=${dateFrom}&to=${dateTo}`
        : `?range=${kpiRange}`;
      return apiClient.getParsed(`/api/dashboard/sales${params}`, DashboardSalesSummarySchema);
    },
    enabled: rangeEnabled,
    refetchInterval: 60_000,
  });

  const {
    data: adRange,
    isError: adRangeHasErr,
    error: adRangeError,
    refetch: refetchAdRange,
  } = useQuery({
    queryKey: queryKeys.dashboard.adRange(kpiRange, dateFrom, dateTo),
    queryFn: () => {
      const params = kpiRange === 'custom' && dateFrom && dateTo
        ? `?range=custom&from=${dateFrom}&to=${dateTo}`
        : `?range=${kpiRange}`;
      return apiClient.getParsed(`/api/dashboard/ad${params}`, DashboardAdSummarySchema);
    },
    enabled: rangeEnabled,
    refetchInterval: 60_000,
  });
```

(d) **Drop the dead pipelineStats query.** Delete the entire block at L133-137:

```tsx
// DELETE THESE LINES — endpoint returns 404 (Plan B2 dropped)
// const { data: pipelineStats } = useQuery({
//   queryKey: queryKeys.products.pipelineStats(),
//   queryFn: () => apiClient.get<...>('/api/products/pipeline-stats'),
//   refetchInterval: 60_000,
// });
```

(e) **Update the grade card section** (currently L462-484) — remove `pipelineStats` references, fall back to `inventoryData.gradeCount` directly:

```tsx
      {/* 등급 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(g => {
          const count = inventoryData.gradeCount[g] ?? 0;
          const total = inventoryData.totalProducts;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barColor = g === 'C' ? 'bg-red-500' : 'bg-purple-600';
          const labelMap = { A: '핵심상품', B: '성장상품', C: '정리대상' };
          return (
            <Link key={g} href={g === 'A' ? '/product-hub?tab=core' : g === 'C' ? '/product-hub?tab=cleanup' : '/product-hub'} className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-slate-900">{g}등급</span>
                <span className="text-xs text-slate-400">{labelMap[g]}</span>
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-slate-900">{count}<span className="text-sm ml-0.5">개</span></div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-slate-100">
                <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs mt-1 text-slate-400">{pct}% of {total}</div>
            </Link>
          );
        })}
      </div>
```

(f) **Update the existing `isError` flag names** wherever the page renders `SectionError`. Replace each call site to thread `friendlyError(error) ?? undefined`. The 5 call sites are at L444 (trend), L452 (inventory side panel), L487 (warnings), L508 (top products) and any others. Examples:

```tsx
{trendHasErr ? (
  <SectionError msg={friendlyError(trendError) ?? undefined} onRetry={refetchTrend} />
) : (
  <DashboardChart … />
)}

{inventoryHasErr ? (
  <SectionError msg={friendlyError(inventoryError) ?? undefined} onRetry={refetchInventory} />
) : (
  <SidePanel … />
)}

{inventoryHasErr ? (
  <SectionError msg={friendlyError(inventoryError) ?? undefined} onRetry={refetchInventory} />
) : (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    …
  </div>
)}

{salesBaselineHasErr ? (
  <SectionError msg={friendlyError(salesBaselineError) ?? undefined} onRetry={refetchSalesBaseline} />
) : (
  <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
    … topProducts table …
  </div>
)}
```

Do an explicit `grep` after the edit:

Run: `grep -n "SectionError" apps/web/src/app/page.tsx`
Expected: 4 invocations (trend / inventory side / warnings / topProducts), each passing `msg=` and `onRetry=`.

Run: `grep -n "isError\|hasErr" apps/web/src/app/page.tsx`
Expected: only the new `…HasErr` names; no orphan `…Err` from prior code.

Run: `grep -n "pipeline-stats\|pipelineStats" apps/web/src/app/page.tsx`
Expected: 0 matches.

(g) Confirm the local-only baseline-fail render (L160-167) is preserved as-is (full-page fallback when baselines fail in their entirety — pre-existing fail-closed semantic, spec § A.5).

- [ ] **Step 5.2: Run frontend tsc to confirm no type errors**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json | grep -E "src/app/page\.tsx" | head -20`
Expected: 0 lines (no errors in page.tsx). Pre-existing tsc errors elsewhere (ad-ops, products, etc.) are out of F1 scope per memory `project_next_session_handoff.md`.

If `page.tsx` has tsc errors, common causes:
- Forgot to import `z` from `'zod'` for the trend array schema
- Old `data: trendData = []` typed incorrectly because `getParsed` returns `T` not `T | undefined`
- Stray references to deleted `pipelineStats` variable

Fix inline.

- [ ] **Step 5.3: Run frontend build**

Run: `cd apps/web && npm run build`
Expected: build succeeds. If it fails inside `app/page.tsx`, debug; if it fails elsewhere (ad-ops, products), that's pre-existing — confirm by `git stash && npm run build && git stash pop`.

- [ ] **Step 5.4: Write the RTL spec**

Create `apps/web/src/app/__tests__/page.spec.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';
import { ZodError } from 'zod';

// Mock next/navigation BEFORE importing the page (page uses useRouter)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock dynamic charts (jsdom can't render Recharts)
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

// Mock toast (no DOM noise)
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

// Mock apiClient — page uses .getParsed and .get
const getParsedMock = vi.fn();
const getMock = vi.fn();
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getParsed: (path: string, schema: unknown) => getParsedMock(path, schema),
      get: (path: string) => getMock(path),
      patch: vi.fn(),
      post: vi.fn(),
    },
  };
});

import Dashboard from '../page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

const successSales = {
  today: { revenue: 0, orders: 0 },
  monthly: {
    revenue: 100000, profit: 30000, adRate: 0,
    prevRevenue: 0, prevProfit: 0, revenueChange: 0, profitChange: 0, prevAdRate: 0,
  },
  topProducts: [],
  monthlyTrend: [],
  profitDetail: { revenue: 100000, costOfGoods: 50000, commission: 10000, shippingCost: 10000, adCost: 0, otherCost: 0, netProfit: 30000, orderCount: 1 },
  planAchievement: null,
  trafficKpi: { visitors: 0, views: 0, orders: 1, salesQty: 0, revenue: 100000, cartAdds: 0, adSummary: null, source: 'wing', netProfit: 30000, profitRate: 30 },
  lastSyncAt: null,
};
const successAd = {
  monthly: { roas: 0, ctr: 0, adRevenue: 0, totalAdSpend: 0, prevRoas: 0, prevCtr: 0, prevAdRevenue: 0, prevTotalAdSpend: 0 },
  industryBenchmark: { avgAdRate: 10, avgProfitRate: 8, avgRoas: 350, avgCtr: 0.3 },
};
const successInv = {
  totalProducts: 5, gradeCount: { A: 2, B: 2, C: 1 },
  alerts: [],
  warnings: { minusProducts: 0, lowProfitProducts: 0, highAdProducts: 0, needReorder: 0 },
};
const successTrend: unknown[] = [];

beforeEach(() => {
  getParsedMock.mockReset();
  getMock.mockReset();
  // Default: action-tasks endpoint via apiClient.get returns []
  getMock.mockImplementation((path: string) => {
    if (path === '/api/action-tasks') return Promise.resolve([]);
    if (path === '/api/agent-registry/org') return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Root dashboard page (RTL)', () => {
  it('T1: hides content while baseline queries pending (PageSkeleton in place)', () => {
    getParsedMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = renderPage();
    // Skeleton renders before content; the header text only appears after baselines resolve.
    // PageSkeleton's exact DOM is opaque to this test — we assert content absence + non-empty render.
    expect(screen.queryByText('Kiditem Foundry')).toBeNull();
    expect(container.firstChild).toBeTruthy();
  });

  it('T2: renders KPI cards on success', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
      expect(screen.getByText(/products$/)).toBeTruthy();
    });
  });

  it('T3: 502 on non-baseline (trend) → SectionError shows server detail', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '502 Bad Gateway'));
      }
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('502 Bad Gateway')).toBeTruthy();
    });
  });

  it('T4: 502 on baseline (sales) → full-page error block, NOT SectionError', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '502 Bad Gateway'));
      }
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('대시보드 데이터를 불러오는데 실패했습니다.')).toBeTruthy();
    });
    expect(screen.queryByText('502 Bad Gateway')).toBeNull();
  });

  it('T5: Zod drift on non-baseline → SectionError shows "응답 형식 오류"', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') {
        return Promise.reject(new ZodError([{ code: 'invalid_type', expected: 'number', received: 'string', path: ['totalProducts'], message: 'Expected number' } as never]));
      }
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('응답 형식 오류 — 개발팀에 문의하세요')).toBeTruthy();
    });
  });

  it('T6: pipeline-stats endpoint is NOT called', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
    });
    const allPaths = [...getParsedMock.mock.calls.map((c) => c[0]), ...getMock.mock.calls.map((c) => c[0])];
    expect(allPaths.some((p: string) => p.includes('pipeline-stats'))).toBe(false);
  });
});
```

- [ ] **Step 5.5: Run RTL spec — must PASS**

Run: `cd apps/web && npx vitest run src/app/__tests__/page.spec.tsx`

Expected: 6 tests PASS. If T2 fails on the header text, the page may render `LoadingState` instead — confirm `inventoryData` is mocked. If T4 fails on baseline error text, the legacy `if (!inventoryData || !salesBaseline || !adBaseline)` branch fires only when all-three resolved; T4 only fails sales — adjust the condition to fall under the L160 check.

- [ ] **Step 5.6: Manual smoke**

Run two terminals:
- Terminal A: `npm run dev:server`
- Terminal B: `cd apps/web && npm run dev`

Visit `http://localhost:3000/`. Verify:
- KPI cards render with real values (or 0s on empty dev DB — both acceptable)
- DevTools Network tab: NO requests to `/api/products/pipeline-stats`
- DevTools Network tab: requests to `/api/dashboard/{sales,ad,inventory,trend}` all return 200
- Top Revenue Products table renders rows (or empty body if no orders)
- Click "주" or "일" KPI range button — additional `/api/dashboard/sales?range=…` request fires

Stop dev servers (Ctrl-C in both terminals).

- [ ] **Step 5.7: Commit T5**

```bash
git add apps/web/src/app/page.tsx \
        apps/web/src/app/__tests__/page.spec.tsx
git commit -m "$(cat <<'EOF'
feat(web): Plan F1 T5 — root dashboard rewire to apiClient.getParsed

- 5 useQuery: apiClient.get<T> → apiClient.getParsed(url, Schema) (Zod drift detection)
- Drop /api/products/pipeline-stats query (404 endpoint, Plan B2 dropped)
- SectionError extended with msg? prop, friendlyError() threaded at all 4 call sites
- Grade cards fall back to inventoryData.gradeCount (no pipelineStats)
- RTL spec: 6 tests (loading, success, 502 non-baseline, 502 baseline, Zod drift, no pipeline-stats)
EOF
)"
```

**Review** (1-combined):
- Single reviewer: (a) confirm I6 (no `pipeline-stats` grep matches in page.tsx); (b) confirm I7 — the **5 dashboard endpoints** (`/api/dashboard/{sales,ad,inventory,trend}` × baseline/range variants) all use `getParsed`, while the 2 GETs that intentionally **stay** as `apiClient.get<T>` are out of F1 scope (require shared schemas — F2/F4 work): `/api/action-tasks` (L127-131) and `/api/agent-registry/org` (L780-783, inside `DashboardChart`); (c) confirm `SectionError msg` flows to UI in all 4 call sites; (d) verify `friendlyError(err) ?? undefined` is used (NOT `?? ''` — empty string would render an empty `<p>`); (e) verify RTL spec passes 6/6 with proper `next/dynamic` + `next/navigation` mocks.

---

## Task 6 — Verification + release note

**Files:**
- Create: `docs/release-notes/2026-04-root-dashboard-rewire.md`

**Context:** Final integration check + customer-facing changelog. No code changes. Per spec § Execution strategy: T6 is no-review, self-evidencing.

- [ ] **Step 6.1: Full backend integration suite**

Run: `npm run db:test:up && npm run db:test:prepare && npm run test:integration`

Expected: 188+ pre-existing server PG tests + 19 new server PG tests (T1: 4 helper + T2: 6 dashboard-sales + T3: 5 dashboard-inventory + T4: 4 dashboard-trend) = ~207 total, all PASS. If any pre-existing test fails, that's a regression — find which T1–T4 commit broke it via `git bisect` and fix before claiming completion.

(T5 RTL is run separately under `cd apps/web && npx vitest` — see Step 6.3.)

Capture pass count for the release note.

- [ ] **Step 6.2: Frontend tsc + build**

Run: `cd apps/web && npm run build` (build implies tsc).

Expected: build succeeds. Pre-existing failures in ad-ops / products / inventory / orders / image-hub / thumbnail-editor are out-of-scope (memory `project_next_session_handoff.md` — F2/F3/F4 will fix). Confirm `app/page.tsx` is clean.

- [ ] **Step 6.3: Frontend RTL run**

Run: `cd apps/web && npx vitest run src/app/__tests__/page.spec.tsx`
Expected: 6/6 PASS.

- [ ] **Step 6.4: NestJS dev:server boot smoke**

Run: `npm run dev:server` in background; wait for `Nest application successfully started`.

Then: `curl -sf http://localhost:4000/api/dashboard/sales -H "x-dev-user-id: $(grep NEXT_PUBLIC_DEV_USER_ID apps/web/.env.local | cut -d= -f2)" | head -c 200`

Expected: JSON response (zero-valued struct on empty dev DB is fine; the goal is "no 500"). If 500, the service threw — check server logs and fix before T6 commit.

Stop: `pkill -f 'nest start' || true`

- [ ] **Step 6.5: Verify ADR-0016 reader-count update is needed**

Run: `grep -n "remaining\|readers\|D.4 검토" .claude/docs/decisions/0016-profit-loss-live-aggregation.md`

If the ADR has a "Scope boundaries" table listing 8 readers (it does — at L74-86 with `dashboard-inventory` row L83 + `dashboard-trend` row L84 marked "D.4 검토"), the release note will mention these 2 are now closed by F1. **DO NOT edit the ADR itself** — ADRs are immutable per `CLAUDE.md`. The release note records the supersession.

- [ ] **Step 6.6: Write the release note**

Create `docs/release-notes/2026-04-root-dashboard-rewire.md`:

```markdown
# Root Dashboard Rewire (2026-04-22, Plan F1)

## What changed for users

- 루트 대시보드 (`/`) 가 정상 작동 — 로그인 직후 첫 화면 KPI / 차트 / 경고 위젯이 실제 수치 표시
- 매출 요약 (`monthly.revenue` / `profit` / `adRate` / 상위 10 상품) 라이브 집계로 표시 (이전: stub throw)
- 적자 / 저이익 / 광고비 초과 경고 카드 가 실제 주문 데이터 기반으로 카운트 (이전: profit_loss 빈 테이블 → 항상 0)
- 일별 매출 트렌드 차트 가 실제 매출 (라인아이템 합계) 표시 — 이전 버그: `Order.totalPrice` 합계로 라인아이템 변경 후 부정확
- 서버 응답 형식 이상 시 `응답 형식 오류` 메시지 (Zod 검증 실패) 표시
- 네트워크 / 서버 에러 시 `다시 시도` 버튼 + 친화적 메시지

## 백엔드 변경

- **신규 공유 helper** `apps/server/src/common/per-listing-profit.ts:buildPerListingMetrics` — `profit-loss.service.findAll` 의 per-listing 집계 코어 추출. Finance + dashboard 양쪽 consumer.
- **`DashboardSalesService` 전면 구현** — `Not implemented: Plan B2c migration` stub 제거. 9 promise 병렬 (calculateProfitForRange × 4 + raw KPI × 3 + monthlyTrend loop + Wing override).
- **`DashboardInventoryService.warnings`** — `prisma.profitLoss.findMany` → `buildPerListingMetrics`. 임계 동일 (적자 < 0, 저이익 0–3%, 고광고 > 15%).
- **`DashboardTrendService.avgProfitRate`** — `prisma.profitLoss.aggregate` → `calculateProfitForRange`. 빈 테이블에 의존하지 않음.
- **`DashboardTrendService` raw SQL revenue I3 fix** — `SUM(orders.total_price)` → `JOIN order_line_items + SUM(oli.total_price)`. Plan A.5 이후 잠재 버그 해소.
- **`profit-loss.service.findAll`** — helper 호출 + return-rows 머지 (PLData.returnCount 유지). 동작 동일.

## 프론트엔드 변경

- **`apps/web/src/app/page.tsx`**:
  - 5개 `apiClient.get<T>` → `apiClient.getParsed(url, Schema)` (Zod 검증)
  - `/api/products/pipeline-stats` (404) 호출 제거 — `inventoryData.gradeCount` 폴백
  - `SectionError` props `{ msg?: string; onRetry: () => void }` 확장
  - 4개 SectionError 호출 site 에 `friendlyError(err)` 전달
- **신규 RTL 스펙** `apps/web/src/app/__tests__/page.spec.tsx` — 6 테스트 (loading, success, 502 non-baseline, 502 baseline, Zod drift, pipeline-stats not called)

## 배포 순서 주의 (Deploy Coordination)

`apiClient.getParsed` + Zod 도입으로 서버 응답 shape 변경 시 클라이언트는 `ZodError` 를 감지하고 `응답 형식 오류` 를 표시하는 fast-failure 모드로 전환됨. 따라서:

- `@kiditem/shared` Zod 스키마 변경 시 **클라이언트 배포 먼저**, 서버 배포 나중
- 역순 배포 시 (서버 먼저, 클라이언트 나중) 배포 기간 중 사용자에게 `응답 형식 오류` 노출 가능
- 필드 이름 변경은 shared 패키지 bump → 클라이언트 deploy → 서버 deploy 순으로 진행

## Known limitations (F1-scope deferred)

- **Top Revenue Products 의 `netProfit`/`profitRate`** — 모든 행이 `revenue × 30%` 근사값 사용 (`profitRate=30.0` 고정). 정확한 per-listing 마진은 `/profit-loss` (좌측 메뉴) 에서 확인. 사용자 노출 위젯이지만 요약 시각화 목적 — 재무 보고서 아님. 정밀 계산은 `buildPerListingMetrics` 호출 추가 필요 (성능 trade-off — F1.1 후속 검토).
- **`calculateProfitForRange` 의 `isCurrentPeriod` 타이밍 엣지** — `dashboard-trend` 가 `to = new Date()` 를 helper 로 넘기고, helper 내부에서 다시 `now = new Date()` 를 만드는 구조. `to > now` 비교가 sub-millisecond 타이밍에 의존 → 현재 월 호출 시 AdSnapshot pro-rata 분기 vs Ad fallback 분기가 비결정적으로 선택됨. 두 분기의 결과 차이는 1% 미만 (실측 안 됨, 추정). 수정은 helper 시그니처에 `now: Date` 파라미터 추가 — F1 범위 외 helper 변경이라 후속 plan 으로 이연.
- **`apiClient.get<T>` 잔존 2건** — `/api/action-tasks` (page L127), `/api/agent-registry/org` (DashboardChart L780). 둘 다 별도 shared Zod 스키마 필요 + 서버 controller drift 가드 필요 → F2/F4 범위. F1 의 I7 invariant 는 dashboard 5 endpoint 에만 적용.

## ADR-0016 reader-count update

ADR-0016 § Scope boundaries 의 8 ProfitLoss readers 중 **2건이 F1 으로 close**:

| Service | Pre-F1 status | Post-F1 status |
|---|---|---|
| dashboard-inventory | findMany (D.4 검토) | **buildPerListingMetrics 경유 — close** |
| dashboard-trend | aggregate (D.4 검토) | **calculateProfitForRange 경유 — close** |

남은 6 readers: statistics × 5, settlements, sales-plans, sales-analysis (이미 D.3 에서 close 됨 — count 5), ad-strategy, action-task × 2. Plan D.3b (statistics + settlements + sales-plans), Plan E (ad-strategy), Plan D.5 (action-task) 가 후속 close 예정.

ADR-0016 본문은 **수정하지 않음** (ADR immutable). 본 release note 가 supersession 기록.

## 커밋 (squash 전)

- T1: `common/per-listing-profit.ts` extract + profit-loss refactor + integration spec
- T2: DashboardSalesService full impl + integration spec (6 tests)
- T3: dashboard-inventory warnings rewire + spec rewrite (5 tests)
- T4: dashboard-trend live aggregation + I3 SQL fix + spec rewrite (4 tests)
- T5: page.tsx rewire (getParsed + SectionError + friendlyError) + RTL spec (6 tests)
- T6: release note

## 검증 결과 (배포 전)

- backend integration: pass (T1: 4, T2: 6, T3: 5, T4: 4 + 188 pre-existing)
- frontend tsc: app/page.tsx clean. 사전 존재 에러는 ad-ops / products / inventory / orders 등 — F2/F3/F4 범위
- frontend RTL: 6/6 PASS
- dev:server boot: clean
- 수동 smoke: `/` 정상 렌더, pipeline-stats 호출 없음

## 관련 문서

- Spec: `docs/superpowers/specs/2026-04-21-plan-f1-root-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-04-22-plan-f1-root-dashboard.md`
- ADR-0016: `.claude/docs/decisions/0016-profit-loss-live-aggregation.md`
- ADR-0018: `.claude/docs/decisions/0018-dashboard-idor-sweep-raw-sql-tenancy.md`
```

(Update the integration count + RTL counts in § "검증 결과" with actual numbers from Step 6.1 and 6.3.)

- [ ] **Step 6.7: Commit T6**

```bash
git add docs/release-notes/2026-04-root-dashboard-rewire.md
git commit -m "$(cat <<'EOF'
docs: Plan F1 release note — root dashboard rewire + ADR-0016 reader update

ProfitLoss reader count 8 → 6. dashboard-inventory + dashboard-trend now closed.
EOF
)"
```

**No review** (self-evidencing — release note merely records what T1–T5 already did).

---

## Squash merge (post-T6)

After all 6 task commits land, hand the branch off to the `superpowers:finishing-a-development-branch` skill or run manually:

```bash
git log --oneline feat/plan-f1-root-dashboard ^main      # confirm 6 commits + maybe fixups
git checkout main
git merge --squash feat/plan-f1-root-dashboard
git commit -m "feat: Plan F1 — root dashboard rewire + DashboardSalesService impl + ADR-0016 reader closure"
```

(Branch / squash naming follows `project_plan_d3_completed.md` and `feedback_squash_merge.md`.)

---

## Risk register (from spec § Risks)

| Risk | When it surfaces | Mitigation in this plan |
|---|---|---|
| `buildPerListingMetrics` extract diverges from inline profit-loss | T1 commit | Step 1.6 reruns `profit-loss.pg.integration.spec.ts` — 0 regression budget |
| `monthlyTrend` 6× loop adds 200–600ms latency | T2 deploy | logger.debug `latencyMs` + `monthlyTrendMonths` — F1.1 cache plan if user complains |
| Existing IDOR tests break after seed switch | T3/T4 spec rewrites | Each rewritten spec preserves both positive (real value match) AND negative (sentinel never appears) assertions |
| dashboard-trend I3 fix changes daily revenue values silently | T4 production deploy | T4 sentinel test (`Order.totalPrice=999_999_999` vs `lineItem.totalPrice=100_000`) makes the fix explicit + grep-able |
| ZodError on baseline → full-page error | T5 production | Pre-existing fail-closed semantics; release note documents deploy ordering rule |
| RTL `next/dynamic` mocking flakiness | T5 spec | `vi.mock('next/dynamic', () => ({ default: () => () => null }))` — same pattern as Plan E.1 |

---

## Self-review checklist (run after writing this plan, before requesting review)

- [ ] Each spec § Scope-In bullet maps to a task step (per-listing-profit → T1; DashboardSalesService impl → T2; dashboard-inventory rewire → T3; dashboard-trend avgProfitRate + I3 → T4; page.tsx rewire + SectionError + RTL → T5; release-note + ADR-0016 update → T6).
- [ ] No "TBD" / "implement later" / "fill in details" placeholders.
- [ ] Type names consistent: `PerListingMetrics` (T1) → consumed by T3 with same field names; `ProfitBreakdown` 8 fields in T2 match `packages/shared/src/schemas/dashboard.ts:40-49`; `SectionError` props `{ msg?, onRetry }` consistent across T5 definition + 4 call sites.
- [ ] Helper signature matches finance refactor: `buildPerListingMetrics(prisma, companyId, from, to)` — same param order in T1 helper + T1 finance edit + T3 dashboard-inventory edit.
- [ ] Every Prisma query in new code threads `companyId` (ADR-0018 Rule 1); every `$queryRaw` binds `${companyId}::uuid` (ADR-0018 Rule 2).
- [ ] Test seed prefixes used: `PERLIST-T-*` (T1), `SALES-T-*` (T2), `INV-T-*` (T3), `TREND-T-*` (T4) — no collisions, easy `LIKE` filtering for debug.
- [ ] Each commit message uses conventional prefix (`feat:` / `refactor:` / `fix:` / `docs:`) and references "Plan F1 T#" in body.

---

**Next step**: Choose execution mode.

**1. Subagent-Driven (recommended for this plan)** — Dispatch one fresh subagent per task; two-stage review between tasks. Best for the spread of cross-domain changes here.

**2. Inline Execution** — Execute T1–T6 in this session via `superpowers:executing-plans`; checkpoint after T2 and T4. Faster but heavier on context.

Per `project_kiditem_workflow.md` and `feedback_review_cadence.md`, this plan is sized for **option 1**.
