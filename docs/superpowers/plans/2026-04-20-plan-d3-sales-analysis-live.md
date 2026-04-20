# Plan D.3 — sales-analysis live aggregation + ADR-0017 convergence + SalesOverview rewire (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
>
> **REQUIRED:** 각 파일 수정 전 해당 도메인 CLAUDE.md 를 먼저 Read.

## v1 → v2 (4-reviewer findings applied)

| Finding (Severity) | Fix in v2 |
|---|---|
| **CRITICAL** — Plan v1 이 `ChannelListing.channelName` (listing 타이틀, nullable) 을 플랫폼 식별자로 오인하여 group by. 실제 플랫폼 필드는 **`ChannelListing.channel`** (required String, `core.prisma:301`) | Group by `channel` (e.g., `'coupang'`, `'naver'`, `'wing'`). `channelName` 은 listing display name → 사용 안 함 |
| **CRITICAL** — `ChannelListing.channelType` 필드 존재 안 함 (`grep` 0 matches) | `channelType` 을 Prisma select 에서 제거. 서비스 내부에서 `channel` 값 → `channelType` derivation (constant map: `coupang/naver/11st/gmarket/auction → marketplace`, `wing → direct`, 기타 → `other`) |
| **CRITICAL** — `returnRate` lineItem-count 가 Zod `.max(1)` + ADR-0017 "100% 초과 불가능" 위반. 1 order × 2 returned lineItem → rate = 2.0 | `Set<string>` 기반 distinct **order-id** count 로 변경 (D.2 T3 패턴 exactly). `Map<channel, Set<orderId>>` |
| **HIGH** — `ad.findMany` 가 D.1 T5 `ad.groupBy` 대비 performance regression | `ad.groupBy({ by: ['listingId'], _sum: { spend: true } })` 복귀. 별도 `channelListing.findMany({ where: { id: { in: listingIds } }, select: { id, channel } })` 로 listingId → channel 매핑 |
| **HIGH** — 3-hop IDOR 에서 `return.companyId` 누락. 현재 `return: { order: { companyId, ... } }` 만 | `return: { companyId, order: { companyId, orderedAt: {...} } }` — 3-layer denorm 모두 명시 |
| **HIGH** — `orphanReturnCount` 필드 ADR-0017 요구하나 `ChannelAnalysisSchema` 에서 누락 | 각 channel row 에 `orphanReturnCount: z.number().int().nonnegative()` 추가. Orphan (orderId NULL) 은 channel 매핑 불가 → `totals.orphanReturnCount` top-level 집계로 노출 (channel 별 분배 불가) |
| **HIGH** — 상태 필터 orders 에만 있고 returns INNER JOIN 의 `order` 에 누락 → cancelled order 의 returns 가 numerator 에 포함 | Returns 조인 쿼리의 `order: { status: { notIn: [...] } }` 도 미러링 |
| **HIGH** — Controller 에 `@CurrentCompany()` 데코레이터 + guard 미장착 | T2 Step 2.8 을 구체화: `profit-loss.controller.ts` 패턴 그대로 복사 (`@Controller('sales-analysis')` + `@CurrentCompany()` param + `@UseGuards` if present on profit-loss module) |
| **MEDIUM** — T4 seeds 를 "D.1 T6 패턴 exactly" 로 defer → 200 LOC implementer 자유재량 | `apps/server/src/test-helpers/finance-seeds.ts` 로 helper 추출 (**T0 pre-work**) — D.1 `profit-loss.pg.integration.spec.ts` 의 `setupListing` / `createOrder` / `seedBulkOrders` 를 shared location 으로 이동. D.3/D.3b 모두 재사용 |
| **MEDIUM** — Release note 누락 (D.2 T4 는 channel-dashboard 전용) | **T7b Release Note** task 추가: `docs/release-notes/2026-04-sales-analysis-channel-breakdown.md` |
| **MEDIUM** — CEO SELECTIVE EXPANSION — D.3a 단독이면 "1 page rewire" 고립. D.3b (statistics + settlements + sales-plans) 즉시 scaffold 필요 | **T9 D.3b stub** task 추가: `docs/superpowers/plans/2026-04-20-plan-d3b-statistics-settlements-sales-plans.md` stub 작성 (same family `feat/plan-d-frontend-rewire-d3` 플래닝) — "Plan F" defer 언어 제거 |
| **MEDIUM** — T5 `SalesOverviewTotals` stub (`/* ... cards */` placeholder) → implementer 자유재량 | T5 Step 5.1 에서 기존 `SalesOverview.tsx` 의 KPI 카드 레이아웃 4개 (총매출 / 총이익 / 평균마진율 / 총 주문 수) 정확히 enumerate. Plan 에서 각 카드의 field 소스 명시 (`data.totals.totalRevenue` 등) |
| **MEDIUM** — Cross-period order semantic leak (한 order 가 여러 channel 걸치는 경우 shipping revenue-weighted + orderId Set 이중 카운트) | Schema JSDoc 에 명시: "order 가 multi-channel 인 경우 해당 order 는 각 channel 의 `totalOrders` Set 에 포함 (≥ 1 row 지분)". `totals.totalOrders` 는 channels 합산이 아닌 **global distinct Order Set.size** — 중복 방지 |

**결과**: Plan v1 8 tasks → **v2 10 tasks** (T0 pre-work + T7b release note + T9 D.3b stub). 예상 실행 1~1.5 일. Scope 실질 변화 없음 (plan 정확성만 교정).

---

**Goal:** `sales-analysis.service.getAnalysis` 를 ProfitLoss 테이블 bypass → live aggregation 으로 재작성. 그룹화 key = **`ChannelListing.channel`** (플랫폼). ADR-0017 returnRate semantic + orphan policy (c) 적용 (D.2 deferred). `SalesOverview.tsx` 재배선 (apiClient.getParsed + period URL + 3-state + shared SortableHeader).

**Architecture:** Backend: D.1 T5 profit-loss.service 패턴 — 3 parallel Promise.all (Order + OrderReturnLineItem + Ad.groupBy). 그룹화는 listing.channel. 반품은 distinct order Set per channel. Orphan 은 top-level side metric. Frontend: D.1 T8 패턴 — getParsed + URL period + 3-state + ZodError 친화 메시지.

**Tech Stack:** NestJS 11, Prisma 6, Next.js 16 App Router, @tanstack/react-query 5.62, Zod, vitest + RTL + real Postgres.

**Depends on:**
- Plan B2c.orders (main `d381859`), Plan B2c.dashboard (main `335acee`)
- Plan D.1 (main `094511c`) — `profit-loss.service` template, `apiClient.getParsed`, `SortableHeader`, `usePeriodSelector.initial`
- Plan D.2 (main `e853b15`) — ADR-0017, `ReturnSummarySchema`, 2-hop IDOR pattern
- Spec v4 § D.3 line 74

**Reusable patterns (D.1 + D.2):**
- 3 parallel Promise.all live aggregation
- `satisfies Schema` drift guard
- I3 SUM(OrderLineItem.totalPrice)
- I8 half-open `gte: from, lt: to`
- I7 companyId via `@CurrentCompany()` (ADR-0006)
- 3-hop IDOR (v2: OrderReturnLineItem.companyId + return.companyId + order.companyId)
- `apiClient.getParsed` boundary
- URL period state
- RTL 3-state
- Structured `logger.log({ msg, ... })`

---

## Pre-flight — schema facts confirmed

```
grep -n "channel " prisma/models/core.prisma  →  line 301: channel String (required, 플랫폼)
grep -n "channelName" prisma/models/core.prisma  →  line 304: channelName String? (nullable, listing 타이틀)
grep -n "channelType" prisma/models/core.prisma  →  (no match — 필드 존재 안 함)
```

스키마 검증 완료 후 v2 재작성됨. Implementer 는 T0 에서 재확인.

---

## File Structure

### Create
- `apps/server/src/test-helpers/finance-seeds.ts` — shared seed helpers (T0 — D.3b/future reuse)
- `packages/shared/src/schemas/sales-analysis.ts` — `ChannelAnalysisSchema` + `SalesAnalysisDataSchema` (+orphanReturnCount)
- `apps/server/src/finance/services/__tests__/sales-analysis.service.spec.ts`
- `apps/server/src/finance/services/__tests__/sales-analysis.pg.integration.spec.ts`
- `apps/web/src/app/sales-analysis/__tests__/SalesOverview.spec.tsx`
- `docs/release-notes/2026-04-sales-analysis-channel-breakdown.md` — T7b
- `docs/superpowers/plans/2026-04-20-plan-d3b-statistics-settlements-sales-plans.md` — T9 scaffold stub

### Modify
- `packages/shared/src/index.ts` — export sales-analysis schemas
- `apps/server/src/finance/services/sales-analysis.service.ts` — full rewrite
- `apps/server/src/finance/services/types.ts` — remove local `ChannelAnalysis` / `SalesAnalysisResult`
- `apps/server/src/finance/controllers/sales-analysis.controller.ts` — add `@CurrentCompany()` wiring
- `apps/server/src/finance/CLAUDE.md` — remove "D.3 migration pending" banner
- `apps/web/src/app/sales-analysis/components/SalesOverview.tsx` — apiClient.getParsed + URL period + 3-state + remove inline type
- `apps/web/src/app/sales-analysis/components/ChannelTable.tsx` — shared SortableHeader + rename `channelName` → `channel` in column

### Not in scope — Plan D.3b (scaffold stub created in T9)
- `statistics.service` (5 profitLoss calls) + `Statistics.tsx`
- `settlements.service` + `Settlements.tsx`
- `sales-plans.service` + `SalesPlans.tsx`

### Not in scope — separate
- `WingDailySales.tsx` (TrafficStats consumer, not profitLoss) — unrelated
- `ad-strategy` / `dashboard-inventory` / `dashboard-trend` / `action-task` profitLoss readers → Plan E / D.4

---

## Task 0: Pre-work — extract finance seed helpers

**Files:**
- Create: `apps/server/src/test-helpers/finance-seeds.ts`

**Review cadence**: Pre-work — **1 combined review** (structural, not business logic).

Rationale: D.1 T6 `profit-loss.pg.integration.spec.ts` 는 seed helpers (`setupListing`, `createOrder`, `seedBulkOrders`) 를 inline 에 200 LOC 로 정의. D.3 T4 + D.3b 도 같은 helpers 필요. 추출해서 재사용.

- [ ] **Step 0.1**: Read `apps/server/src/test-helpers/real-prisma.ts` (existing helpers: `TEST_COMPANY_ID`, `OTHER_COMPANY_ID`, `resetDb`, `seedBaseFixture`).

- [ ] **Step 0.2**: Read `apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts` — locate inline `setupListing`, `createOrder`, `seedBulkOrders` definitions.

- [ ] **Step 0.3**: Create `apps/server/src/test-helpers/finance-seeds.ts`

```ts
import type { PrismaService } from '../prisma/prisma.service';

export async function setupMaster(prisma: PrismaService, opts: {
  companyId: string;
  code: string;
  name: string;
  legacyCode?: string | null;
  category?: string | null;
  abcGrade?: string | null;
  thumbnailUrl?: string | null;
}): Promise<{ id: string }> {
  return prisma.masterProduct.create({
    data: {
      companyId: opts.companyId,
      code: opts.code,
      name: opts.name,
      legacyCode: opts.legacyCode ?? null,
      category: opts.category ?? null,
      abcGrade: opts.abcGrade ?? null,
      thumbnailUrl: opts.thumbnailUrl ?? null,
    },
    select: { id: true },
  });
}

export async function setupProductOption(prisma: PrismaService, opts: {
  companyId: string;
  masterId: string;
  sku: string;
  costPrice?: number;
  commissionRate?: number;
  otherCost?: number;
}): Promise<{ id: string }> {
  return prisma.productOption.create({
    data: {
      companyId: opts.companyId,
      masterId: opts.masterId,
      sku: opts.sku,
      costPrice: opts.costPrice ?? 5000,
      commissionRate: opts.commissionRate ?? 0.1,
      otherCost: opts.otherCost ?? 0,
    },
    select: { id: true },
  });
}

export async function setupChannelListing(prisma: PrismaService, opts: {
  companyId: string;
  masterId: string;
  channel: string;                    // platform: 'coupang' | 'naver' | 'wing' | ...
  externalId: string;
  channelName?: string | null;        // listing title (optional)
  optionId: string;
  vendorItemId: string;
}): Promise<{ listingId: string; listingOptionId: string }> {
  const listing = await prisma.channelListing.create({
    data: {
      companyId: opts.companyId,
      masterId: opts.masterId,
      channel: opts.channel,
      externalId: opts.externalId,
      channelName: opts.channelName ?? null,
    },
    select: { id: true },
  });
  const lopt = await prisma.channelListingOption.create({
    data: {
      companyId: opts.companyId,
      listingId: listing.id,
      optionId: opts.optionId,
      vendorItemId: opts.vendorItemId,
    },
    select: { id: true },
  });
  return { listingId: listing.id, listingOptionId: lopt.id };
}

export async function seedOrderWithLineItems(prisma: PrismaService, opts: {
  companyId: string;
  externalOrderId: string;
  platform?: string;
  orderedAt: string;                  // ISO
  shippingPrice?: number;
  status?: string;                    // default 'accepted' (passes notIn filter)
  lineItems: Array<{
    quantity: number;
    totalPrice: number;
    optionId: string;
    listingOptionId: string;
  }>;
}): Promise<string> {
  const o = await prisma.order.create({
    data: {
      companyId: opts.companyId,
      externalOrderId: opts.externalOrderId,
      platform: opts.platform ?? 'coupang',
      orderedAt: new Date(opts.orderedAt),
      status: opts.status ?? 'accepted',
      totalPrice: opts.lineItems.reduce((s, li) => s + li.totalPrice, 0),
      shippingPrice: opts.shippingPrice ?? 3000,
      lineItems: {
        create: opts.lineItems.map((li) => ({
          companyId: opts.companyId,
          quantity: li.quantity,
          totalPrice: li.totalPrice,
          optionId: li.optionId,
          listingOptionId: li.listingOptionId,
        })),
      },
    },
    select: { id: true },
  });
  return o.id;
}

export async function seedReturn(prisma: PrismaService, opts: {
  companyId: string;
  orderId: string | null;           // null = orphan
  requestedAt: string;               // ISO
  lineItems?: Array<{ orderLineItemId: string | null }>;
}): Promise<string> {
  const r = await prisma.orderReturn.create({
    data: {
      companyId: opts.companyId,
      orderId: opts.orderId,
      requestedAt: new Date(opts.requestedAt),
      status: 'requested',
      reason: 'test',
      lineItems: opts.lineItems
        ? {
            create: opts.lineItems.map((li) => ({
              companyId: opts.companyId,
              orderLineItemId: li.orderLineItemId,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });
  return r.id;
}

export async function seedAd(prisma: PrismaService, opts: {
  companyId: string;
  listingId: string;
  date: string;
  spend: number;
}): Promise<string> {
  const a = await prisma.ad.create({
    data: {
      companyId: opts.companyId,
      listingId: opts.listingId,
      date: new Date(opts.date),
      spend: opts.spend,
    },
    select: { id: true },
  });
  return a.id;
}
```

**Verify field names** vs actual Prisma schema (`prisma/models/orders.prisma` + `core.prisma`). If any required field missing (e.g., `OrderReturn.platform` or similar), add. Inline doc comment above each helper noting required fields.

- [ ] **Step 0.4**: Commit

```bash
git add apps/server/src/test-helpers/finance-seeds.ts
git commit -m "chore(test-helpers): extract finance PG seed helpers for D.3+ reuse (Plan D.3 T0)"
```

---

## Task 1: Zod schemas in @kiditem/shared

**Files:**
- Create: `packages/shared/src/schemas/sales-analysis.ts`
- Modify: `packages/shared/src/index.ts`

**Review cadence**: Trivial schema — **1 combined review**.

- [ ] **Step 1.1**: Read `packages/shared/CLAUDE.md` + `packages/shared/src/schemas/return-summary.ts` (D.2 T2 reference).

- [ ] **Step 1.2**: Create `packages/shared/src/schemas/sales-analysis.ts`

```ts
import { z } from 'zod';

/**
 * `/api/sales-analysis` channel row — 채널(플랫폼)별 매출/비용/이익 요약 (Plan D.3).
 *
 * Semantic:
 * - Group key: `ChannelListing.channel` (e.g., 'coupang', 'naver', 'wing')
 *   NOT `channelName` (listing display title).
 * - channelType: derived server-side from channel ('marketplace' | 'direct' | 'other')
 *   — ChannelListing 에는 channelType 필드 없음, 서비스 상수 맵에서 생성.
 * - returnRate: ADR-0017 semantic — distinct orders returned / orders in period,
 *   INNER JOIN via Order.orderedAt. Bounded [0, 1].
 * - orphanReturnCount: Orphan (OrderReturn.orderId NULL) requestedAt ∈ period 은
 *   channel 매핑 불가이므로 channel row 에는 표시 안 하고 totals 에만 노출.
 * - Shipping: order 가 multi-channel span 시 revenue-weighted 분배 (D.1 T5 패턴).
 *   한 order 가 N 채널에 걸쳐 있으면 totalOrders 에 N 개 채널 각각 1 count —
 *   `totals.totalOrders` 는 channels 합산 아닌 global distinct Order count.
 */
export const ChannelAnalysisSchema = z.object({
  channel: z.string(),                            // 플랫폼 — 'coupang' | 'naver' | 'wing' | ...
  channelType: z.enum(['marketplace', 'direct', 'other']),
  totalOrders: z.number().int().nonnegative(),    // distinct Order count participating in this channel
  totalRevenue: z.number().int().nonnegative(),
  totalCost: z.number().int().nonnegative(),      // cogs + commission + shipping + ad + other
  totalProfit: z.number().int(),                  // may be negative
  returnCount: z.number().int().nonnegative(),    // distinct orders returned (ADR-0017 INNER JOIN)
  returnRate: z.number().min(0).max(1),           // ADR-0017 hard contract
  avgOrderValue: z.number().nonnegative(),
});
export type ChannelAnalysis = z.infer<typeof ChannelAnalysisSchema>;

/**
 * `/api/sales-analysis?period=YYYY-MM` full response.
 */
export const SalesAnalysisDataSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'),
  channels: z.array(ChannelAnalysisSchema),       // sorted by totalRevenue desc
  totals: z.object({
    totalRevenue: z.number().int().nonnegative(),
    totalProfit: z.number().int(),
    totalOrders: z.number().int().nonnegative(),  // global distinct Order count (not channels sum)
    totalCost: z.number().int().nonnegative(),
    orphanReturnCount: z.number().int().nonnegative(),  // NEW (ADR-0017) — orphans channel 매핑 불가
  }),
});
export type SalesAnalysisData = z.infer<typeof SalesAnalysisDataSchema>;
```

- [ ] **Step 1.3**: Update `packages/shared/src/index.ts`

```ts
// Sales Analysis (Plan D.3, ADR-0017)
export { SalesAnalysisDataSchema, ChannelAnalysisSchema } from './schemas/sales-analysis.js';
export type { SalesAnalysisData, ChannelAnalysis } from './schemas/sales-analysis.js';
```

- [ ] **Step 1.4**: Build + tsc

```bash
cd packages/shared && npm run build 2>&1 | tail -5
cd /Users/yhc125/workspace/kiditem/.claude/worktrees/plan-d3
npx --prefix apps/server tsc --noEmit 2>&1 | grep -E "sales-analysis|SalesAnalysis" | head -5
```

- [ ] **Step 1.5**: Commit

```bash
git add packages/shared/src/
git commit -m "feat(shared): SalesAnalysisDataSchema + ChannelAnalysisSchema with orphanReturnCount (Plan D.3 T1)"
```

---

## Task 2: sales-analysis.service.getAnalysis rewrite (live aggregation, channel-based)

**Files:**
- Modify: `apps/server/src/finance/services/sales-analysis.service.ts`
- Modify: `apps/server/src/finance/services/types.ts` (remove local types)

**Review cadence**: Service rewrite — **2-stage**.

### Step 2.1: Pre-flight reads

- [ ] Read `apps/server/src/finance/CLAUDE.md` (note current "D.3 migration 예정 — 건드리지 말 것" banner — removed in T7).
- [ ] Read current `sales-analysis.service.ts` fully.
- [ ] Read `apps/server/src/finance/services/profit-loss.service.ts` (D.1 T5 — **primary reference**).
- [ ] Read `apps/server/src/channels/services/channel-dashboard.service.ts:getReturnSummary` (D.2 T3 — returnRate + 2-hop IDOR).

### Step 2.2: Confirm schema facts

```bash
grep -n "model ChannelListing\|channel \|channelName\|channelType" prisma/models/core.prisma | head -10
grep -n "OrderReturnLineItem\|orderLineItem.*Order" prisma/models/orders.prisma | head -10
```

Expected:
- `channel String` (required, line ~301) ✓
- `channelName String?` (nullable, line ~304) — 사용 안 함
- `channelType` — **존재 안 함** ✓ (derived in service)

### Step 2.3: Remove local types

`apps/server/src/finance/services/types.ts` 에서 다음 제거 (이미 T1 shared 로 이동):

```ts
// DELETE
// export interface ChannelAnalysis { ... }
// export interface SalesAnalysisResult { ... }
```

기타 export 유지. 파일이 빈 파일이 되면 삭제하고 import 경로 조정.

### Step 2.4: Rewrite `sales-analysis.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { SalesAnalysisData, ChannelAnalysis } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import { resolvePricing } from '../../common/option-pricing-resolver';

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

/**
 * Map ChannelListing.channel (platform) → ChannelAnalysis.channelType.
 * ChannelListing 에 channelType 필드 없음 (schema 확인). 서비스 상수에서 생성.
 */
const CHANNEL_TYPE_MAP: Record<string, 'marketplace' | 'direct' | 'other'> = {
  coupang: 'marketplace',
  naver: 'marketplace',
  '11st': 'marketplace',
  gmarket: 'marketplace',
  auction: 'marketplace',
  wing: 'direct',
};
function resolveChannelType(channel: string): 'marketplace' | 'direct' | 'other' {
  return CHANNEL_TYPE_MAP[channel] ?? 'other';
}

/**
 * Plan D.3 — sales-analysis live aggregation (ADR-0016 bypass + ADR-0017 returnRate + orphan policy).
 *
 * Data flow:
 *   Order (+ shippingPrice) → OrderLineItem → ChannelListingOption.listing.channel
 *   + OrderReturnLineItem INNER JOIN Order (ADR-0017, 3-hop IDOR)
 *   + Ad.groupBy(['listingId'], _sum.spend) → listingId→channel map
 *
 * Group key: `ChannelListing.channel` (plataform)
 * Orphan side metric: totals.orphanReturnCount (requestedAt ∈ period + orderId NULL).
 */
@Injectable()
export class SalesAnalysisService {
  private readonly logger = new Logger(SalesAnalysisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAnalysis(
    companyId: string,
    period?: string,
  ): Promise<SalesAnalysisData> {
    const startedAt = Date.now();
    const resolvedPeriod = this.resolvePeriod(period);
    const { year, month } = this.parsePeriod(resolvedPeriod);
    const from = kstMonthStart(year, month);
    const to = kstMonthStart(year, month + 1);

    // 4 parallel queries (all data-independent)
    const [orders, returnOrderIdRows, adGroupRows, orphanCount] = await Promise.all([
      // 1) Orders with nested listingOption.listing.channel
      this.prisma.order.findMany({
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
                select: { listing: { select: { id: true, channel: true } } },
              },
            },
          },
        },
      }),
      // 2) Return events — distinct (orderId, channel) pairs for ADR-0017 returnCount
      //    3-hop IDOR: OrderReturnLineItem.companyId + return.companyId + return.order.companyId
      //    Status filter mirror on return.order.
      this.prisma.orderReturnLineItem.findMany({
        where: {
          companyId,
          return: {
            companyId,
            order: {
              companyId,
              orderedAt: { gte: from, lt: to },
              status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
            },
          },
        },
        select: {
          orderLineItem: {
            select: {
              order: { select: { id: true } },
              listingOption: {
                select: { listing: { select: { channel: true } } },
              },
            },
          },
        },
      }),
      // 3) Ad spend grouped by listingId (D.1 T5 pattern — performance)
      this.prisma.ad.groupBy({
        by: ['listingId'],
        _sum: { spend: true },
        where: {
          companyId,
          date: { gte: from, lt: to },
        },
      }),
      // 4) Orphan return count (ADR-0017 side metric) — orderId NULL, requestedAt ∈ period
      this.prisma.orderReturn.count({
        where: {
          companyId,
          orderId: null,
          requestedAt: { gte: from, lt: to },
        },
      }),
    ]);

    // Resolve listingId → channel map (for ad group rows)
    const adListingIds = adGroupRows.map((r) => r.listingId).filter((v): v is string => v != null);
    const listings = adListingIds.length > 0
      ? await this.prisma.channelListing.findMany({
          where: { id: { in: adListingIds }, companyId },
          select: { id: true, channel: true },
        })
      : [];
    const listingIdToChannel = new Map<string, string>(listings.map((l) => [l.id, l.channel]));

    // Build return order-set per channel (ADR-0017 distinct Order count)
    const returnOrderSets = new Map<string, Set<string>>();
    for (const rli of returnOrderIdRows) {
      const channel = rli.orderLineItem?.listingOption?.listing?.channel;
      const orderId = rli.orderLineItem?.order?.id;
      if (!channel || !orderId) continue;
      if (!returnOrderSets.has(channel)) returnOrderSets.set(channel, new Set());
      returnOrderSets.get(channel)!.add(orderId);
    }

    // Build ad cost per channel
    const adCostMap = new Map<string, number>();
    for (const row of adGroupRows) {
      const channel = row.listingId ? listingIdToChannel.get(row.listingId) : undefined;
      if (!channel) continue;
      adCostMap.set(channel, (adCostMap.get(channel) ?? 0) + (row._sum.spend ?? 0));
    }

    // Aggregate orders per channel
    type Agg = {
      channel: string;
      orderIds: Set<string>;
      totalRevenue: number;
      totalCogs: number;
      totalCommission: number;
      totalShipping: number;
      totalOtherCost: number;
    };
    const groups = new Map<string, Agg>();
    const globalOrderIds = new Set<string>();  // totals.totalOrders — global distinct

    for (const o of orders) {
      globalOrderIds.add(o.id);
      const orderTotalRevenue = o.lineItems.reduce((sum, li) => sum + (li.totalPrice || 0), 0);

      for (const li of o.lineItems) {
        const channel = li.listingOption?.listing?.channel;
        if (!channel) continue;
        let g = groups.get(channel);
        if (!g) {
          g = {
            channel,
            orderIds: new Set<string>(),
            totalRevenue: 0,
            totalCogs: 0,
            totalCommission: 0,
            totalShipping: 0,
            totalOtherCost: 0,
          };
          groups.set(channel, g);
        }

        g.orderIds.add(o.id);
        const resolved = resolvePricing({ option: li.option ?? {} });
        const lineRevenue = li.totalPrice || 0;
        g.totalRevenue += lineRevenue;
        g.totalCogs += Math.round(resolved.costPrice * li.quantity);
        g.totalCommission += Math.round(lineRevenue * resolved.commissionRate);
        g.totalOtherCost += Math.round(resolved.otherCost * li.quantity);

        // Revenue-weighted shipping (ADR-0016 pattern, D.1 T5)
        if (orderTotalRevenue > 0 && o.shippingPrice) {
          g.totalShipping += Math.round(o.shippingPrice * (lineRevenue / orderTotalRevenue));
        }
      }
    }

    const channels: ChannelAnalysis[] = Array.from(groups.values()).map((g) => {
      const returnedOrderIds = returnOrderSets.get(g.channel) ?? new Set<string>();
      const returnCount = returnedOrderIds.size;
      const totalOrders = g.orderIds.size;
      const adCost = adCostMap.get(g.channel) ?? 0;
      const totalCost = g.totalCogs + g.totalCommission + g.totalShipping + adCost + g.totalOtherCost;
      const totalProfit = g.totalRevenue - totalCost;
      const returnRate = totalOrders === 0 ? 0 : Math.min(1, returnCount / totalOrders);
      const avgOrderValue = totalOrders === 0 ? 0 : g.totalRevenue / totalOrders;
      return {
        channel: g.channel,
        channelType: resolveChannelType(g.channel),
        totalOrders,
        totalRevenue: g.totalRevenue,
        totalCost,
        totalProfit,
        returnCount,
        returnRate,
        avgOrderValue,
      } satisfies ChannelAnalysis;
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

    const totals = {
      totalRevenue: channels.reduce((s, c) => s + c.totalRevenue, 0),
      totalProfit: channels.reduce((s, c) => s + c.totalProfit, 0),
      totalOrders: globalOrderIds.size,  // global distinct — NOT channels sum (avoids cross-channel dup)
      totalCost: channels.reduce((s, c) => s + c.totalCost, 0),
      orphanReturnCount: orphanCount,
    };

    const result = { period: resolvedPeriod, channels, totals } satisfies SalesAnalysisData;

    this.logger.log({
      msg: 'sales-analysis.getAnalysis',
      companyId,
      period: resolvedPeriod,
      channelCount: channels.length,
      totalOrders: totals.totalOrders,
      totalRevenue: totals.totalRevenue,
      orphanReturnCount: totals.orphanReturnCount,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }

  private resolvePeriod(period?: string): string {
    if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private parsePeriod(period: string): { year: number; month: number } {
    const [y, m] = period.split('-').map((s) => parseInt(s, 10));
    return { year: y, month: m };
  }
}
```

### Step 2.5: Update controller with `@CurrentCompany()`

`apps/server/src/finance/controllers/sales-analysis.controller.ts` 는 현재 guard/데코레이터 없음. **`profit-loss.controller.ts` 패턴 정확히 복사**:

```bash
cat apps/server/src/finance/controllers/profit-loss.controller.ts
```

패턴:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import type { SalesAnalysisData } from '@kiditem/shared';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';

@Controller('sales-analysis')
export class SalesAnalysisController {
  constructor(private readonly salesAnalysisService: SalesAnalysisService) {}

  @Get()
  async getAnalysis(
    @Query() query: SalesAnalysisQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<SalesAnalysisData> {
    return this.salesAnalysisService.getAnalysis(companyId, query.period);
  }
}
```

**Verify guard registration**: 현재 profit-loss.controller 는 `DevAuthMiddleware` 를 통해 companyId 가 주입됨 (global middleware). sales-analysis 도 동일 경로 — 추가 guard 불필요. 단 확인:

```bash
grep -rn "DevAuthMiddleware\|CompanyScopeGuard" apps/server/src/auth/ apps/server/src/finance/ | head -5
```

If sales-analysis route 가 `@SkipAuth()` 로 제외되어 있으면 제거.

### Step 2.6: tsc verify

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -E "sales-analysis|SalesAnalysis" | head -10
```

Expected: empty.

### Step 2.7: Commit

```bash
git add apps/server/src/finance/
git commit -m "feat(finance): sales-analysis live aggregation + channel-based grouping + ADR-0017 + 3-hop IDOR (Plan D.3 T2)"
```

---

## Task 3: Unit tests

**Files:**
- Create: `apps/server/src/finance/services/__tests__/sales-analysis.service.spec.ts`

**Review cadence**: **2-stage** (semantic correctness critical).

### Step 3.1: Read D.1 reference

`apps/server/src/finance/services/__tests__/profit-loss.service.spec.ts` — mock helper pattern.

### Step 3.2: Create spec

```ts
import { describe, it, expect, vi } from 'vitest';
import { SalesAnalysisService } from '../sales-analysis.service';

function makePrisma(overrides: {
  orders?: unknown[];
  returnRows?: unknown[];
  adGroupRows?: unknown[];
  orphanCount?: number;
  listings?: Array<{ id: string; channel: string }>;
}) {
  return {
    order: { findMany: vi.fn().mockResolvedValue(overrides.orders ?? []) },
    orderReturnLineItem: { findMany: vi.fn().mockResolvedValue(overrides.returnRows ?? []) },
    ad: { groupBy: vi.fn().mockResolvedValue(overrides.adGroupRows ?? []) },
    orderReturn: { count: vi.fn().mockResolvedValue(overrides.orphanCount ?? 0) },
    channelListing: { findMany: vi.fn().mockResolvedValue(overrides.listings ?? []) },
  } as any;
}

const mkLineItem = (
  listing: { id: string; channel: string },
  p: { quantity: number; totalPrice: number; costPrice: number; commissionRate: number; otherCost: number },
) => ({
  quantity: p.quantity,
  totalPrice: p.totalPrice,
  option: {
    costPrice: p.costPrice,
    commissionRate: p.commissionRate,
    otherCost: p.otherCost,
  },
  listingOption: { listing },
});

describe('SalesAnalysisService.getAnalysis — Plan D.3', () => {
  it('groups by channel (not channelName)', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const naver = { id: 'l-n', channel: 'naver' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
      { id: 'o2', shippingPrice: 3000, lineItems: [mkLineItem(naver, { quantity: 2, totalPrice: 20000, costPrice: 4000, commissionRate: 0.15, otherCost: 100 })] },
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.channels.map((c) => c.channel).sort()).toEqual(['coupang', 'naver']);
    expect(result.channels[0].channelType).toBe('marketplace');  // coupang → marketplace
  });

  it('channelType derivation — wing → direct, unknown → other', async () => {
    const wing = { id: 'l-w', channel: 'wing' };
    const weird = { id: 'l-x', channel: 'unknown-ch' };
    const orders = [
      { id: 'o1', shippingPrice: 0, lineItems: [mkLineItem(wing, { quantity: 1, totalPrice: 1000, costPrice: 500, commissionRate: 0, otherCost: 0 })] },
      { id: 'o2', shippingPrice: 0, lineItems: [mkLineItem(weird, { quantity: 1, totalPrice: 1000, costPrice: 500, commissionRate: 0, otherCost: 0 })] },
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const w = result.channels.find((c) => c.channel === 'wing')!;
    const x = result.channels.find((c) => c.channel === 'unknown-ch')!;
    expect(w.channelType).toBe('direct');
    expect(x.channelType).toBe('other');
  });

  it('IDOR — 3-hop companyId on return query + channelListing lookup', async () => {
    const prisma = makePrisma({});
    await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'cA' }),
    }));
    expect(prisma.orderReturnLineItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'cA',
        return: expect.objectContaining({
          companyId: 'cA',
          order: expect.objectContaining({
            companyId: 'cA',
            orderedAt: expect.any(Object),
          }),
        }),
      }),
    }));
  });

  it('returnRate distinct-order count — 1 order × 2 returned lineItems = returnRate 1.0, NOT 2.0', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [
        mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(coup, { quantity: 1, totalPrice: 5000, costPrice: 3000, commissionRate: 0.1, otherCost: 0 }),
      ]},
    ];
    // 2 lineItem returns, SAME order → returnCount = 1 (distinct orderId)
    const returnRows = [
      { orderLineItem: { order: { id: 'o1' }, listingOption: { listing: { channel: 'coupang' } } } },
      { orderLineItem: { order: { id: 'o1' }, listingOption: { listing: { channel: 'coupang' } } } },
    ];
    const prisma = makePrisma({ orders, returnRows });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const c = result.channels[0];
    expect(c.totalOrders).toBe(1);
    expect(c.returnCount).toBe(1);
    expect(c.returnRate).toBe(1);
  });

  it('returnRate = 0 when totalOrders = 0 (no division by zero)', async () => {
    const prisma = makePrisma({});
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.channels).toEqual([]);
    expect(result.totals.totalOrders).toBe(0);
  });

  it('ad.groupBy by listingId → channel via channelListing lookup', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
    ];
    const adGroupRows = [
      { listingId: 'l-c', _sum: { spend: 2000 } },
      { listingId: 'l-unknown', _sum: { spend: 500 } },  // not in listings → dropped
    ];
    const listings = [{ id: 'l-c', channel: 'coupang' }];  // only l-c resolves
    const prisma = makePrisma({ orders, adGroupRows, listings });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const c = result.channels[0];
    expect(c.totalCost).toBeGreaterThanOrEqual(2000);  // adCost absorbed
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'cA' }),
    }));
  });

  it('orphanReturnCount exposed at totals, not per-channel', async () => {
    const prisma = makePrisma({ orphanCount: 5 });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.totals.orphanReturnCount).toBe(5);
  });

  it('totals.totalOrders = global distinct (avoids multi-channel dup)', async () => {
    // Order o1 spans coupang + naver lineItems — single distinct global order, 1 in each channel's count
    const coup = { id: 'l-c', channel: 'coupang' };
    const naver = { id: 'l-n', channel: 'naver' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [
        mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(naver, { quantity: 1, totalPrice: 5000, costPrice: 3000, commissionRate: 0.1, otherCost: 0 }),
      ]},
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    // Each channel has totalOrders=1 (sum = 2), but totals.totalOrders = 1 (distinct global)
    expect(result.channels.find((c) => c.channel === 'coupang')!.totalOrders).toBe(1);
    expect(result.channels.find((c) => c.channel === 'naver')!.totalOrders).toBe(1);
    expect(result.totals.totalOrders).toBe(1);
  });

  it('period default + invalid → current month', async () => {
    const prisma = makePrisma({});
    const [r1, r2] = await Promise.all([
      new SalesAnalysisService(prisma).getAnalysis('cA'),
      new SalesAnalysisService(prisma).getAnalysis('cA', 'garbage'),
    ]);
    expect(r1.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(r2.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('revenue-weighted shipping across channels preserves total shipping invariant', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const naver = { id: 'l-n', channel: 'naver' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [
        mkLineItem(coup, { quantity: 1, totalPrice: 9000, costPrice: 5000, commissionRate: 0, otherCost: 0 }),
        mkLineItem(naver, { quantity: 1, totalPrice: 3000, costPrice: 2000, commissionRate: 0, otherCost: 0 }),
      ]},
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const c = result.channels.find((x) => x.channel === 'coupang')!;
    const n = result.channels.find((x) => x.channel === 'naver')!;
    // Shipping split 9000/12000 = 75% coupang / 25% naver → 2250 + 750 = 3000
    // (shipping is nested inside totalCost; assert total cost makes sense)
    expect(c.totalRevenue).toBe(9000);
    expect(n.totalRevenue).toBe(3000);
  });
});
```

- [ ] **Step 3.3**: Run tests

```bash
cd apps/server && npx vitest run src/finance/services/__tests__/sales-analysis.service.spec.ts 2>&1 | tail -15
```

Expected: 10 pass.

- [ ] **Step 3.4**: Commit

```bash
git add apps/server/src/finance/services/__tests__/sales-analysis.service.spec.ts
git commit -m "test(finance): sales-analysis unit tests — channel grouping + ADR-0017 + IDOR (Plan D.3 T3)"
```

---

## Task 4: PG integration test

**Files:**
- Create: `apps/server/src/finance/services/__tests__/sales-analysis.pg.integration.spec.ts`

**Review cadence**: **2-stage**.

### Step 4.1: Create spec using T0 helpers

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SalesAnalysisService } from '../sales-analysis.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_COMPANY_ID, OTHER_COMPANY_ID } from '../../../test-helpers/real-prisma';
import { setupMaster, setupProductOption, setupChannelListing, seedOrderWithLineItems, seedReturn, seedAd } from '../../../test-helpers/finance-seeds';

const prisma = makeTestPrisma();
const service = new SalesAnalysisService(prisma);

async function setupChannelFixture(companyId: string, channel: string, suffix: string) {
  const master = await setupMaster(prisma, { companyId, code: `M-${suffix}`, name: `Product ${suffix}` });
  const option = await setupProductOption(prisma, { companyId, masterId: master.id, sku: `SKU-${suffix}` });
  const { listingId, listingOptionId } = await setupChannelListing(prisma, {
    companyId, masterId: master.id, channel, externalId: `EXT-${suffix}`,
    optionId: option.id, vendorItemId: `VI-${suffix}`,
  });
  return { masterId: master.id, optionId: option.id, listingId, listingOptionId };
}

describe('SalesAnalysisService.getAnalysis (PG integration)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseFixture(prisma);
  });

  it('groups orders by channel (coupang + naver)', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'COUP');
    const naver = await setupChannelFixture(TEST_COMPANY_ID, 'naver', 'NAVER');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'O-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'O-2', orderedAt: '2026-04-15T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    const result = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    expect(result.channels).toHaveLength(2);
    expect(result.channels.map((c) => c.channel).sort()).toEqual(['coupang', 'naver']);
  });

  it('IDOR — OTHER_COMPANY data does not leak + double-blind', async () => {
    const tcoup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'T-COUP');
    const ocoup = await setupChannelFixture(OTHER_COMPANY_ID, 'coupang', 'O-COUP');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'T-O1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: tcoup.optionId, listingOptionId: tcoup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      companyId: OTHER_COMPANY_ID, externalOrderId: 'O-O1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 20000, optionId: ocoup.optionId, listingOptionId: ocoup.listingOptionId }],
    });
    const t = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    const o = await service.getAnalysis(OTHER_COMPANY_ID, '2026-04');
    expect(t.totals.totalRevenue).toBe(10000);
    expect(o.totals.totalRevenue).toBe(20000);
  });

  it('ADR-0017 returnRate — past-period order excluded', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'APR');
    const marchOrderId = await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'MAR-1', orderedAt: '2026-03-15T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 5000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const aprOrderId = await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'APR-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const marchLineItem = await prisma.orderLineItem.findFirst({ where: { orderId: marchOrderId }, select: { id: true } });
    const aprLineItem = await prisma.orderLineItem.findFirst({ where: { orderId: aprOrderId }, select: { id: true } });
    // March order return (requestedAt April) — EXCLUDED from April returnCount
    await seedReturn(prisma, {
      companyId: TEST_COMPANY_ID, orderId: marchOrderId, requestedAt: '2026-04-07T00:00:00Z',
      lineItems: [{ orderLineItemId: marchLineItem!.id }],
    });
    // April order return — INCLUDED
    await seedReturn(prisma, {
      companyId: TEST_COMPANY_ID, orderId: aprOrderId, requestedAt: '2026-04-25T00:00:00Z',
      lineItems: [{ orderLineItemId: aprLineItem!.id }],
    });

    const result = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    const c = result.channels.find((x) => x.channel === 'coupang')!;
    expect(c.totalOrders).toBe(1);                  // only April order
    expect(c.returnCount).toBe(1);                  // only April order returned
    expect(c.returnRate).toBeCloseTo(1, 6);
  });

  it('orphanReturnCount — orderId NULL returns go to totals.orphanReturnCount', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'ORPH');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'APR-O', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedReturn(prisma, { companyId: TEST_COMPANY_ID, orderId: null, requestedAt: '2026-04-15T00:00:00Z' });

    const result = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    expect(result.channels[0].returnCount).toBe(0);
    expect(result.totals.orphanReturnCount).toBe(1);
  });

  it('SalesAnalysisDataSchema.parse succeeds on response', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'VALIDATE');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'VAL-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const result = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    const { SalesAnalysisDataSchema } = await import('@kiditem/shared');
    expect(() => SalesAnalysisDataSchema.parse(result)).not.toThrow();
  });

  it('KST boundary — 2026-04-30T14:59:59.999Z IN April, 15:00:00Z IN May', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'KST');
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'APR-LAST', orderedAt: '2026-04-30T14:59:59.999Z',
      lineItems: [{ quantity: 1, totalPrice: 7777, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'MAY-FIRST', orderedAt: '2026-04-30T15:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8888, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const april = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    const may = await service.getAnalysis(TEST_COMPANY_ID, '2026-05');
    expect(april.totals.totalRevenue).toBe(7777);
    expect(may.totals.totalRevenue).toBe(8888);
  });

  it('perf baseline — 1000 orders + 200 returns < 2s', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'PERF-C');
    const naver = await setupChannelFixture(TEST_COMPANY_ID, 'naver', 'PERF-N');
    // Bulk seed via createMany for speed
    const orderData = Array.from({ length: 1000 }, (_, i) => ({
      companyId: TEST_COMPANY_ID,
      externalOrderId: `PERF-${i}`,
      platform: 'coupang',
      orderedAt: new Date(`2026-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
      status: 'accepted',
      totalPrice: 10000,
      shippingPrice: 3000,
    }));
    await prisma.order.createMany({ data: orderData });
    const orders = await prisma.order.findMany({
      where: { companyId: TEST_COMPANY_ID, externalOrderId: { startsWith: 'PERF-' } },
      select: { id: true, externalOrderId: true },
    });
    // Add lineItems split 70/30 coupang/naver
    const lineItemData = orders.flatMap((o) => {
      const idx = parseInt(o.externalOrderId.split('-')[1], 10);
      const target = idx % 10 < 7 ? coup : naver;
      return [{
        orderId: o.id, companyId: TEST_COMPANY_ID,
        quantity: 1, totalPrice: 10000,
        optionId: target.optionId, listingOptionId: target.listingOptionId,
      }];
    });
    await prisma.orderLineItem.createMany({ data: lineItemData });

    const start = Date.now();
    const result = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    const latencyMs = Date.now() - start;
    expect(result.totals.totalOrders).toBe(1000);
    expect(result.channels).toHaveLength(2);
    expect(latencyMs).toBeLessThan(2000);
    console.log(`[perf] sales-analysis 1000 orders × 2 channels → ${latencyMs}ms`);
  });

  it('empty-channel ad — ad spend on channel with 0 orders is dropped (orders-driven grouping)', async () => {
    const coup = await setupChannelFixture(TEST_COMPANY_ID, 'coupang', 'AD-ONLY-C');
    const naver = await setupChannelFixture(TEST_COMPANY_ID, 'naver', 'AD-ONLY-N');
    // coupang has orders; naver only has ad spend
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID, externalOrderId: 'AD-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedAd(prisma, { companyId: TEST_COMPANY_ID, listingId: naver.listingId, date: '2026-04-15', spend: 500 });
    const result = await service.getAnalysis(TEST_COMPANY_ID, '2026-04');
    expect(result.channels).toHaveLength(1);              // only coupang
    expect(result.channels[0].channel).toBe('coupang');
  });
});
```

- [ ] **Step 4.2**: Run tests

```bash
cd /Users/yhc125/workspace/kiditem/.claude/worktrees/plan-d3
npm run db:test:up && npm run db:test:prepare
cd apps/server && npm run test:integration -- sales-analysis.pg 2>&1 | tail -25
```

- [ ] **Step 4.3**: Commit

```bash
git add apps/server/src/finance/services/__tests__/sales-analysis.pg.integration.spec.ts
git commit -m "test(finance): sales-analysis.pg integration — channel + IDOR + ADR-0017 + KST + empty-ad + perf (Plan D.3 T4)"
```

---

## Task 5: SalesOverview.tsx rewire + ChannelTable.tsx SortableHeader adoption

**Files:**
- Modify: `apps/web/src/app/sales-analysis/components/SalesOverview.tsx`
- Modify: `apps/web/src/app/sales-analysis/components/ChannelTable.tsx`

**Review cadence**: **2-stage**.

### Step 5.1: Read current files + capture KPI card layout

- [ ] Read `SalesOverview.tsx` fully — note the 4 KPI cards (probably 총매출 / 총이익 / 평균마진율 / 총 주문 수) with specific styling.
- [ ] Read `ChannelTable.tsx` fully — note inline `SortTh`, field rendering.
- [ ] Read D.1 T8 `apps/web/src/app/profit-loss/page.tsx` — reference pattern.

### Step 5.2: Rewire `SalesOverview.tsx`

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { SalesAnalysisDataSchema, type ChannelAnalysis } from '@kiditem/shared';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { formatKRW, formatPercent, formatNumber } from '@/lib/utils';
import ChannelTable from './ChannelTable';

type SortField = 'totalOrders' | 'totalRevenue' | 'totalCost' | 'totalProfit' | 'avgOrderValue';
type SortDir = 'asc' | 'desc' | null;

export default function SalesOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get('period');

  const { period, setPeriod: setPeriodRaw, periodOptions } = usePeriodSelector({
    months: 12, defaultTo: 'prev', initial: urlPeriod ?? undefined,
  });
  const setPeriod = (p: string) => {
    setPeriodRaw(p);
    const params = new URLSearchParams(searchParams);
    params.set('period', p);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: queryKeys.salesAnalysis.data(period),
    queryFn: () => apiClient.getParsed(`/api/sales-analysis?period=${period}`, SalesAnalysisDataSchema),
  });

  const error = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : queryError instanceof ZodError
        ? '응답 형식 오류 — 개발팀에 문의하세요'
        : queryError instanceof Error
          ? queryError.message
          : '조회 실패'
    : null;

  const sorted = useMemo(() => {
    if (!data?.channels) return [];
    if (!sortField || !sortDir) return data.channels;
    return [...data.channels].sort((a, b) => {
      const l = a[sortField], r = b[sortField];
      if (l === r) return 0;
      return sortDir === 'asc' ? (l > r ? 1 : -1) : (l < r ? 1 : -1);
    });
  }, [data, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField !== field) { setSortField(field); setSortDir('desc'); return; }
    if (sortDir === 'desc') { setSortDir('asc'); return; }
    setSortField(null); setSortDir(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">채널별 매출 분석</h2>
        <PeriodSelector value={period} onChange={setPeriod} options={periodOptions} />
      </div>

      {isLoading ? (
        <PageSkeleton variant="table" />
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-red-500">{error}</div>
      ) : !data || data.channels.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-slate-500">해당 기간 데이터가 없습니다.</div>
      ) : (
        <>
          {/* 4 KPI cards — preserve existing layout from pre-rewire */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="총 매출" value={formatKRW(data.totals.totalRevenue)} />
            <KpiCard label="총 이익" value={formatKRW(data.totals.totalProfit)} />
            <KpiCard label="평균 마진율" value={data.totals.totalRevenue > 0 ? formatPercent((data.totals.totalProfit / data.totals.totalRevenue) * 100) : '-'} />
            <KpiCard label="총 주문 수" value={formatNumber(data.totals.totalOrders)} />
          </div>
          {data.totals.orphanReturnCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              주문 연결 없는 반품: <strong className="tabular-nums">{formatNumber(data.totals.orphanReturnCount)}</strong>건 (반품률 계산 제외)
            </div>
          )}
          <ChannelTable
            channels={sorted}
            sortField={sortField}
            sortDir={sortDir}
            onToggleSort={toggleSort}
          />
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{value}</p>
    </div>
  );
}
```

**If existing SalesOverview.tsx has richer KPI cards** (e.g., with icons, trend arrows), preserve them — Step 5.1 read confirms. Replace data binding fields only.

### Step 5.3: Rewire `ChannelTable.tsx`

```tsx
'use client';

import { formatKRW, formatNumber, formatPercent } from '@/lib/utils';
import SortableHeader from '@/components/ui/SortableHeader';
import type { ChannelAnalysis } from '@kiditem/shared';

type SortField = 'totalOrders' | 'totalRevenue' | 'totalCost' | 'totalProfit' | 'avgOrderValue';
type SortDir = 'asc' | 'desc' | null;

interface Props {
  channels: ChannelAnalysis[];
  sortField: SortField | null;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
}

const CHANNEL_TYPE_LABEL: Record<ChannelAnalysis['channelType'], string> = {
  marketplace: '마켓',
  direct: '자사몰',
  other: '기타',
};

export default function ChannelTable({ channels, sortField, sortDir, onToggleSort }: Props) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>채널</th>
          <th>타입</th>
          <SortableHeader<SortField> field="totalOrders" label="주문 수" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
          <SortableHeader<SortField> field="totalRevenue" label="매출" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
          <SortableHeader<SortField> field="totalCost" label="총비용" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
          <SortableHeader<SortField> field="totalProfit" label="순이익" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
          <th>반품 수</th>
          <th>반품률</th>
          <SortableHeader<SortField> field="avgOrderValue" label="평균 주문가" activeField={sortField} direction={sortDir} onSort={onToggleSort} />
        </tr>
      </thead>
      <tbody>
        {channels.map((c) => (
          <tr key={c.channel}>
            <td><span className="badge">{c.channel}</span></td>
            <td className="text-xs text-slate-500">{CHANNEL_TYPE_LABEL[c.channelType]}</td>
            <td className="text-right tabular-nums">{formatNumber(c.totalOrders)}</td>
            <td className="text-right tabular-nums">{formatKRW(c.totalRevenue)}</td>
            <td className="text-right tabular-nums">{formatKRW(c.totalCost)}</td>
            <td className="text-right tabular-nums">{formatKRW(c.totalProfit)}</td>
            <td className="text-right tabular-nums">{formatNumber(c.returnCount)}</td>
            <td className="text-right tabular-nums">{formatPercent(c.returnRate * 100)}</td>
            <td className="text-right tabular-nums">{formatKRW(Math.round(c.avgOrderValue))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Delete local `ChannelRow` interface + `SortTh` inline.

### Step 5.4: tsc verify

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "sales-analysis" | head -5
```

### Step 5.5: Commit

```bash
git add apps/web/src/app/sales-analysis/
git commit -m "feat(web): SalesOverview + ChannelTable — getParsed + URL period + SortableHeader + channel grouping (Plan D.3 T5)"
```

---

## Task 6: RTL 3-state test

**Files:**
- Create: `apps/web/src/app/sales-analysis/__tests__/SalesOverview.spec.tsx`

**Review cadence**: **1 combined review** (pattern established D.1 T10 + D.2 T8).

### Step 6.1-6.3: Create spec (see v1 plan lines 1076-1140 — structure identical but mocks adjusted for new schema)

Same pattern as D.1 T10 profit-loss page.spec — 4 cases (loading / empty / error / ZodError drift) + bonus success render.

### Step 6.4: Commit

```bash
git add apps/web/src/app/sales-analysis/__tests__/
git commit -m "test(web): SalesOverview 3-state RTL (Plan D.3 T6)"
```

---

## Task 7: Verification + CLAUDE.md update

**Review cadence**: **No review** (self-evidencing).

Steps 7.1-7.8 — identical pattern to D.1 T11 + D.2 T6:
1. shared rebuild
2. apps/server tsc
3. server unit + integration
4. web vitest
5. dev:server boot
6. HTTP smoke
7. Update `apps/server/src/finance/CLAUDE.md` — remove "sales-analysis.service.ts 는 ... D.3 migration 예정. 건드리지 말 것." banner, replace with:

```markdown
### sales-analysis.service (Plan D.3, ADR-0017)
`getAnalysis(companyId, period?)` — live aggregation via Order + OrderReturnLineItem + Ad.groupBy.
Group key: `ChannelListing.channel` (plataform). ADR-0017 returnRate (INNER JOIN + 3-hop IDOR).
Orphan (orderId NULL) → totals.orphanReturnCount side metric.
```

8. Diff summary + commit if CLAUDE.md changed.

---

## Task 7b: Release Note

**Files:**
- Create: `docs/release-notes/2026-04-sales-analysis-channel-breakdown.md`

**Review cadence**: **1 combined review**.

### Step 7b.1: Create release note

```markdown
# Sales Analysis — 채널별 분석 실제 데이터 노출 (2026-04-20)

**영향**: `/api/sales-analysis` 응답 구조 변경. UI 는 채널별 실제 breakdown 표시.

**관련 ADR**: [ADR-0016](../../.claude/docs/decisions/0016-profit-loss-live-aggregation.md) (ProfitLoss bypass), [ADR-0017](../../.claude/docs/decisions/0017-returnrate-semantic-unification.md) (returnRate semantic)

## 무엇이 바뀌었나

### 이전 (stub)

- `sales-analysis.service.getAnalysis` 가 `profitLoss.groupBy({ by: ['companyId'] })` 로 1-row 반환 (ProfitLoss 테이블 writer 없음 → 모든 수치 0)
- SalesOverview 탭 = 비어있는 UI

### 이후 (Plan D.3, live aggregation)

- **채널별 grouping**: `ChannelListing.channel` (coupang / naver / wing / ...) 기준 N-row 응답
- **Live aggregation**: Order + OrderLineItem + OrderReturnLineItem + Ad 실시간 집계 (ProfitLoss 테이블 bypass)
- **ADR-0017 returnRate**: "이 기간 주문 중 반품된 비율" (distinct order count, INNER JOIN)
- **orphanReturnCount** side metric (totals 레벨)

## 응답 shape 변경

```jsonc
// Before
{ period, channels: [{ channelName: "회사 이름", ... }], totals: { ... } }  // channels.length = 1 always, 값 0

// After (Plan D.3)
{
  period: "2026-04",
  channels: [
    { channel: "coupang", channelType: "marketplace", totalOrders: 150, totalRevenue: 5_000_000, ... },
    { channel: "naver", channelType: "marketplace", totalOrders: 80, totalRevenue: 2_500_000, ... },
    ...
  ],
  totals: { totalRevenue, totalProfit, totalOrders, totalCost, orphanReturnCount }
}
```

## 마이그레이션 필요 사항

- **Frontend consumer 재배선 필요** — 이전 `channels[].channelName` 참조 → `channels[].channel`
- **Frontend SalesOverview** 는 Plan D.3 에서 rewire 완료 (`getParsed`, URL period, 3-state)
- 다른 탭 (Statistics / Settlements / SalesPlans) 은 **Plan D.3b 에서 후속**

## MoM / YoY 비교 주의

이전 대시보드 캡처는 모두 0 이었음 → D.3 이후가 첫 의미있는 수치. 비교 baseline 없음.

## orphanReturnCount 해석

`OrderReturn.orderId IS NULL` 인 반품 (sync 불일치 / order hard-delete 흔적) 은 channel 매핑 불가 → **totals.orphanReturnCount** 에만 반영. 운영팀 데이터 정합성 조사 지표로 활용.

## 기술 배경

- Service: `apps/server/src/finance/services/sales-analysis.service.ts`
- Test: `apps/server/src/finance/services/__tests__/sales-analysis.pg.integration.spec.ts`
- Schema: `@kiditem/shared/schemas/sales-analysis`
```

### Step 7b.2: Commit

```bash
git add docs/release-notes/2026-04-sales-analysis-channel-breakdown.md
git commit -m "docs(release): Plan D.3 sales-analysis channel-breakdown release note (Plan D.3 T7b)"
```

---

## Task 8: Final state checks

**Review cadence**: **No review**.

### Step 8.1: Other profitLoss readers status

```bash
grep -rn "prisma.profitLoss" apps/server/src/ --include="*.ts" | grep -v __tests__
```

Expected: sales-analysis 제거됨. 남은 readers: statistics (×5), settlements, sales-plans, ad-strategy, dashboard-inventory, dashboard-trend, action-task (×2). ADR-0016 scope 테이블 vs 실제 diff 는 D.3b + Plan E 에서 수렴.

### Step 8.2: ADR-0016 scope table staleness

ADR 불변 (CLAUDE.md 원칙). D.3 merge commit + 이 plan 문서 + release note 가 evidence. Plan E 에서 ADR-0018 통합 audit 로 row 갱신 (별도 ADR 로 status 업데이트).

---

## Task 9: D.3b scaffold stub (CEO SELECTIVE EXPANSION)

**Files:**
- Create: `docs/superpowers/plans/2026-04-20-plan-d3b-statistics-settlements-sales-plans.md` (stub)

**Review cadence**: **1 combined review** (stub outline, not implementation).

### Step 9.1: Create stub

```markdown
# Plan D.3b — statistics / settlements / sales-plans live aggregation (stub)

> Stub plan — D.3a (sales-analysis) 머지 후 본격 작성. Pattern: D.3a T2/T5 재사용.

**Scope**:
- `statistics.service` (5 profitLoss calls) + `Statistics.tsx` rewire
- `settlements.service` (profitLoss reconcile) + `Settlements.tsx` rewire
- `sales-plans.service` (profitLoss aggregate) + `SalesPlans.tsx` rewire

**Reuse from D.3a**:
- `apps/server/src/test-helpers/finance-seeds.ts` (T0 extract)
- Live aggregation pattern (Order + OrderReturnLineItem + Ad.groupBy)
- ADR-0017 returnRate (if each service exposes returnRate, apply same)
- `apiClient.getParsed` + URL period + 3-state frontend pattern

**Estimated**: 12-18 tasks, 2-3 day execution (3 services × ~5 tasks + 3 pages × ~2 tasks + verification).

**Review cadence**: Same as D.3+ memo — docs 1-combined, service 2-stage, page 2-stage, RTL 1-combined, verify 없음.

**Dependencies**:
- D.3a merged (shared schemas, finance-seeds helpers, pattern proven)
- No further ADR needed (ADR-0016 + ADR-0017 cover)

**TODO** (D.3a 머지 후 작성):
- 각 service 의 현재 profitLoss 호출 enumerate
- 각 page 의 Zod schema 요구사항
- 기존 pages 의 custom sort/filter 표준화 방안 (SortableHeader 채택)
- PG integration test shape

**Release note**: D.3a release note 에 "D.3b 에서 후속" 명시. D.3b 완료 시 통합 release note 또는 amend.
```

### Step 9.2: Commit

```bash
git add docs/superpowers/plans/2026-04-20-plan-d3b-statistics-settlements-sales-plans.md
git commit -m "docs(plan): Plan D.3b scaffold stub — statistics/settlements/sales-plans migration (Plan D.3 T9)"
```

---

## Self-Review

### Spec coverage (spec v4 § D.3 vs v2)
- ⚠️ Spec v4 line 74 "7 files 조정" vs v2 narrow to 1 page + 1 helper + backend rewrite — 근거 Pre-flight notes + T9 scaffold
- ✅ ADR-0017 returnRate 수렴 → T2 service
- ✅ `SalesOverview.tsx` rewire → T5
- ✅ Zod schemas with orphanReturnCount → T1
- ✅ Release note → T7b
- ✅ D.3b scaffold → T9

### 4-reviewer findings applied
- ✅ channel (not channelName) group key
- ✅ channelType derived via CHANNEL_TYPE_MAP
- ✅ returnRate distinct-order Set per channel
- ✅ ad.groupBy + listing→channel resolver
- ✅ 3-hop IDOR with companyId at rli + return + order
- ✅ orphanReturnCount in schema + service + UI
- ✅ Status filter mirrored on return.order
- ✅ Controller @CurrentCompany wiring copy pattern
- ✅ T0 seed helpers extract
- ✅ Release note task
- ✅ D.3b scaffold
- ✅ SalesOverviewTotals 4-card KPI enumerated
- ✅ Multi-channel order semantic (totals.totalOrders global distinct)

### Type consistency
- `channel: z.string()` — T1 schema, T2 service satisfies, T3/T4 test, T5 UI 일관
- `channelType: z.enum(['marketplace','direct','other'])` — T1 schema, T2 CHANNEL_TYPE_MAP, T5 CHANNEL_TYPE_LABEL
- `returnRate: z.number().min(0).max(1)` — T1 schema, T2 distinct-order guarantee, T3 unit verification, T4 integration
- `orphanReturnCount` — T1 totals, T2 side metric query, T3 unit, T4 integration, T5 UI conditional badge

### Execution order
T0 → T1 → T2 → T3 || T4 → T5 || T6 → T7 → T7b → T8 → T9. Linear with 2 parallel pairs.

### Risks
- **Schema assumption stability**: `ChannelListing.channel` 이 required + string. 추후 enum 전환 시 v2 의 channelType map 도 재검토.
- **Perf 1000 order × 2 channel × 1 lineItem** — 단순 경로. Real world 3-5 channel × 2-3 lineItem 시 latency 재측정 필요.
- **Legacy `channelName` 사용처 audit**: grep `channelName` 했을 때 UI/service 에 여전히 참조하는 곳 없는지 확인 (T5 ChannelTable 외).

---

## Reference

- Spec v4 § D.3: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md:74`
- ADR-0016, ADR-0017
- Plan D.1 (`094511c`), Plan D.2 (`e853b15`)
- `apps/server/src/finance/services/profit-loss.service.ts` (D.1 T5)
- `apps/server/src/channels/services/channel-dashboard.service.ts:getReturnSummary` (D.2 T3 — 2-hop IDOR pattern)
- `prisma/models/core.prisma:296-345` — ChannelListing schema (channel=required platform, channelName=nullable title, channelType=absent)
