# Plan B2c.orders — Orders domain lineItem rewire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended for focused tasks) OR `TeamCreate` 4-teammate pattern (for parallel work). Steps use checkbox (`- [ ]`) syntax for tracking. Plan 실행 pattern 은 user 최종 결정.

**Goal:** A.5 + B2a + B2b + B2b.refactor 이후 `orders/services/cs` / `statistics` / `supplier-stats` / `settlements` / `sales-plans` 5 service 의 stale schema 참조 (73+ tsc errors) 를 새 schema (Order/OrderLineItem/ProfitLoss listingId / SupplierProduct.optionId / MasterSupplierProduct.masterId) 기반으로 재작성. **dev:server 부팅은 non-goal** (B2c.dashboard 이연).

**Architecture:** (1) 공통 util 먼저 (`LISTING_WITH_MASTER_SELECT_EXTENDED` + `kstMonthStart`). (2) cs (단일 DTO backward compat). (3) statistics 7 methods (overview/products/categories/delivery/grades/pareto/repurchase) — ProfitLoss/listing 기반 5 + OrderLineItem 기반 2. (4) supplier-stats 3 methods — optionId groupBy chunked. (5) settlements + sales-plans — $queryRaw + IDOR fix + KST boundary. (6) `@kiditem/shared` PLDataSchema 재작성. (7) 3-tier test: unit + integration real-Postgres.

**v1 → v2 post-review 수정** (plan-eng-review 반영, 2026-04-19):
- T8 $queryRaw: `SUM::int` → `::bigint` + `Number()` 변환 (int32 overflow 방지, 대형 셀러 월 매출 >21억 KRW 가능).
- T13: sales-plans-flow integration **optional → required** (IDOR 3건 regression 방어).
- T12: CHUNK 경계 테스트 + `listingOption: null` / `receiverName: null` 케이스 추가.

**Tech Stack:** NestJS 11 + Prisma v7 (multi-file) + Zod + `@kiditem/shared` (`satisfies`) + class-validator DTO + vitest + real-Postgres integration (`makeTestPrisma` + `resetDb` + `seedBaseFixture`).

**Spec:** [docs/superpowers/specs/2026-04-19-plan-b2c-orders-domain-rewire-design.md](../specs/2026-04-19-plan-b2c-orders-domain-rewire-design.md) (v2.1 — 3-reviewer + critic re-review PASS)

**Branch:** `feat/plan-b2c-orders` (new from `origin/main` @ `d06b3cc`)

**Tests 전체 tier**:
- Unit (`src/{domain}/__tests__/*.spec.ts`): vitest mock PrismaService. 서비스 behavior.
- Controller e2e (`src/{domain}/__tests__/{domain}.controller.spec.ts`): `Test.createTestingModule` + middleware mock `req.authUser`.
- Integration (`src/{domain}/__tests__/{domain}-flow.pg.integration.spec.ts`): real Postgres via `makeTestPrisma` + `resetDb` + `seedBaseFixture` + 도메인 fixture.
  - Test helper import: `import { makeTestPrisma, resetDb, seedBaseFixture, TEST_COMPANY_ID, OTHER_COMPANY_ID } from '../../test-helpers/real-prisma';` (actual path: `apps/server/src/test-helpers/real-prisma.ts`).

---

## Pre-flight

- [ ] Branch 생성: `git checkout -b feat/plan-b2c-orders`
- [ ] 환경 sync: `npm install --legacy-peer-deps && npm run db:push && npx prisma generate && npm run db:3layer-setup && cd packages/shared && npm run build`
- [ ] 베이스라인 측정: `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/(orders/services/cs|statistics|supplier-stats|settlements|sales-plans)"` → **exactly 73** (critic 검증 완료). Post-T13 target: 0.

---

## T1 — Common util 추출 (listing-select + kstMonthStart)

**Files:**
- `apps/server/src/common/listing-select.ts` (신규)
- `apps/server/src/common/kst.ts` (확장)

**Steps:**

- [ ] Step 1.1: `apps/server/src/common/listing-select.ts` 작성

```ts
import type { Prisma } from '@prisma/client';

/**
 * ChannelListing hydrate — master + category + grade + thumbnail 포함.
 * B2c 의 statistics/settlements 공통 사용. supplier-stats 는 별도 prisma 쿼리 (optionId join).
 * B2b 의 LISTING_SUMMARY_SELECT (advertising/services/types.ts) 와는 별도 유지 — advertising 축소 버전.
 */
export const LISTING_WITH_MASTER_SELECT_EXTENDED = {
  id: true,
  externalId: true,
  channel: true,
  channelName: true,
  isDeleted: true,
  master: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      abcGrade: true,
      thumbnailUrl: true,
    },
  },
} as const satisfies Prisma.ChannelListingSelect;
```

- [ ] Step 1.2: `apps/server/src/common/kst.ts` 에 `kstMonthStart` 추가

```ts
/**
 * Returns the UTC Date that equals '{year}-{month}-01 00:00:00+09:00' (KST midnight).
 * month 는 1-12. month === 13 은 다음해 1월로 wrap (reconcile 의 periodEnd 용).
 */
export function kstMonthStart(year: number, month: number): Date {
  const y = month === 13 ? year + 1 : year;
  const m = month === 13 ? 1 : month;
  return new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
}
```

**Verification:**
- `cd apps/server && npx tsc --noEmit src/common/listing-select.ts src/common/kst.ts` → 0 errors.
- `grep -rn "LISTING_WITH_MASTER_SELECT_EXTENDED\|kstMonthStart" apps/server/src` → 신규 파일에서만 매치.

**DM to reviewers:** "T1 common util — listing-select + kstMonthStart 추가. tsc 통과. 다음 T2."

---

## T2 — cs.service + DTO backward compat + controller

**Files:**
- `apps/server/src/orders/dto/create-cs.dto.ts`
- `apps/server/src/orders/services/cs.service.ts`
- `apps/server/src/orders/__tests__/cs.service.spec.ts` (신규 또는 갱신)

**Steps:**

- [ ] Step 2.1: `CreateCsBodyDto` 업데이트 (productId deprecated alias → listingId)

```ts
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCsBodyDto {
  @IsString() csType!: string;
  @IsString() content!: string;

  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() assignee?: string;

  @IsOptional() @IsUUID() orderId?: string;

  @IsOptional() @IsUUID() listingId?: string;

  /** @deprecated Legacy frontend alias — will be removed after Plan D frontend rewire. */
  @IsOptional()
  @IsUUID()
  @Transform(({ value, obj }) => {
    // productId 수신 시 listingId 로 매핑 (listingId 없는 경우만)
    if (value && !obj.listingId) obj.listingId = value;
    return value;
  })
  productId?: string;
}
```

- [ ] Step 2.2: `CsService.create` 시그니처 유지 (이미 `listingId?: string` 로 받을 수 있게)

```ts
async create(
  data: {
    csType: string;
    content: string;
    priority?: string;
    assignee?: string;
    orderId?: string;
    listingId?: string;
    productId?: string;  // deprecated — Transform 이 listingId 로 이미 복사
  },
  companyId: string,
) {
  const resolvedListingId = data.listingId ?? data.productId ?? null;
  return this.prisma.cSRecord.create({
    data: {
      companyId,
      csType: data.csType,
      content: data.content,
      priority: data.priority ?? 'normal',
      assignee: data.assignee || null,
      orderId: data.orderId || null,
      listingId: resolvedListingId,
      csStatus: '접수',
    },
  });
}
```

- [ ] Step 2.3: Unit test `cs.service.spec.ts` 갱신

```ts
describe('CsService.create', () => {
  it('creates with listingId', async () => { /* ... */ });
  it('creates with legacy productId alias (mapped to listingId)', async () => { /* ... */ });
  it('prefers listingId over productId when both provided', async () => { /* ... */ });
  it('creates without listing association when neither provided', async () => { /* ... */ });
});
```

- [ ] Step 2.4: DTO validation e2e 스폿체크

**Verification:**
- `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/orders/(services/cs|dto/create-cs)"` → 0.
- `npx vitest run src/orders/__tests__/cs.service.spec.ts` → PASS.

**DM:** "T2 cs.service — DTO backward compat + service resolve 완료. Unit 4/4. 다음 T3."

---

## T3 — statistics.overview + products rewrite

**Files:**
- `apps/server/src/statistics/statistics.service.ts`
- `apps/server/src/statistics/__tests__/statistics.service.spec.ts`

**Steps:**

- [ ] Step 3.1: `overview(companyId, period?)` — `prisma.product.count` → `prisma.masterProduct.count`

```ts
const [agg, totalProducts] = await Promise.all([
  this.prisma.profitLoss.aggregate({
    where: plWhere,
    _sum: { revenue: true, netProfit: true, orderCount: true },
  }),
  this.prisma.masterProduct.count({
    where: { companyId, isDeleted: false },
  }),
]);
// 나머지 동일
```

- [ ] Step 3.2: `products(companyId, period?)` — ProfitLoss.include.listing + LISTING_WITH_MASTER_SELECT_EXTENDED

```ts
import { LISTING_WITH_MASTER_SELECT_EXTENDED } from '../common/listing-select';

async products(companyId: string, period?: string) {
  const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };

  const records = await this.prisma.profitLoss.findMany({
    where: plWhere,
    include: { listing: { select: LISTING_WITH_MASTER_SELECT_EXTENDED } },
    orderBy: { revenue: 'desc' },
  });

  return records.map((r) => ({
    listingId: r.listingId,
    externalId: r.listing.externalId,
    channelName: r.listing.channelName,
    masterId: r.listing.master.id,
    masterCode: r.listing.master.code,
    productName: r.listing.master.name,
    category: r.listing.master.category,
    grade: r.listing.master.abcGrade,
    thumbnailUrl: r.listing.master.thumbnailUrl,
    totalRevenue: r.revenue,
    netProfit: r.netProfit,
    orderCount: r.orderCount,
    profitRate: r.revenue > 0 ? Math.round((r.netProfit / r.revenue) * 10000) / 10000 : 0,
    margin: r.revenue > 0 ? Math.round((r.netProfit / r.revenue) * 10000) / 10000 : 0,
  }));
}
```

- [ ] Step 3.3: Unit tests — overview totalProducts count, products listingId-based response.

**Verification:**
- `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/statistics/statistics\\.service"` → T3 후 감소 (overview+products 부분만).
- Unit 해당 메서드만 PASS.

**DM:** "T3 statistics overview+products — tsc 해당 메서드 0, Unit PASS. 다음 T4."

---

## T4 — statistics.categories + grades + pareto rewrite

**Files:** `statistics/statistics.service.ts` + 동일 spec.

**Steps:**

- [ ] Step 4.1: `categories()` — ProfitLoss.listing.master.category 기준 그룹.

```ts
async categories(companyId: string, period?: string) {
  const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };
  const records = await this.prisma.profitLoss.findMany({
    where: plWhere,
    include: { listing: { select: { master: { select: { category: true } } } } },
  });
  const categoryMap = new Map<string, { revenue: number; orders: number; profit: number }>();
  for (const r of records) {
    const cat = r.listing.master.category ?? '미분류';
    const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profit: 0 };
    entry.revenue += r.revenue; entry.orders += r.orderCount; entry.profit += r.netProfit;
    categoryMap.set(cat, entry);
  }
  return Array.from(categoryMap.entries()).map(([category, data]) => ({
    category, name: category, ...data, count: data.orders,
  })).sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] Step 4.2: `grades()` — abcGrade 그룹.

```ts
async grades(companyId: string, period?: string) {
  const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };
  const records = await this.prisma.profitLoss.findMany({
    where: plWhere,
    include: { listing: { select: { master: { select: { abcGrade: true } } } } },
  });
  const gradeMap = new Map<string, { revenue: number; profit: number; productCount: number; adCost: number }>();
  for (const r of records) {
    const grade = r.listing.master.abcGrade ?? 'N/A';
    const entry = gradeMap.get(grade) ?? { revenue: 0, profit: 0, productCount: 0, adCost: 0 };
    entry.revenue += r.revenue; entry.profit += r.netProfit; entry.productCount += 1; entry.adCost += r.adCost;
    gradeMap.set(grade, entry);
  }
  return Array.from(gradeMap.entries()).map(([grade, data]) => ({
    grade, revenue: data.revenue, profit: data.profit,
    count: data.productCount, productCount: data.productCount, adCost: data.adCost,
  })).sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] Step 4.3: `pareto()` — listing + master 기준 cumulative.

```ts
async pareto(companyId: string, period?: string) {
  const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };
  const records = await this.prisma.profitLoss.findMany({
    where: plWhere,
    include: { listing: { select: { id: true, master: { select: { id: true, name: true, abcGrade: true } } } } },
    orderBy: { revenue: 'desc' },
  });
  const totalRevenue = records.reduce((sum, r) => sum + r.revenue, 0);
  let cumulativeRevenue = 0;
  const fullParetoItems = records.map((r, index) => {
    cumulativeRevenue += r.revenue;
    const revenuePercent = totalRevenue > 0 ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0;
    const cumulativePercent = totalRevenue > 0 ? Math.round((cumulativeRevenue / totalRevenue) * 1000) / 10 : 0;
    const currentGrade = r.listing.master.abcGrade ?? 'N/A';
    const suggestedGrade = cumulativePercent <= 70 ? 'A' : cumulativePercent <= 90 ? 'B' : 'C';
    return {
      id: r.listingId, rank: index + 1, name: r.listing.master.name,
      currentGrade, suggestedGrade, gradeMatch: currentGrade === suggestedGrade,
      revenue: r.revenue, revenuePercent, cumulativePercent,
    };
  });
  const gradeDistribution = { A: 0, B: 0, C: 0 };
  for (const item of fullParetoItems) {
    const g = item.currentGrade as 'A' | 'B' | 'C';
    if (g in gradeDistribution) gradeDistribution[g] += 1;
  }
  const mismatchCount = fullParetoItems.filter((item) => !item.gradeMatch).length;
  return { totalRevenue, gradeDistribution, mismatchCount, data: fullParetoItems };
}
```

- [ ] Step 4.4: Unit tests — 3 메서드.

**Verification:**
- tsc scope 감소.
- Unit PASS.

**DM:** "T4 statistics categories/grades/pareto 완료. 다음 T5."

---

## T5 — statistics.delivery rewrite (Order.lineItems include)

**Steps:**

- [ ] Step 5.1: `delivery()` 에서 Order.quantity → Order.lineItems.quantity reduce

```ts
const dailyOrders = await this.prisma.order.findMany({
  where: {
    companyId,
    orderedAt: { gte: thirtyDaysAgo, lte: now },
    status: { notIn: ['cancelled', 'returned'] },
  },
  select: {
    orderedAt: true,
    totalPrice: true,
    lineItems: { select: { quantity: true } },
  },
});

const orderDailyMap = new Map<string, { orders: number; revenue: number; qty: number }>();
for (const o of dailyOrders) {
  if (!o.orderedAt) continue;
  const key = o.orderedAt.toISOString().slice(0, 10);
  const entry = orderDailyMap.get(key) ?? { orders: 0, revenue: 0, qty: 0 };
  entry.orders += 1;
  entry.revenue += o.totalPrice ?? 0;
  entry.qty += o.lineItems.reduce((s, li) => s + li.quantity, 0);
  orderDailyMap.set(key, entry);
}
```

- [ ] Step 5.2: Unit test — daily qty = lineItems sum 검증.

**Verification:**
- tsc `delivery()` 관련 errors 0.
- Unit PASS.

**DM:** "T5 statistics.delivery 완료. 다음 T6."

---

## T6 — statistics.repurchase rewrite (master-level grouping, Option Y)

**Steps:**

- [ ] Step 6.1: `repurchase()` 완전 재작성

```ts
async repurchase(companyId: string, period?: string) {
  const whereOrder: Prisma.OrderWhereInput = { companyId, status: { notIn: ['cancelled', 'returned'] } };
  if (period) {
    const [year, month] = period.split('-').map(Number);
    whereOrder.orderedAt = { gte: kstMonthStart(year, month), lt: kstMonthStart(year, month + 1) };
  }

  // customer-level aggregate (receiver 기반) — 기존 동작 유지
  const orders = await this.prisma.order.findMany({
    where: whereOrder,
    select: { receiverName: true, totalPrice: true, orderedAt: true },
  });

  // master-level repeat products — lineItem 경유
  const lines = await this.prisma.orderLineItem.findMany({
    where: {
      order: whereOrder,
      listingOptionId: { not: null },
    },
    select: {
      order: { select: { receiverName: true } },
      listingOption: {
        select: {
          listing: {
            select: {
              masterId: true,
              master: { select: { name: true, category: true } },
            },
          },
        },
      },
    },
  });

  const masterMap = new Map<string, { productName: string; category: string | null; customers: Set<string>; orderCount: number }>();
  for (const l of lines) {
    const mid = l.listingOption?.listing?.masterId;
    if (!mid) continue;
    const entry = masterMap.get(mid) ?? {
      productName: l.listingOption?.listing?.master.name ?? '',
      category: l.listingOption?.listing?.master.category ?? null,
      customers: new Set<string>(),
      orderCount: 0,
    };
    if (l.order.receiverName) entry.customers.add(l.order.receiverName);
    entry.orderCount += 1;
    masterMap.set(mid, entry);
  }

  const repeatProducts = Array.from(masterMap.entries())
    .filter(([, v]) => v.customers.size >= 2)
    .sort((a, b) => b[1].orderCount - a[1].orderCount)
    .slice(0, 20)
    .map(([masterId, v]) => ({
      masterId,              // productId → masterId shape 변경
      productName: v.productName,
      category: v.category,
      orderCount: v.orderCount,
    }));

  // customer-level (receiver) — 기존 로직 유지
  const receiverMap = new Map<string, { count: number; totalAmount: number; lastOrder: Date | null }>();
  for (const o of orders) {
    const name = o.receiverName ?? '';
    if (!name) continue;
    const entry = receiverMap.get(name) ?? { count: 0, totalAmount: 0, lastOrder: null };
    entry.count += 1;
    entry.totalAmount += o.totalPrice ?? 0;
    if (!entry.lastOrder || (o.orderedAt && o.orderedAt > entry.lastOrder)) entry.lastOrder = o.orderedAt;
    receiverMap.set(name, entry);
  }

  const totalCustomers = receiverMap.size;
  const repeatCustomerCount = Array.from(receiverMap.values()).filter((c) => c.count >= 2).length;
  const repurchaseRate = totalCustomers > 0 ? Math.round((repeatCustomerCount / totalCustomers) * 10000) / 10000 : 0;
  const repeatCustomers = Array.from(receiverMap.entries())
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([name, v]) => ({ name, count: v.count, totalAmount: v.totalAmount, lastOrder: v.lastOrder }));

  return {
    totalCustomers,
    repeatCount: repeatCustomerCount,
    repurchaseRate,
    totalOrders: orders.length,
    repeatProducts,
    repeatCustomers,
  };
}
```

- [ ] Step 6.2: Unit test — 3 master × 2 option × 5 lineItem, 2 receiver 재구매 시나리오.

- [ ] Step 6.3: `buildPeriodFilter()` → `kstMonthStart` 사용으로 갱신. **주의**: 현재 caller 없음 (delivery 는 inline 30일 window, repurchase 는 inline). 잔여 helper 유지 + T5 delivery refactor 시 주석 참조 용으로만. **또는 삭제** (recommended — dead code).

Recommendation (critic CP-04): T6 Step 6.3 을 **삭제** 하고 `buildPeriodFilter` 도 제거. 대신 `kstMonthStart` 는 repurchase 의 inline 사용만 유지. delivery 의 30일 rolling window 는 day 단위라 월 경계 미관련.

**Verification:**
- `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/statistics"` → 0.
- Unit PASS.

**DM:** "T6 statistics.repurchase (master-level) + buildPeriodFilter KST 완료. statistics scope 0 errors. 다음 T7."

---

## T7 — supplier-stats.service rewrite (3 methods, optionId groupBy chunked)

**Files:**
- `apps/server/src/supplier-stats/supplier-stats.service.ts`
- `apps/server/src/supplier-stats/__tests__/supplier-stats.service.spec.ts`

**Steps:**

- [ ] Step 7.1: `getSalesBySupplier(companyId)` 재작성 — SupplierProduct.optionId + MasterSupplierProduct.masterId → ProductOption → OrderLineItem.optionId groupBy (chunked)

```ts
async getSalesBySupplier(companyId: string) {
  // 1) Supplier 와 양쪽 매핑 조회
  const suppliers = await this.prisma.supplier.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      supplierProducts: { select: { optionId: true } },
      masterSupplierProducts: { select: { masterId: true } },
    },
  });

  // 2) MasterSupplierProduct 경유 — masterId → ProductOption[] 매핑
  const masterIds = Array.from(new Set(
    suppliers.flatMap((s) => s.masterSupplierProducts.map((m) => m.masterId)),
  ));
  const optionsByMasterId = new Map<string, string[]>();
  if (masterIds.length > 0) {
    const options = await this.prisma.productOption.findMany({
      where: { masterId: { in: masterIds }, isDeleted: false },
      select: { id: true, masterId: true },
    });
    for (const o of options) {
      const arr = optionsByMasterId.get(o.masterId) ?? [];
      arr.push(o.id);
      optionsByMasterId.set(o.masterId, arr);
    }
  }

  // 3) 모든 optionId 수집 (chunk for >1000)
  const allOptionIds = new Set<string>();
  for (const s of suppliers) {
    for (const sp of s.supplierProducts) allOptionIds.add(sp.optionId);
    for (const msp of s.masterSupplierProducts) {
      for (const oid of optionsByMasterId.get(msp.masterId) ?? []) allOptionIds.add(oid);
    }
  }

  const orderStatsByOptionId = new Map<string, { totalOrders: number; totalQuantity: number; totalRevenue: number }>();
  if (allOptionIds.size > 0) {
    const CHUNK = 1000;
    const idArray = Array.from(allOptionIds);
    for (let i = 0; i < idArray.length; i += CHUNK) {
      const chunk = idArray.slice(i, i + CHUNK);
      const grouped = await this.prisma.orderLineItem.groupBy({
        by: ['optionId'],
        where: {
          optionId: { in: chunk },
          order: { companyId, status: { notIn: ['cancelled', 'returned'] } },
        },
        _count: { _all: true },
        _sum: { quantity: true, totalPrice: true },
      });
      for (const g of grouped) {
        if (!g.optionId) continue;
        orderStatsByOptionId.set(g.optionId, {
          totalOrders: g._count._all,
          totalQuantity: g._sum.quantity ?? 0,
          totalRevenue: g._sum.totalPrice ?? 0,
        });
      }
    }
  }

  // 4) supplier 별 집계 — 중복 optionId 방지
  return suppliers.map((supplier) => {
    const counted = new Set<string>();
    let totalOrders = 0, totalRevenue = 0, totalQuantity = 0;
    const addFromOption = (optionId: string) => {
      if (counted.has(optionId)) return;
      counted.add(optionId);
      const stats = orderStatsByOptionId.get(optionId);
      if (!stats) return;
      totalOrders += stats.totalOrders;
      totalRevenue += stats.totalRevenue;
      totalQuantity += stats.totalQuantity;
    };
    for (const sp of supplier.supplierProducts) addFromOption(sp.optionId);
    for (const msp of supplier.masterSupplierProducts) {
      for (const oid of optionsByMasterId.get(msp.masterId) ?? []) addFromOption(oid);
    }
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      productCount: supplier.supplierProducts.length + supplier.masterSupplierProducts.length,
      totalOrders,
      totalQuantity,
      totalRevenue,
    };
  });
}
```

- [ ] Step 7.2: `getProductSales(companyId, supplierId)` 재작성 — SupplierProduct.option + orders include 대신 별도 집계

```ts
async getProductSales(companyId: string, supplierId: string) {
  const [supplierProducts, masterSupplierProducts] = await Promise.all([
    this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: {
        option: {
          select: {
            id: true, sku: true, optionName: true, masterId: true,
            master: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    this.prisma.masterSupplierProduct.findMany({
      where: { supplierId },
      include: {
        master: {
          select: {
            id: true, code: true, name: true,
            options: { where: { isDeleted: false }, select: { id: true, sku: true, optionName: true } },
          },
        },
      },
    }),
  ]);

  // 모든 option id 수집
  const allOptionIds = new Set<string>();
  for (const sp of supplierProducts) allOptionIds.add(sp.optionId);
  for (const msp of masterSupplierProducts) {
    for (const o of msp.master.options) allOptionIds.add(o.id);
  }

  // OrderLineItem.groupBy by optionId (chunked, same as Step 7.1)
  const orderStats = new Map<string, { totalOrders: number; totalQuantity: number; totalRevenue: number }>();
  if (allOptionIds.size > 0) {
    const CHUNK = 1000;
    const arr = Array.from(allOptionIds);
    for (let i = 0; i < arr.length; i += CHUNK) {
      const chunk = arr.slice(i, i + CHUNK);
      const grouped = await this.prisma.orderLineItem.groupBy({
        by: ['optionId'],
        where: {
          optionId: { in: chunk },
          order: { companyId, status: { notIn: ['cancelled', 'returned'] } },
        },
        _count: { _all: true },
        _sum: { quantity: true, totalPrice: true },
      });
      for (const g of grouped) {
        if (!g.optionId) continue;
        orderStats.set(g.optionId, {
          totalOrders: g._count._all,
          totalQuantity: g._sum.quantity ?? 0,
          totalRevenue: g._sum.totalPrice ?? 0,
        });
      }
    }
  }

  const counted = new Set<string>();
  const results: Array<{
    optionId: string;
    sku: string | null;
    optionName: string | null;
    masterId: string;
    masterCode: string;
    masterName: string;
    supplyPrice: number | null;
    minOrderQty: number;
    totalOrders: number;
    totalQuantity: number;
    totalRevenue: number;
  }> = [];

  // SupplierProduct 경로 — supplyPrice 실값
  for (const sp of supplierProducts) {
    counted.add(sp.optionId);
    const stats = orderStats.get(sp.optionId) ?? { totalOrders: 0, totalQuantity: 0, totalRevenue: 0 };
    results.push({
      optionId: sp.optionId,
      sku: sp.option.sku,
      optionName: sp.option.optionName,
      masterId: sp.option.master.id,
      masterCode: sp.option.master.code,
      masterName: sp.option.master.name,
      supplyPrice: sp.supplyPrice,
      minOrderQty: sp.minOrderQty,
      ...stats,
    });
  }

  // MasterSupplierProduct 경로 — supplyPrice null (§spec 5.5)
  for (const msp of masterSupplierProducts) {
    for (const opt of msp.master.options) {
      if (counted.has(opt.id)) continue;
      counted.add(opt.id);
      const stats = orderStats.get(opt.id) ?? { totalOrders: 0, totalQuantity: 0, totalRevenue: 0 };
      results.push({
        optionId: opt.id,
        sku: opt.sku,
        optionName: opt.optionName,
        masterId: msp.master.id,
        masterCode: msp.master.code,
        masterName: msp.master.name,
        supplyPrice: null,          // MasterSupplierProduct 에 supplyPrice 없음
        minOrderQty: msp.minOrderQty,
        ...stats,
      });
    }
  }

  return results;
}
```

- [ ] Step 7.3: `getHistory(companyId, supplierId)` — 변경 없음 (기존 코드가 PurchaseOrder / SupplierPayment 만 참조, schema 영향 없음). 확인만.

- [ ] Step 7.4: Unit tests — 3 메서드 × (happy path / 중복 option / empty). Master path null supplyPrice.

**Verification:**
- `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/supplier-stats"` → 0.
- Unit PASS.

**DM:** "T7 supplier-stats — 3 methods 재작성 + supplyPrice null master-path 반영. tsc 0. Unit PASS. 다음 T8."

---

## T8 — settlements.reconcile + update IDOR + controller

**Files:**
- `apps/server/src/settlements/settlements.service.ts`
- `apps/server/src/settlements/settlements.controller.ts`
- `apps/server/src/settlements/__tests__/settlements.service.spec.ts`

**Steps:**

- [ ] Step 8.1: `reconcile(companyId, period)` 재작성 — $queryRaw + kstMonthStart

```ts
import { LISTING_WITH_MASTER_SELECT_EXTENDED } from '../common/listing-select';
import { kstMonthStart } from '../common/kst';

async reconcile(companyId: string, period: string) {
  const [year, month] = period.split('-').map(Number);
  const periodStart = kstMonthStart(year, month);
  const periodEnd = kstMonthStart(year, month + 1);

  const plRecords = await this.prisma.profitLoss.findMany({
    where: { companyId, year, month },
    include: { listing: { select: LISTING_WITH_MASTER_SELECT_EXTENDED } },
  });

  // total_price ::bigint (int32 overflow — 단일 월 매출이 21억 원 초과 가능. 대형 셀러)
  const rows = await this.prisma.$queryRaw<Array<{
    listing_id: string;
    total_price: bigint;
    order_count: bigint;
  }>>`
    SELECT clo.listing_id AS listing_id,
           SUM(oli.total_price)::bigint AS total_price,
           COUNT(DISTINCT o.id)::bigint  AS order_count
      FROM order_line_items oli
      JOIN channel_listing_options clo ON oli.listing_option_id = clo.id
      JOIN orders o ON oli.order_id = o.id
     WHERE o.company_id = ${companyId}::uuid
       AND o.ordered_at >= ${periodStart}
       AND o.ordered_at <  ${periodEnd}
       AND o.status NOT IN ('cancelled', 'returned')
     GROUP BY clo.listing_id
  `;
  const orderMap = new Map(rows.map((r) => [r.listing_id, { total: Number(r.total_price), count: Number(r.order_count) }]));

  let totalPlRevenue = 0, totalOrderRevenue = 0, matched = 0, mismatched = 0;
  const details = plRecords.map((r) => {
    const od = orderMap.get(r.listingId) ?? { total: 0, count: 0 };
    const revenueDiff = r.revenue - od.total;
    const abs = Math.abs(revenueDiff);
    const status = abs <= 100 ? 'matched' : abs <= 1000 ? 'minor_diff' : 'mismatch';
    totalPlRevenue += r.revenue;
    totalOrderRevenue += od.total;
    if (status === 'matched') matched++; else mismatched++;
    return {
      listingId: r.listingId,
      externalId: r.listing.externalId,
      channelName: r.listing.channelName,
      masterCode: r.listing.master.code,
      masterName: r.listing.master.name,
      plRevenue: r.revenue,
      plCommission: r.commission,
      plNetProfit: r.netProfit,
      plOrderCount: r.orderCount,
      orderTotal: od.total,
      orderCount: od.count,
      revenueDiff,
      isMatched: status === 'matched',
      status,
    };
  });

  return {
    success: true,
    period,
    summary: {
      totalPlRevenue,
      totalOrderRevenue,
      totalCommission: plRecords.reduce((s, r) => s + r.commission, 0),
      totalShipping: plRecords.reduce((s, r) => s + r.shippingCost, 0),
      revenueDifference: totalPlRevenue - totalOrderRevenue,
      productCount: details.length,
      orderCount: rows.reduce((s, r) => s + Number(r.order_count), 0),
      matchedCount: matched,
      mismatchCount: mismatched,
      matchRate: details.length > 0 ? Math.round((matched / details.length) * 100) : 0,
    },
    details,
  };
}
```

- [ ] Step 8.2: `update(id, companyId, dto)` — IDOR fix

```ts
async update(id: string, companyId: string, dto: UpdateSettlementDto) {
  const existing = await this.prisma.settlement.findFirst({
    where: { id, companyId },
  });
  if (!existing) throw new BadRequestException('정산 내역을 찾을 수 없습니다');
  return this.prisma.settlement.update({
    where: { id },
    data: {
      ...(dto.actualAmount !== undefined && { actualAmount: dto.actualAmount }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    },
  });
}
```

- [ ] Step 8.3: `findAll(companyId, period?)` — 현재 OK (companyId 이미 where). 유지.
- [ ] Step 8.4: `create(companyId, dto)` — 현재 OK. 유지.

- [ ] Step 8.5: `settlements.controller.ts` update handler 에 `@CurrentCompany()` 추가

```ts
@Patch(':id')
update(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
  @Body() dto: UpdateSettlementDto,
) {
  return this.settlementsService.update(id, companyId, dto);
}
```

- [ ] Step 8.6: Unit test — reconcile tolerance (±100, ±1000), update IDOR cross-company → BadRequestException.
  - **Mock 업데이트 (critic CP-06/07)**: `makePrisma()` 에 `$queryRaw: vi.fn().mockResolvedValue([])` 추가 (reconcile 이 $queryRaw 사용), 그리고 `settlement` 의 `findUnique` → `findFirst` 로 교체 (update 가 IDOR fix 로 findFirst 호출).
- [ ] Step 8.7: Integration — `int32 overflow` 시나리오: 한 listing 에 totalPrice 합이 2^31 초과 (예: 30 lineItem × 100,000,000 = 3,000,000,000 > 2,147,483,647) — `SUM::bigint` 가 정상 동작하는지 검증.

**Verification:**
- `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/settlements"` → 0.
- Unit PASS.
- `grep -n "findUnique" src/settlements/settlements.service.ts` → 0.

**DM:** "T8 settlements — reconcile $queryRaw + update IDOR fix. tsc 0. 다음 T9."

---

## T9 — sales-plans IDOR 3건 + controller + KST boundary

**Files:**
- `apps/server/src/sales-plans/sales-plans.service.ts`
- `apps/server/src/sales-plans/sales-plans.controller.ts`
- `apps/server/src/sales-plans/__tests__/sales-plans.service.spec.ts`

**Steps:**

- [ ] Step 9.1: Service — `update(id, companyId, dto)`, `syncActuals(id, companyId)`, `delete(id, companyId)` — `findFirst({ where: { id, companyId } })`

```ts
async update(id: string, companyId: string, dto: UpdateSalesPlanDto) {
  const existing = await this.prisma.salesPlan.findFirst({ where: { id, companyId } });
  if (!existing) throw new NotFoundException('판매 계획을 찾을 수 없습니다');
  return this.prisma.salesPlan.update({
    where: { id },
    data: { /* patch fields */ },
  });
}

async syncActuals(id: string, companyId: string) {
  const plan = await this.prisma.salesPlan.findFirst({ where: { id, companyId } });
  if (!plan) throw new NotFoundException('판매 계획을 찾을 수 없습니다');
  const [year, month] = plan.period.split('-').map(Number);
  const periodStart = kstMonthStart(year, month);
  const periodEnd = kstMonthStart(year, month + 1);
  const orderAgg = await this.prisma.order.aggregate({
    where: { companyId, orderedAt: { gte: periodStart, lt: periodEnd }, status: { notIn: ['cancelled', 'returned'] } },
    _sum: { totalPrice: true },
    _count: { id: true },
  });
  const plAgg = await this.prisma.profitLoss.aggregate({
    where: { companyId, year, month },
    _sum: { netProfit: true },
  });
  return this.prisma.salesPlan.update({
    where: { id },
    data: {
      actualRevenue: orderAgg._sum.totalPrice ?? 0,
      actualOrders: orderAgg._count.id,
      actualProfit: plAgg._sum.netProfit ?? 0,
    },
  });
}

async delete(id: string, companyId: string) {
  const existing = await this.prisma.salesPlan.findFirst({ where: { id, companyId } });
  if (!existing) throw new NotFoundException('판매 계획을 찾을 수 없습니다');
  return this.prisma.salesPlan.delete({ where: { id } });
}
```

- [ ] Step 9.2: Controller — 3 handler @CurrentCompany 주입

```ts
@Patch(':id')
update(@Param('id') id: string, @CurrentCompany() companyId: string, @Body() dto: UpdateSalesPlanDto) {
  return this.salesPlansService.update(id, companyId, dto);
}

@Patch(':id/sync')
syncActuals(@Param('id') id: string, @CurrentCompany() companyId: string) {
  return this.salesPlansService.syncActuals(id, companyId);
}

@Delete(':id')
delete(@Param('id') id: string, @CurrentCompany() companyId: string) {
  return this.salesPlansService.delete(id, companyId);
}
```

- [ ] Step 9.3: `create` — 기존 findUnique compound key (companyId_period) 유지. 변경 없음.

- [ ] Step 9.4: Unit test — IDOR cross-company → NotFoundException, KST 월 경계 검증 (2026-04-30 23:30 KST order 가 April 에 집계).

**Verification:**
- `cd apps/server && npx tsc --noEmit 2>&1 | grep -cE "^src/sales-plans"` → 0.
- `grep -E "findUnique\\(\\{\\s*where:\\s*\\{\\s*id:\\s*id" src/sales-plans/sales-plans.service.ts` → 0 (compound 는 OK).
- Unit PASS.

**DM:** "T9 sales-plans — IDOR 3건 + @CurrentCompany + KST boundary. tsc 0. 다음 T10."

---

## T10 — @kiditem/shared PLDataSchema + 신규 response schemas

**Files:**
- `packages/shared/src/schemas/profit-loss.ts`
- `packages/shared/src/schemas/statistics.ts` (신규)
- `packages/shared/src/schemas/settlements.ts` (신규)
- `packages/shared/src/schemas/supplier-stats.ts` (신규)
- `packages/shared/src/index.ts` (export)

**Steps:**

- [ ] Step 10.1: `profit-loss.ts` — PLDataSchema 재작성 (`productId` 완전 제거)

```ts
export const PLDataSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  masterName: z.string(),
  category: z.string().nullable(),
  grade: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  revenue: z.number().int(),
  cogs: z.number().int(),
  commission: z.number().int(),
  shippingCost: z.number().int(),
  adCost: z.number().int(),
  otherCost: z.number().int(),
  netProfit: z.number().int(),
  profitRate: z.number(),
  orderCount: z.number().int(),
  returnCount: z.number().int(),
});
export type PLData = z.infer<typeof PLDataSchema>;
```

- [ ] Step 10.2: 신규 `statistics.ts`

```ts
import { z } from 'zod';

export const StatisticsProductRowSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  grade: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  totalRevenue: z.number().int(),
  netProfit: z.number().int(),
  orderCount: z.number().int(),
  profitRate: z.number(),
  margin: z.number(),
});
export type StatisticsProductRow = z.infer<typeof StatisticsProductRowSchema>;

// 아래 6 schema 는 각 service 메서드의 return literal 에 `satisfies` 로 바인딩 (T3-T6).
// implementer 는 각 메서드 구현 완료 후 literal shape 을 그대로 Zod schema 로 전사.
export const StatisticsOverviewSchema = z.object({
  totalRevenue: z.number().int(),
  totalOrders: z.number().int(),
  totalProfit: z.number().int(),
  avgMargin: z.number(),
  totalProducts: z.number().int(),
});

export const StatisticsCategoryRowSchema = z.object({
  category: z.string(),
  name: z.string(),
  revenue: z.number().int(),
  orders: z.number().int(),
  profit: z.number().int(),
  count: z.number().int(),
});

export const StatisticsGradeRowSchema = z.object({
  grade: z.string(),
  revenue: z.number().int(),
  profit: z.number().int(),
  count: z.number().int(),
  productCount: z.number().int(),
  adCost: z.number().int(),
});

export const StatisticsParetoItemSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int(),
  name: z.string(),
  currentGrade: z.string(),
  suggestedGrade: z.string(),
  gradeMatch: z.boolean(),
  revenue: z.number().int(),
  revenuePercent: z.number(),
  cumulativePercent: z.number(),
});
export const StatisticsParetoResponseSchema = z.object({
  totalRevenue: z.number().int(),
  gradeDistribution: z.object({ A: z.number().int(), B: z.number().int(), C: z.number().int() }),
  mismatchCount: z.number().int(),
  data: z.array(StatisticsParetoItemSchema),
});

export const StatisticsRepurchaseProductSchema = z.object({
  masterId: z.string().uuid(),
  productName: z.string(),
  category: z.string().nullable(),
  orderCount: z.number().int(),
});
export const StatisticsRepurchaseCustomerSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  totalAmount: z.number().int(),
  lastOrder: z.date().nullable(),
});
export const StatisticsRepurchaseResponseSchema = z.object({
  totalCustomers: z.number().int(),
  repeatCount: z.number().int(),
  repurchaseRate: z.number(),
  totalOrders: z.number().int(),
  repeatProducts: z.array(StatisticsRepurchaseProductSchema),
  repeatCustomers: z.array(StatisticsRepurchaseCustomerSchema),
});

export const StatisticsDeliveryDailySchema = z.object({
  date: z.string(),
  count: z.number().int(),
  orders: z.number().int(),
  revenue: z.number().int(),
  qty: z.number().int(),
});
export const StatisticsDeliveryResponseSchema = z.object({
  totalShipments: z.number().int(),
  avgDeliveryDays: z.number(),
  courierDistribution: z.array(z.object({ courier: z.string(), count: z.number().int() })),
  daily: z.array(StatisticsDeliveryDailySchema),
});

export type StatisticsOverview = z.infer<typeof StatisticsOverviewSchema>;
// ... 각 type 전 export.
```

- [ ] Step 10.3: 신규 `settlements.ts`

```ts
export const SettlementReconcileDetailSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterCode: z.string(),
  masterName: z.string(),
  plRevenue: z.number().int(),
  plCommission: z.number().int(),
  plNetProfit: z.number().int(),
  plOrderCount: z.number().int(),
  orderTotal: z.number().int(),
  orderCount: z.number().int(),
  revenueDiff: z.number().int(),
  isMatched: z.boolean(),
  status: z.enum(['matched', 'minor_diff', 'mismatch']),
});
export const SettlementReconcileResponseSchema = z.object({
  success: z.boolean(),
  period: z.string(),
  summary: z.object({
    totalPlRevenue: z.number().int(),
    totalOrderRevenue: z.number().int(),
    totalCommission: z.number().int(),
    totalShipping: z.number().int(),
    revenueDifference: z.number().int(),
    productCount: z.number().int(),
    orderCount: z.number().int(),
    matchedCount: z.number().int(),
    mismatchCount: z.number().int(),
    matchRate: z.number().int(),
  }),
  details: z.array(SettlementReconcileDetailSchema),
});
export type SettlementReconcileResponse = z.infer<typeof SettlementReconcileResponseSchema>;
```

- [ ] Step 10.4: 신규 `supplier-stats.ts`

```ts
export const SupplierSalesRowSchema = z.object({
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  productCount: z.number().int(),
  totalOrders: z.number().int(),
  totalQuantity: z.number().int(),
  totalRevenue: z.number().int(),
});
export const SupplierProductSalesRowSchema = z.object({
  optionId: z.string().uuid(),
  sku: z.string().nullable(),
  optionName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  masterName: z.string(),
  supplyPrice: z.number().int().nullable(),
  minOrderQty: z.number().int(),
  totalOrders: z.number().int(),
  totalQuantity: z.number().int(),
  totalRevenue: z.number().int(),
});
```

- [ ] Step 10.5: `index.ts` 에 export 추가. `npm run build --workspace=packages/shared` → PASS.

- [ ] Step 10.6: backend services 에 `satisfies` 로 type drift 방어 — `statistics.service.ts` 의 각 메서드 return `satisfies XxxResponse`. settlements.reconcile `satisfies SettlementReconcileResponse`. supplier-stats 동상.

**Verification:**
- `cd packages/shared && npm run build` → PASS.
- `cd apps/server && npx tsc --noEmit` → B2c scope 0 + shared satisfies drift 0.
- `grep -E "productId" packages/shared/src/schemas/profit-loss.ts` → 0.

**DM:** "T10 shared schemas — PLDataSchema 재작성 + 3 신규 response schema. satisfies 적용. shared build PASS. 다음 T11."

---

## T11 — Integration: statistics-flow.pg

**Files:**
- `apps/server/src/statistics/__tests__/statistics-flow.pg.integration.spec.ts` (신규)

**Steps:**

- [ ] Step 11.1: fixture — 1 company + 2 master + 3 option + 2 channelListing + 3 channelListingOption + 4 order × 5 lineItem + 3 ProfitLoss.
- [ ] Step 11.2: 7 메서드 각 검증 — overview.totalProducts = 2 (master), products/listings 수 = 3 (ProfitLoss rows), categories/grades/pareto 정합성, delivery 의 lineItems qty sum 정확성, repurchase 의 master-level 집계 (receiver A 가 동일 master 의 lineItem 2개 → repeatProduct).
- [ ] Step 11.3: KST 월 경계 테스트 — 2026-04-30 23:30 KST order 가 April 집계에 포함 확인.

**Verification:**
- `npm run test:integration -- statistics-flow` → PASS.

**DM:** "T11 statistics-flow integration — 7 메서드 PASS + KST 경계 정확. 다음 T12."

---

## T12 — Integration: supplier-stats-flow + settlements-flow

**Files:**
- `apps/server/src/supplier-stats/__tests__/supplier-stats-flow.pg.integration.spec.ts` (신규)
- `apps/server/src/settlements/__tests__/settlements-flow.pg.integration.spec.ts` (신규)

**Steps:**

- [ ] Step 12.1: supplier-stats-flow — 2 supplier × 2 option (SupplierProduct 경로) + 1 supplier × 1 master × 2 option (MasterSupplierProduct 경로) × 3 order × 4 lineItem. `getSalesBySupplier` 중복 optionId 방지 + `getProductSales` master path 의 `supplyPrice: null`.
- [ ] Step 12.1.1: **CHUNK 경계 테스트** — CHUNK 상수를 test 환경에서 50 으로 override (또는 testable helper) + 100 optionIds fixture → 2-chunk 분할 실행 검증. 또는 production 값 유지 + 1001+ optionIds fixture (시간 cost 높음 — override 방식 권장).
- [ ] Step 12.1.2: **Null 케이스** — `listingOption: null` line + `receiverName: null` order 가 groupBy 결과에서 배제되는지.
- [ ] Step 12.2: settlements-flow — 2 ProfitLoss + 2 Order × 2 lineItem fixture. `reconcile` matched / minor_diff / mismatch 3 tolerance 시나리오. `update()` IDOR cross-company BadRequestException. KST 경계 Order 집계.
- [ ] Step 12.2.1: **int32 overflow 시나리오** — SUM(total_price) > 2^31 fixture (T8 Step 8.7 과 동일).

**Verification:**
- `npm run test:integration -- supplier-stats-flow settlements-flow` → PASS.

**DM:** "T12 supplier-stats + settlements integration PASS. 다음 T13."

---

## T13 — sales-plans-flow integration (required) + 최종 verification + CLAUDE.md 업데이트

**Files:**
- `apps/server/src/sales-plans/__tests__/sales-plans-flow.pg.integration.spec.ts` (신규, **required**)
- `apps/server/src/orders/CLAUDE.md` (update)
- `apps/server/src/sales-plans/CLAUDE.md` (optional 신규)

**Steps:**

- [ ] Step 13.1 (**required**): sales-plans-flow integration — IDOR 3건 (update/syncActuals/delete) cross-company NotFound + syncActuals KST 월 경계 + totalPrice aggregate 정확성 + empty Order aggregate (actual = 0).
- [ ] Step 13.2: `orders/CLAUDE.md` 에 cs.service 의 `listingId`/`productId` backward compat alias 주석 추가 (Plan D 이전까지).
- [ ] Step 13.3: scope CLAUDE.md 확인 — 기존 domain CLAUDE.md 가 이미 ADR-0013/0015 반영. 필요 시 statistics/supplier-stats/settlements/sales-plans 중 변경 큰 도메인의 CLAUDE.md 신규 또는 주석 업데이트.
- [ ] Step 13.4: 최종 verification

```bash
cd apps/server
# scope tsc 0
npx tsc --noEmit 2>&1 | grep -cE "^src/(orders/services/cs|orders/dto/create-cs|orders/controllers/cs|statistics|supplier-stats|settlements|sales-plans)"
# ADR-0006
grep -rnE "getDefaultCompanyId|companyId\s*=\s*null" src/{orders,statistics,supplier-stats,settlements,sales-plans}
# IDOR (mutation 경로만)
grep -rnE "findUnique\(\{\s*where:\s*\{\s*id:\s*[a-zA-Z]" src/{orders,statistics,supplier-stats,settlements,sales-plans}
# stale schema
grep -rnE "prisma\.product\.|\.productId\b|Order\.quantity" src/{orders,statistics,supplier-stats,settlements,sales-plans}
# shared
grep -rE "productId" ../../packages/shared/src/schemas/profit-loss.ts
```

예상: 모두 0.

- [ ] Step 13.5: Unit + Integration 전체 재실행

```bash
cd apps/server && npx vitest run
npm run test:integration
```

- [ ] Step 13.6: baseline 대비 감소 측정

```
baseline (pre-T1): 73 errors (exact, critic-verified)
post-T13: 0 in scope
```

**Verification:**
- 위 grep 결과 모두 0.
- 전체 test suite PASS.

**DM:** "T13 최종 — tsc scope 0, ADR-0006 / IDOR / stale schema / shared productId 모두 0 hits. 전체 test PASS. 머지 준비."

---

## 최종 Self-check (PR 생성 전)

- [ ] `git status` — 의도된 파일만 변경.
- [ ] `git log --oneline origin/main..` — 각 task 1-commit 유지 (T1-T13).
- [ ] PR body: `.github/PULL_REQUEST_TEMPLATE.md` 체크리스트 + 이 plan 경로 링크 + `Spec: ... v2.1` + ADR-0006/0013/0015 compliance 체크.
- [ ] `apps/web/*` 빌드 일시 실패 유지 명시 (Plan D 이전까지, PLDataSchema 재배선 관련).
- [ ] dev:server 부팅 **미달성 상태**. B2c.dashboard 이연 명시.

---

## Out of scope (spec §7 동일)

- master-product-resolver.ts 삭제 → B2c.dashboard
- dashboard / finance / channel-dashboard / channel-sync / action-task / traffic / rules / panel / sourcing / processing-costs / agent-registry / ontology → B2c.dashboard
- AdSnapshot.listingId null TTL → B2c.dashboard
- uploads.processAdCsv 재구현 결정 → B3
- Picking generate 재설계 → Plan B2.picking
- Frontend contract 일괄 재배선 → Plan D

---

## Team workflow (if TeamCreate 선택 시)

- `TeamCreate({ team_name: "kiditem-b2c-orders" })`
- 3 role: `kiditem-implementer` × 1 (또는 병렬 2), `kiditem-reviewer` × 2 (spec + quality), `kiditem-qa-verifier` × 1.
- 규칙: 1 task = 1 commit = 1 DM cycle. FAIL progression 금지. 3-cycle escalation. Vague FAIL 금지 (file:line + 이유 + fix).
- QA protocol: implementer DM 수신 즉시 착수 (reviewer PASS 대기 없음).

혹은 **subagent-driven-development** — kiditem-implementer subagent 다회 dispatch + lead inline 검토 (B2b.refactor 패턴). T1-T6 은 가벼움, T7-T12 가 heavy. hybrid 도 가능.

실행 패턴은 plan 작성 직후 user 최종 결정.

---

## 참조

- Spec: [2026-04-19-plan-b2c-orders-domain-rewire-design.md](../specs/2026-04-19-plan-b2c-orders-domain-rewire-design.md)
- B2b plan 템플릿: [2026-04-18-plan-b2b-advertising-listing-migration.md](./2026-04-18-plan-b2b-advertising-listing-migration.md)
- B2b.refactor 패턴: [2026-04-19-plan-b2b-refactor-ad-strategy-split.md](./2026-04-19-plan-b2b-refactor-ad-strategy-split.md)
- ADR: [0006](../../.claude/docs/decisions/0006-authenticated-company-scope.md) / [0013](../../.claude/docs/decisions/0013-product-schema-3layer.md) / [0014](../../.claude/docs/decisions/0014-stock-mutation-single-writer.md) / [0015](../../.claude/docs/decisions/0015-order-schema-unification.md)
- CLAUDE.md: [server](../../../apps/server/CLAUDE.md) / [orders](../../../apps/server/src/orders/CLAUDE.md) / [prisma](../../../prisma/CLAUDE.md)
