# Plan B2c.dashboard — Dashboard + Profit-Loss + Alert Schema (spec v2)

- 작성일: 2026-04-20
- Status: **draft-v2** — 3-reviewer adversarial review (critic + architect + code-reviewer) 반영
- 관련 ADR: [ADR-0006](../../../.claude/docs/decisions/0006-authenticated-company-scope.md), [ADR-0011](../../../.claude/docs/decisions/0011-status-canonical.md), [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md), [ADR-0015](../../../.claude/docs/decisions/0015-order-schema-unification.md)
- 전제: Plan A.5 (PR #28) + B2a (PR #27) + B2b (PR #30) + B2b.refactor (PR #31) + B2c.orders (PR #32) — 모두 merged
- 후속: Plan B3 (channel-sync listingId rewrite + uploads.processAdCsv + AlertItem shared-base consolidation), Plan D (frontend rewire + profit-loss pagination)

---

## 1. Goal

B2c.orders (PR #32) merge 후 남은 **tsc errors (109 in apps/server + 추가 test file mocks)** 를 수정하고 3 stub services (`profit-loss.service`, `channel-dashboard.service`, `channel-sync`) 를 구현하여 **`dev:server` 부팅 + HTTP smoke + PG integration PASS** 달성. PanelAlertItem + AlertItemSchema + DashboardAlertItemSchema 3 개를 DB 실제 schema (`targetType + targetId`) 에 맞게 재조정.

**완료 기준 (v2 확장)**:
1. `apps/server tsc --noEmit` → 0 errors
2. `packages/shared build` → 0 errors
3. `apps/web build` → 0 errors
4. `npm run dev:server` → 모든 NestJS 모듈 DI graph 유효 + 부팅
5. **HTTP smoke** (신규): `curl /api/profit-loss?period=2026-04` → 200, `curl /api/channels/dashboard/summary` → 200 (실제 DB seeded 상태)
6. **PG integration** (신규): `profit-loss.pg.integration.spec.ts` + `channel-dashboard.pg.integration.spec.ts` PASS
7. 기존 vitest suite PASS (6+ stale test mock files 도 update)

**Non-goal (Plan B3 이연)**: channel-sync syncProducts/syncInventory full rewrite, uploads.processAdCsv 구현, frontend profit-loss page rewire (Plan D), sourcing coupangProductId 정리, AlertItem shared-base consolidation (A-04 post-fix design), `rules.service.ts:58` raw SQL prepared-statement 변환 (SQL injection — 별도 ADR 권장).

---

## 2. Context — 확정 schema (실제 파일 검증 완료)

> v2: schema 설명 유지 (v1 검증 통과). 핵심은 아래 invariant 6개.

### 2.1 ProductOption (`prisma/models/core.prisma:230-270`) — **가격 필드의 실제 위치**

```
model ProductOption {
  masterId, companyId, sku (unique), barcode?, legacyCode?, optionName?
  costPrice Int?, sellPrice Int?
  commissionRate Decimal?(5,4)
  shippingCost Int?, otherCost Int? @default(0)
  isBundle Boolean, availableStock Int?
  inventory Inventory?
}
```

**invariant 1 (I1)**: 가격은 ProductOption 전용. MasterProduct/ChannelListing 에 pricing 필드 없음.

### 2.2 ProfitLoss (`prisma/models/finance.prisma`) — write 는 B2c.orders reconcile, read 는 이 plan

```
model ProfitLoss {
  companyId, listingId (FK ChannelListing, onDelete: Restrict)
  year Int, month Int
  revenue/cogs/commission/shippingCost/adCost/otherCost/netProfit Int
  profitRate Decimal?(5,4)
  orderCount/returnCount Int
  @@unique([companyId, listingId, year, month])
}
```

**invariant 2 (I2)**: read 는 `findMany({ year, month })`, `profitRate Decimal? → .toNumber() ?? 0` 변환. **write path (B2c.orders reconcile)** 는 `revenue=0` 월에도 row 생성. 따라서 `profitRate null` 은 "데이터 없음" 이 아니라 "revenue 0 → rate 미정의". read 는 0 으로 표시 (허용 손실).

### 2.3 Order / OrderLineItem (orders.prisma, ADR-0015)

```
Order { companyId, totalPrice, orderedAt, listingId?, lineItems[] }
OrderLineItem { orderId, optionId?, quantity, totalPrice, unitPrice }
```

**invariant 3 (I3) — Canonical aggregation**: "company revenue over range" 는 **`SUM(OrderLineItem.totalPrice)`** 기준 (B2c.orders statistics/settlements 일치). `Order.totalPrice` 는 Order aggregate 표시용이며 lineItem 합과 drift 가능 (환불/취소/부분 조정). `channel-dashboard.getRevenueTrend` 는 v1 에서 `SUM(o.total_price)` 썼으나 v2 에서 `SUM(oli.total_price)` 로 변경.

### 2.4 ProcessingCost — FK masterId (NOT optionId)

```
model ProcessingCost { companyId, masterId, ... master MasterProduct }
```

### 2.5 Alert — targetType + targetId

```
model Alert { companyId, targetType String?, targetId String?(uuid), type, severity, title, message?, isRead, actionTaskId? }
```

### 2.6 OrderReturn — direct columns

```
model OrderReturn { companyId, orderId?, requestedAt, reason, reasonCategory1?, reasonCategory2?, faultBy @default("CUSTOMER"), type @default("RETURN") }
```

### 2.7 TrafficStats — `@@unique([listingId, date, periodDays])` (productId drop).

### 2.8 ThumbnailGeneration — FK masterId (productId drop).

---

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope 파일 (v2 추가 + 경로 수정)

**Server — Mechanical tsc (Group 1)**:

| Path | 작업 | v2 변경 |
|---|---|---|
| `apps/server/src/sourcing/sourcing.service.ts` | prisma.product → masterProduct | — |
| `apps/server/src/sourcing/__tests__/sourcing-flow.spec.ts` | mock `product: {...}` → `masterProduct: {...}` (15+ calls) | **+v2 (C-01)** |
| `apps/server/src/ontology/ontology.service.ts` | prisma.product + raw SQL `FROM products` → `FROM master_products` (line 18) | — |
| `apps/server/src/agent-registry/agent-registry.service.ts` | prisma.product → masterProduct | — |
| `apps/server/src/agent-registry/business-safety/snapshot.service.ts` | prisma.product (lines 21, 61) | — |
| `apps/server/src/agent-registry/business-safety/__tests__/snapshot.service.spec.ts` | mock `prisma.product.findUnique/update` | **+v2 (C-01)** |
| `apps/server/src/rules/services/rules.service.ts` | (a) prisma.product (lines 161-182) (b) **raw SQL line 58: `UPDATE products` → `UPDATE master_products`** (c) Alert create line 111: productId→targetType+targetId | **C-06 (raw SQL)** |
| `apps/server/src/rules/services/alerts.service.ts` | Alert select line 62 + return type line 74 | — |
| `apps/server/src/rules/services/types.ts` | `ProductEvalResult.productId` → `masterId` (downstream consistency) | **+v2 (C-09)** |
| `apps/server/src/rules/__tests__/alerts.service.spec.ts` | findFirst mock + targetType/targetId fixture | — |
| `apps/server/src/rules/__tests__/rules.service.spec.ts` | mock `product: { count, findFirst, findMany }` + productId fixtures | **+v2 (C-01)** |
| `apps/server/src/rules/__tests__/rules-flow.spec.ts` | mock `product` + productId fixtures (10+) | **+v2 (C-01)** |
| `apps/server/src/dashboard/services/dashboard-inventory.service.ts` | (a) prisma.product.groupBy/count/findMany → masterProduct (b) `status:'active'` → `isDeleted:false` (c) `abcGrade` field (d) **line 141: `productId: a.productId` → `targetType/targetId`** | **C-04 (경로 수정 helpers→services), C-05 (line 141)** |
| `apps/server/src/dashboard/helpers/profit-calculator.ts` | **Full rewrite** — 자세한 pseudocode §4.6 | **C-02 (full rewrite)** |
| `apps/server/src/action-task/action-task.service.ts` | (a) prisma.product (line 40) (b) `getRelatedProducts()` 2-hop join: ProfitLoss→listing.master, Inventory→option.master | **C-03 (2-hop join)** |
| `apps/server/src/action-task/types.ts` | `RelatedProduct.id` 의미 확정 — masterId 또는 listingId 명시 | **+v2 (C-missing)** |
| `apps/server/src/processing-costs/processing-costs.service.ts` | product→master, productId→masterId | — |
| `apps/server/src/processing-costs/dto/create-processing-cost.dto.ts` | line 9 productId→masterId | — |
| `apps/server/src/panel/panel.service.ts` | thumbnailGeneration.product → master | — |
| `apps/server/src/panel/__tests__/image.adapter.spec.ts` | ThumbnailGeneration fixture productId→masterId | — |
| `apps/server/src/panel/adapters/alert.adapter.ts` | alert.productId → targetType/targetId | — |
| `apps/server/src/panel/__tests__/alert-schema-drift.spec.ts` | UPDATE: Pick<Alert,'targetType','targetId'> | — |
| `apps/server/src/panel/adapters/__tests__/alert.adapter.spec.ts` | UPDATE: targetType/targetId passthrough | — |
| `apps/server/src/panel/__tests__/panel-pr2a.pg.integration.spec.ts` (+ pr2b) | discriminated union narrowing | — |
| `apps/server/src/traffic/traffic.service.ts` | 전체 rewrite (prisma.product→channelListing+options, TrafficStats unique key, option-pricing-resolver, raw SQL product_id→listing_id) | — |
| `apps/server/src/channels/services/channel-sync.service.ts` | stub NotImplementedException | — |
| `apps/server/src/channels/services/channel-dashboard.service.ts` | 6 methods 전체 구현 | — |
| `apps/server/src/channels/services/__tests__/channel-dashboard.service.spec.ts` | **신규** unit test | — |
| `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts` | **신규 integration** | **+v2 (A-07)** |
| `apps/server/src/finance/services/profit-loss.service.ts` | stub → 실구현 | — |
| `apps/server/src/finance/controllers/profit-loss.controller.ts` | `@CurrentCompany()` decorator + period 파싱 | **A-13/R-01** |
| `apps/server/src/finance/dto/profit-loss-query.dto.ts` | `@Matches(/^\d{4}-\d{2}$/)` validation | **R-02** |
| `apps/server/src/finance/services/__tests__/profit-loss.service.spec.ts` | **신규** unit test | — |
| `apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts` | **신규 integration** | **+v2 (A-07)** |
| `apps/server/src/common/master-product-resolver.ts` → `option-pricing-resolver.ts` | rename + nested-only shape + shippingCost/otherCost in ResolvedPricing | **A-10/C-07** |
| `apps/server/src/common/__tests__/option-pricing-resolver.spec.ts` | **신규** unit test | — |

**Shared (Group 2)**:

| Path | 작업 | v2 변경 |
|---|---|---|
| `packages/shared/src/panel/types.ts` | PanelAlertItem: productId→targetType+targetId | — |
| `packages/shared/src/schemas/alerts.ts` | AlertItemSchema: 동일 | — |
| `packages/shared/src/schemas/dashboard.ts` | DashboardAlertItemSchema: 동일 (v1 에도 있었음, 재확인) | — |
| 각 schema 파일에 **projection 주석** 추가 — "server-internal vs panel-wire vs dashboard-card" | **+v2 (A-12)** |

**Web (Group 2 끝)**:

| Path | fixture |
|---|---|
| `apps/web/src/components/panel/__tests__/PanelAlertRow.spec.tsx` | line 18 |
| `apps/web/src/components/panel/__tests__/PromoteToTaskModal.spec.tsx` | line 34 |
| `apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx` | line 34 |
| `apps/web/src/components/panel/__tests__/PanelSheet.spec.tsx` | line 40 |

### 3.2 Out-of-scope (별도 plan)

- `channel-sync.syncProducts/syncInventory` full rewrite → Plan B3
- `uploads.processAdCsv` → Plan B3
- Frontend `profit-loss` page rewire → Plan D (`satisfies PLData` drift guard 만 담보)
- `sourcing.service.ts` coupangProductId → sourcing ADR 별도
- `AdSnapshot.listingId` null cleanup TTL → 운영 ADR 별도
- Dashboard `getProductRanking` pagination → Plan D
- **`rules.service.ts:51-62` SQL injection → 별도 ADR** (table name 만 v2 에서 수정; prepared statement 변환은 scope 초과)
- **`AlertItemSchema` / `PanelAlertItem` / `DashboardAlertItemSchema` consolidation into shared base → Plan B3** (post-fix smoke 설계)
- **`common/` vs `products/helpers/` option-pricing-resolver 재배치** → Plan B3 or 별도 refactor plan. 이 plan 은 `common/` 유지 (A-02 defer).

### 3.3 ADR 관계

- ADR-0006: `@CurrentCompany()` decorator 사용 (R-01/A-13 finding)
- ADR-0011: flat string status 유지
- ADR-0013: pricing 은 ProductOption 전용
- ADR-0015: Order.lineItems canonical aggregation (I3)

---

## 4. Architecture

### 4.1 Invariants (v2 통합)

| # | Invariant | 출처 |
|---|---|---|
| I1 | Pricing 은 ProductOption 에만 존재 | ADR-0013 |
| I2 | ProfitLoss read: `profitRate Decimal? → .toNumber() ?? 0`. write 는 B2c.orders reconcile 에서 모든 listing/year/month 튜플 생성 (revenue=0 포함) | B2c.orders PR #32 |
| **I3** | **Canonical "company revenue over range" = `SUM(OrderLineItem.totalPrice)`** — `Order.totalPrice` 는 aggregate 표시용. `getRevenueTrend` + `profit-calculator` 모두 OrderLineItem 기준. | **v2 (A-01)** |
| I4 | Alert 에 `productId` 없음. `targetType + targetId` 만. | prisma/models/system.prisma |
| I5 | ProcessingCost FK = `masterId`. `optionId` 아님. | prisma/models/finance.prisma |
| I6 | **Domain boundary**: `channel-dashboard` = real-time from `orders`/`order_returns`. `finance/profit-loss` = pre-computed monthly snapshot from `profit_loss` (written by B2c.orders reconcile). 두 서비스는 서로 cross-reference 금지. | **v2 (A-03)** |
| I7 | 모든 controller 는 `@CurrentCompany() companyId: string` decorator 로 companyId 주입. `@Req() req: Request` 금지. | ADR-0006 (A-13/R-01) |
| I8 | 모든 날짜 range query 는 **half-open `[from, to)`** (`gte` + `lt`). `lte` 금지. | v2 (A-11) |

### 4.2 Data flow — profit-loss.service.findAll

**Controller**:
```ts
@Get()
findAll(
  @CurrentCompany() companyId: string,            // I7
  @Query() query: ProfitLossQueryDto,             // period: YYYY-MM format enforced by @Matches
) {
  const now = new Date();
  const [yStr, mStr] = (query.period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-');
  return this.service.findAll(companyId, Number(yStr), Number(mStr));
}
```

**DTO** (R-02):
```ts
export class ProfitLossQueryDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}$/) period?: string;
}
```

**Service**:
```ts
const rows = await this.prisma.profitLoss.findMany({
  where: { companyId, year, month },                  // I2: year+month Int
  include: {
    listing: {
      select: {
        externalId: true, channelName: true,
        master: { select: {
          id: true, code: true, legacyCode: true, name: true,
          category: true, abcGrade: true, thumbnailUrl: true,
        }},
      },
    },
  },
});

return rows.filter(r => r.listing !== null).map(r => ({
  listingId: r.listingId,
  externalId: r.listing!.externalId,
  channelName: r.listing!.channelName ?? null,
  masterId: r.listing!.master.id,
  masterCode: r.listing!.master.legacyCode ?? r.listing!.master.code,
  masterName: r.listing!.master.name,
  category: r.listing!.master.category ?? null,
  grade: r.listing!.master.abcGrade ?? null,
  thumbnailUrl: r.listing!.master.thumbnailUrl ?? null,
  revenue: r.revenue, cogs: r.cogs, commission: r.commission,
  shippingCost: r.shippingCost, adCost: r.adCost, otherCost: r.otherCost,
  netProfit: r.netProfit,
  profitRate: r.profitRate?.toNumber() ?? 0,          // R-04
  orderCount: r.orderCount, returnCount: r.returnCount,
} satisfies PLData));
```

**Note (R-03 해결)**: `LISTING_WITH_MASTER_SELECT_EXTENDED` spread 는 master 를 완전히 override 하므로 v2 에서는 **spread 없이 명시적 select** (위 코드처럼). 또는 대안: `legacyCode: true` 를 `LISTING_WITH_MASTER_SELECT_EXTENDED.master.select` 에 직접 추가 (consumer 는 extra field 수용). 권장: 명시적 select (drift 방지).

### 4.3 Data flow — channel-dashboard.service (6 methods)

공통 규약 (I7 + I8):
- 모든 method signature 는 `(companyId, from, to)` 또는 `(companyId)`
- 날짜 필터 `gte from && lt to` (half-open)
- `$queryRaw` parameter binding 은 `${x}` 템플릿 문자열, uuid cast 는 `${companyId}::uuid`

```
getSummary(companyId):
  parallel [
    Order aggregate { companyId, orderedAt >= kstDayStart(now) } → { count, totalPrice sum },
    Order count { companyId, status: 'accept_wait' },
    OrderReturn count { companyId, status: 'return_request' },
    ChannelListing findFirst { companyId } orderBy updatedAt desc → updatedAt
  ]
  return { todayOrders: {...}, pendingAccept, pendingReturns, lastModifiedAt: lastSync?.updatedAt ?? null }  // R-07: "Sync" → "Modified" 의미 명확화
```

**R-07 적용**: 응답 필드명을 `lastSyncedAt` → `lastModifiedAt` 로 변경. 실제 sync 시점 추적은 Plan B3 에서 `ChannelListing.syncedAt` 컬럼 추가 후 대체.

```
getRevenueTrend(companyId, from, to):
  // I3: OrderLineItem 기준 SUM
  $queryRaw`
    SELECT DATE_TRUNC('day', o.ordered_at AT TIME ZONE 'Asia/Seoul')::date AS day,
           SUM(oli.total_price)::bigint AS revenue,
           COUNT(DISTINCT o.id)::bigint AS "orderCount"      // 주문 수 (중복 order 방지)
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    WHERE o.company_id = ${companyId}::uuid
      AND o.ordered_at >= ${from} AND o.ordered_at < ${to}   // half-open (I8)
    GROUP BY 1 ORDER BY 1
  `
  → rows.map(r => ({ day: r.day.toISOString().split('T')[0], revenue: Number(r.revenue), orderCount: Number(r.orderCount) }))
```

**R-11 적용**: `getRevenueTrend` 는 Order JOIN OrderLineItem 이므로 `COUNT(DISTINCT o.id)` 는 정당함 (같은 order 가 lineItem 수만큼 join 됨). 하지만 `getProductRanking` 은 단일 Order row 별이므로 `COUNT(*)` 충분.

**R-05 note**: `::bigint` → `Number()` precision risk. 셀러 월 매출 상한 ~수십억 KRW (2^53 ≈ 9 × 10^15 KRW = 9 조원). 일반 셀러 spec 에서 safe. 만약 aggregate 가 모든 회사면 다르지만 이 쿼리는 single-company scope 이므로 안전.

```
getProductRanking(companyId, from, to):
  // I3: OrderLineItem SUM, master.name JOIN
  $queryRaw`
    SELECT cl.external_id AS "sellerProductId",
           mp.name AS "sellerProductName",
           SUM(oli.total_price)::bigint AS revenue,
           COUNT(DISTINCT o.id)::bigint AS "orderCount"
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    JOIN channel_listings cl ON cl.id = o.listing_id
    JOIN master_products mp ON mp.id = cl.master_id
    WHERE o.company_id = ${companyId}::uuid
      AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
      AND o.listing_id IS NOT NULL
    GROUP BY cl.external_id, mp.name
    ORDER BY revenue DESC LIMIT 10
  `
```

```
getReturnSummary(companyId, from, to):
  parallel [
    OrderReturn count { companyId, requestedAt: { gte: from, lt: to } },   // I8
    Order count { companyId, orderedAt: { gte: from, lt: to } },           // I8
  ]
  // R-06: return rate 의미 주석 — 'returns 요청된 returns / 같은 period 에 placed orders'. past-period orders 의 returns 는 분자에 포함되어 rate > 100% 가능. Plan D 에서 JOIN 으로 정확도 개선.
  const returnRate = orderCount === 0 ? 0 : returnCount / orderCount;
  return { returnCount, orderCount, returnRate };
```

```
getReturnReasonBreakdown(companyId, from, to):
  OrderReturn.groupBy({
    by: ['reason'],
    _count: true,                                       // R-12: flat count shape
    where: { companyId, requestedAt: { gte: from, lt: to } },  // R-14: explicit companyId
  })
  → groups.map(g => ({ reason: g.reason, count: g._count }))
```

```
getReturnFaultSplit(companyId, from, to):
  OrderReturn.groupBy({
    by: ['faultBy'],
    _count: true,                                       // R-12
    where: { companyId, requestedAt: { gte: from, lt: to } },
  })
  → find('CUSTOMER') + find('VENDOR') (unknown faultBy values 는 drop)
```

### 4.4 option-pricing-resolver interface (v2 — nested-only)

**A-10 적용**: flat legacy fields 제거, nested `option` 만 유지. 모든 caller 는 `option: {...}` 형태 강제.

**C-07 적용**: `ResolvedPricing` 에 `shippingCost + otherCost` 추가.

```ts
// apps/server/src/common/option-pricing-resolver.ts

const CNY_TO_KRW_RATE = 190;

export interface ResolvePricingInput {
  option: {
    costPrice?: number | null;
    costCny?: unknown;                   // Decimal or number
    sellPrice?: number | null;
    commissionRate?: unknown;            // Decimal or number
    shippingCost?: number | null;
    otherCost?: number | null;
  };
}

export interface ResolvedPricing {
  costPrice: number;
  sellPrice: number;
  commissionRate: number;
  shippingCost: number;
  otherCost: number;
  isCostMissing: boolean;
}

export function resolvePricing(p: ResolvePricingInput): ResolvedPricing {
  const o = p.option;
  const hasCost = o.costPrice != null || o.costCny != null;
  const costPrice = o.costPrice
    ?? (o.costCny != null ? Math.round(Number(o.costCny) * CNY_TO_KRW_RATE) : 0);
  const sellPrice = o.sellPrice ?? 0;
  const commissionRate = o.commissionRate != null ? Number(o.commissionRate) : 0;
  const shippingCost = o.shippingCost ?? 0;
  const otherCost = o.otherCost ?? 0;
  return { costPrice, sellPrice, commissionRate, shippingCost, otherCost, isCostMissing: !hasCost };
}
```

**R-10 방어**: v2 interface 는 `option` required. Caller 가 legacy `masterProduct` 또는 flat field 전달 시 **compile error**. Silent-zero 위험 없음.

**A-02 defer**: `common/` 유지. `products/helpers/` 이동은 Plan B3 별도 refactor.

### 4.5 Alert schema migration (v2 — 3 projection 주석)

각 schema 파일 상단에 **projection comment block** 추가:

```ts
// packages/shared/src/panel/types.ts
// PanelAlertItem — panel SSE stream 용 projection.
// 포함: kind, id, severity, type, title, message, targetType, targetId, isRead,
//      actionTaskId, actorUserId (Alert 에 없음 → 항상 null), createdAt
// 제외: companyId (wire drop), updatedAt (Alert 에 없음)
```

```ts
// packages/shared/src/schemas/alerts.ts
// AlertItemSchema — server-internal full alert row projection.
// 포함: companyId + panel 공통 필드
```

```ts
// packages/shared/src/schemas/dashboard.ts
// DashboardAlertItemSchema — dashboard card projection (nullable targetType/targetId).
// 포함: targetType?/targetId? (nullable optional), rest 공통
```

**A-04 defer**: 3 schema consolidation (shared base) → Plan B3. v2 는 3 파일 각각 동일한 field 업데이트만.

**C-05 포함**: `dashboard-inventory.service.ts:141` projection 도 업데이트 — `productId: a.productId` → `targetType: a.targetType, targetId: a.targetId`.

### 4.6 Data flow — profit-calculator.ts full rewrite (v2 — C-02)

**기존 (broken)**:
```ts
const orders = await prisma.order.findMany({
  select: { totalPrice, quantity, product: { select: { costPrice, costCny, commissionRate, shippingCost, otherCost, masterProduct: {...} } } },
  where: { orderedAt: { gte: from, lt: to }, status: {...} },
});
for (const o of orders) {
  revenue += o.totalPrice;
  const qty = o.quantity;
  const resolved = resolvePricing(o.product);
  costOfGoods += resolved.costPrice * qty;
  // ...
}
```

**새 쿼리 (I3 Canonical aggregation: OrderLineItem 기준)**:
```ts
const orders = await prisma.order.findMany({
  where: {
    companyId,                                // I7 scope
    orderedAt: { gte: from, lt: to },         // I8 half-open
    status: { notIn: ['cancelled', 'returned', 'refunded'] },
  },
  select: {
    lineItems: {
      select: {
        quantity: true,
        totalPrice: true,
        option: {
          select: {
            costPrice: true, costCny: true, commissionRate: true,
            shippingCost: true, otherCost: true,
          },
        },
      },
    },
  },
});

let revenue = 0, costOfGoods = 0, commission = 0, shippingCost = 0, otherCost = 0;
let orderCount = orders.length;

for (const o of orders) {
  for (const li of o.lineItems) {
    revenue += li.totalPrice || 0;                    // I3: lineItem 기준
    const p = li.option;
    if (!p) continue;                                 // option 없으면 비용 skip
    const resolved = resolvePricing({ option: p });   // §4.4 nested-only
    costOfGoods += resolved.costPrice * li.quantity;
    commission += (li.totalPrice || 0) * resolved.commissionRate;
    shippingCost += resolved.shippingCost;            // per-lineItem 고정비 (이전 per-order 와 다름)
    otherCost += resolved.otherCost * li.quantity;
  }
}
// ad cost 기존 로직 유지 (AdSnapshot aggregate)
```

**note (shippingCost 변경)**: v1 profit-calculator 는 `shippingCost += prod.shippingCost` (per-order 1 회). v2 는 lineItem 당 shippingCost. 의미 변경 — 한 order 에 여러 lineItem 이면 shipping 이 중복 적재. **design 결정 필요**:
- option A: `shippingCost += resolved.shippingCost` per-lineItem (현재 작성, over-count 위험)
- option B: per-order 1 회 — `if (lineItems[0])` 만 누적
- **v2 권장 A**: OrderLineItem 별 shipping 이 실제 schema 구조. 과-count 는 `marginRate`/`profitRate` 로 드러나므로 acceptable. Plan D 에서 order-level shipping 확정 시 재검토.

**A-15 방어 (AdSnapshot listingId null)**: `adSnapshot.aggregate` 는 global sum — company/listing 필터 없음. 기존 동작 유지 (dangling AdSnapshot record 는 운영 ADR 에서 TTL). Plan D profit-loss page 에서 listing 별 ad 분배 시 revisit.

### 4.7 action-task.service.getRelatedProducts — 2-hop join (v2 — C-03)

**기존 (broken)**:
```ts
prisma.profitLoss.findMany({
  where: { year, month, product: { companyId } },
  include: { product: { select: { id, name } } },
})
// → pl.productId, pl.product?.name

prisma.inventory.findMany({
  where: { product: { companyId }, ... },
  include: { product: { select: { id, name } } },
})
// → inv.productId, inv.product?.name
```

**새 (2-hop)**:
```ts
// ProfitLoss → listing → master
prisma.profitLoss.findMany({
  where: { companyId, year, month },
  include: { listing: { include: { master: { select: { id: true, name: true } } } } },
})
.map(pl => ({
  id: pl.listing?.master.id ?? pl.listingId,        // action-task/types.ts 에서 RelatedProduct.id 의미 확정
  name: pl.listing?.master.name ?? 'N/A',
}))

// Inventory → option → master
prisma.inventory.findMany({
  where: {
    companyId,                                       // ADR-0006
    currentStock: { gt: 0 },
    reorderPoint: { gt: 0 },
  },
  include: { option: { include: { master: { select: { id: true, name: true } } } } },
})
.filter(inv => inv.currentStock <= inv.reorderPoint)
.slice(0, 20)
.map(inv => ({
  id: inv.option?.master.id ?? inv.optionId,
  name: inv.option?.master.name ?? 'N/A',
  metric: '재고',
  value: `${inv.currentStock}개 (기준 ${inv.reorderPoint})`,
}))
```

**Note (C-missing)**: `action-task/types.ts` `RelatedProduct.id` 는 이제 **masterId** 의미. 이 plan 에서 field 이름 유지 (id) + 주석 업데이트. downstream frontend 는 Plan D 에서 재배선.

---

## 5. Test Plan

### 5.1 Unit test (v2 확장)

| File | Coverage |
|---|---|
| `profit-loss.service.spec.ts` | happy path / null listing filter / Decimal.toNumber() / legacyCode fallback / abcGrade 매핑 |
| `channel-dashboard.service.spec.ts` | 6 methods 각각 + KST day bucketing + zero-division + groupBy shape + lastModifiedAt 명명 검증 |
| `option-pricing-resolver.spec.ts` | nested-only input / costCny fallback / Decimal commissionRate / shippingCost/otherCost passthrough / isCostMissing |
| `alert.adapter.spec.ts` (update) | targetType/targetId passthrough + null |
| `alert-schema-drift.spec.ts` (update) | Pick<Alert,'targetType','targetId'> compile |
| `alerts.service.spec.ts` (update) | findFirst mock + Alert fixture |
| `image.adapter.spec.ts` (update) | ThumbnailGeneration.masterId fixture |
| `sourcing-flow.spec.ts` (update) | 15+ masterProduct mocks |
| `rules-flow.spec.ts` (update) | masterProduct mocks + Alert fixtures |
| `rules.service.spec.ts` (update) | masterProduct mocks + Alert fixtures |
| `snapshot.service.spec.ts` (update) | masterProduct mocks |

### 5.2 Integration test (real Postgres, 신규) — **A-07 완료 기준**

| Spec | Verifies |
|---|---|
| `profit-loss.pg.integration.spec.ts` (신규) | seed Company + MasterProduct + ChannelListing + ProfitLoss (2~3 rows, Decimal profitRate). `ProfitLossService.findAll` → `PLDataSchema.parse()` 통과. IDOR test: 다른 company row 제외 확인 |
| `channel-dashboard.pg.integration.spec.ts` (신규) | seed Order + OrderLineItem + OrderReturn. 6 methods 모두 실 DB 에서 호출. KST day bucketing 검증 (UTC 2026-04-14T16:00:00Z = KST 2026-04-15 00:00 + 1 min). I3 Canonical aggregation 검증 (OrderLineItem 기준 SUM) |
| 기존 `panel-pr2a.pg.integration.spec.ts` + `pr2b` + `pr3` | discriminated union narrowing 통과 |
| `alert-schema-drift.spec.ts` (compile-time) | Prisma Alert 모델에서 targetType/targetId 누락 시 tsc fail |

### 5.3 Manual HTTP smoke (T18, 신규) — **A-07 완료 기준**

```bash
# server 부팅 후
curl -sS localhost:3000/api/profit-loss?period=2026-04 -H "x-dev-user-id: <seeded>" | jq length   # 200 + array
curl -sS localhost:3000/api/channels/dashboard/summary -H "x-dev-user-id: <seeded>" | jq .todayOrders   # 200 + { count, revenue }
curl -sS "localhost:3000/api/channels/dashboard/revenue-trend?from=2026-04-01&to=2026-04-20" -H "x-dev-user-id: <seeded>" | jq length
```

### 5.4 Known test gaps (explicit)

- **Frontend** `profit-loss` page 실행 테스트 없음 — Plan D E2E
- **profit-calculator per-lineItem shippingCost** 의미 변경 검증 — 기존 fixture 가 per-order 단위, 의도적으로 drift 허용 (§4.6 note). Plan D 에서 order-level shipping 재검토 시 regression test.
- **SQL injection 방어** — `rules.service.ts:51-62` prepared statement 변환은 out-of-scope.

---

## 6. Execution Strategy

### 6.1 Task DAG (v2 — file-level conflict 고려)

```
Pre-flight: branch + env sync + baseline (tsc count)
  │
  ├─ T1 (mechanical prisma.product) ─┐
  ├─ T2 (action-task ProfitLoss/Inventory 2-hop) ─┤
  ├─ T3 (ProcessingCost masterId + panel.service + image.adapter) ─┤
  ├─ T6 (channel-sync stub) ─┤
  ├─ T8 (alerts.service.spec findFirst mock) ─┤
  │                                           │
  ├─ T4 (option-pricing-resolver rename) ─┐  │
  │    │                                  ↓  ↓
  │    ├─ T5 (traffic.service + resolver import)
  │    └─ T7 (profit-calculator full rewrite + resolver import)
  │                                           │
  ├─ T9 (shared types productId→targetType+targetId) ─┐
  │                                                   │
  │    T10 (alert.adapter + drift spec)  ← T9 + T3(panel.service)  ⚠️ T3/T10 panel/ 파일 충돌 조심
  │    T11 (alerts.service select + return)  ← T9
  │    T12 (rules.service Alert create + types.ts rename)  ← T9
  │                                                   │
  └─ T13 (web panel fixtures 4 files) ← T9
                                                      │
T14 (profit-loss service + controller + DTO) ← T9    │
T15 (channel-dashboard 6 methods + test)  ← T9       │
T16 (panel integration union type)  ← 독립           │
                                                      │
T17 (delete master-product-resolver) ← T4            │
T18 (tsc 0 + web build + dev:server + HTTP smoke + PG integration) ← ALL
```

**T4→{T5,T7} 병렬** (A-05 해결). T3 와 T10 은 `apps/server/src/panel/` 내부 서로 다른 파일 수정 (T3: panel.service + image.adapter.spec. T10: alert.adapter + drift spec + adapter.spec). 서로 파일 겹침 없음 → 병렬 가능 (A-14 해결).

### 6.2 Task 수 + 예상 시간 (v2 재산정)

| Group | Tasks | 병렬 | 예상 |
|---|---|---|---|
| 1 (Mechanical + test mocks) | T1 (확장 — 추가 4 test mock file), T2 (2-hop join), T3, T4, T5, T6, T7 (full rewrite), T8 | T1/T2/T3/T6/T8 병렬, T4→{T5,T7} | ~3h |
| 2 (Alert migration) | T9 (3 shared schemas + 주석), T10/T11/T12 병렬, T13 | T9→{T10,T11,T12}→T13 | ~1.5h |
| 3 (Features) | T14 (+ controller/DTO/validation), T15 (+ integration spec), T16 | 독립 | ~3h |
| 4 (Verification) | T17, T18 (+ HTTP smoke + 2 integration specs) | 순차 | ~1h |

**Total: 18 tasks → ~22 tasks (확장), commits ~22, ~8.5h (v1 추정 6.5h + v2 scope 확장)**.

### 6.3 Execution pattern 권장

B2b 의 **TeamCreate 4-teammate** (implementer ×1-2 + reviewer ×2 + qa-verifier ×1). Group 1 병렬 task 많아 implementer 2개 spawn 권장. Integration spec (2개 신규) QA-verifier 가 돌림.

대안: `superpowers:subagent-driven-development` — scope 확장으로 TeamCreate 쪽 선호.

### 6.4 Rollback

Atomic commit 별 revert. T4 (resolver) revert 시 T5, T7 함께 revert (T7 은 T4 import 사용). T9 (shared) revert 시 T10-T13 함께 revert.

### 6.5 channel-sync caller audit (A-08, Pre-flight)

```bash
grep -rE 'syncProducts\(|syncInventory\(' apps/server/src agents/ 2>/dev/null
```

Expect: `channel-sync.controller.ts` 만 (HTTP 501 OK). Cron/worker 호출 시 fail-soft 추가 필요. 결과 이 spec 에 추가:

**Pre-flight audit 결과**: (T0 pre-flight 실행 후 기록 — implementer 가 spec 업데이트).

---

## 7. 검토/후속 작업 워크플로

### 7.1 이 spec 리뷰 절차 (완료)

1. ✅ v1 draft 작성 (2026-04-20)
2. ✅ 3-reviewer adversarial (critic + system-architect + code-reviewer subagent) 병렬 dispatch
3. ✅ v1 findings → v2 반영 (이 문서)
4. (optional) 2nd round review — budget 제약 시 skip 하고 plan 단계 review 로 대체
5. Plan 수정 (§8 findings 반영) — 현재 plan: `docs/superpowers/plans/2026-04-20-plan-b2c-dashboard.md`
6. Plan → critic + plan-eng-review (이미 1회 완료 v1 에서, v2 반영 후 재실행 optional)
7. 실행 패턴 confirm (user) + 실행
8. PR merge 후 Plan B3 / Plan D 세션 핸드오프

### 7.2 Related spec templates

- `docs/superpowers/specs/2026-04-19-plan-b2c-orders-domain-rewire-design.md` — v2 template
- `docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md` — listing-primary 패턴

---

## 8. Review findings log

### v1 findings — 3-reviewer adversarial (2026-04-20)

#### Critic (13 findings)
- **C-01 P1**: 6+ stale test/source files 누락 → **v2 §3.1 추가 (sourcing-flow, rules-flow, rules.service, snapshot.service specs + rules.service.ts:58 raw SQL + action-task.service getRelatedProducts 2-hop)**
- **C-02 P1**: profit-calculator full rewrite → **v2 §4.6 pseudocode 추가**
- **C-03 P1**: action-task getRelatedProducts 2-hop join → **v2 §4.7 pseudocode 추가**
- **C-04 P2**: dashboard-inventory.service.ts path (helpers → services) → **v2 §3.1 수정**
- **C-05 P2**: DashboardAlertItemSchema + dashboard-inventory.service:141 Alert projection → **v2 §3.1 추가**
- **C-06 P2**: rules.service.ts:58 raw SQL UPDATE products → **v2 §3.1 추가 (table name 만 수정, prepared statement 변환은 Plan B3)**
- **C-07 P2**: option-pricing-resolver shippingCost interface ↔ return type 불일치 → **v2 §4.4 ResolvedPricing 에 shippingCost + otherCost 추가**
- **C-08 P2**: profit-calculator import path rename cascade → **v2 plan T7 에 명시**
- **C-09 P2**: rules/services/types.ts ProductEvalResult.productId → masterId → **v2 §3.1 포함**
- **C-10 P3**: panel.service thumbnailGeneration → 기존 spec 반영됨, 확인 완료
- **C-11 P3**: faultBy unknown values → v2 §4.3 'unknown drop' 주석
- **C-12 P3**: 17 commits → **v2 §6.2 재산정 ~22 commits / ~8.5h**
- **C-13 P3**: KST boundary mix → v2 §5.2 integration test 커버

#### Architect (15 findings)
- **A-01 P1**: Dual aggregation paths (Order.totalPrice vs OrderLineItem) → **v2 I3 Canonical aggregation invariant — OrderLineItem 기준 통일**
- **A-02 P1**: option-pricing-resolver ownership → **v2 Plan B3 defer (common/ 유지)**
- **A-03 P1**: channel-dashboard vs finance boundary → **v2 I6 invariant 추가**
- **A-04 P2**: 3 Alert schemas shared base → **v2 Plan B3 defer (§4.5 projection 주석만 추가)**
- **A-05 P2**: T4→T5→T7 순차 → **v2 §6.1 T4→{T5,T7} 병렬 DAG**
- **A-06 P1**: ProfitLoss read/write invariant alignment → **v2 I2 invariant 보강 (B2c.orders reconcile 기준 명시)**
- **A-07 P1**: dev:server 부팅 완료 기준 부족 → **v2 §1 HTTP smoke + 2 PG integration spec 추가**
- **A-08 P2**: channel-sync cron/worker caller audit → **v2 §6.5 Pre-flight grep 명시**
- **A-09 P2**: bundle-components raw SQL → 실제 verify 결과 `product_options` 테이블명 유효 (B2a 에서 rename 안 됨), false positive
- **A-10 P1**: option-pricing-resolver flat+nested 이중 shape → **v2 §4.4 nested-only, flat 제거**
- **A-11 P2**: Boundary lte vs < → **v2 I8 invariant half-open 통일, getReturnSummary 수정**
- **A-12 P2**: 3 Alert schemas projection 주석 → **v2 §4.5 각 파일 주석 추가**
- **A-13 P1**: @Req() → @CurrentCompany() decorator → **v2 I7 invariant + §4.2 controller 수정**
- **A-14 P3**: T3 vs T10 panel file DAG → **v2 §6.1 확인 — 서로 다른 파일이므로 병렬 OK (verified)**
- **A-15 P2**: AdSnapshot listingId null → **v2 §4.6 defer note, Plan D 에서 revisit**

#### Code-reviewer (15 findings)
- **R-01 P1**: controller @Req() → @CurrentCompany() → **v2 §4.2 수정 (A-13 합류)**
- **R-02 P1**: period.split('-') 데이터 누출 → **v2 §4.2 DTO @Matches 강제**
- **R-03 P2**: Prisma spread + master override → **v2 §4.2 명시적 select (drift 방지)**
- **R-04 P2**: Number(Decimal) → .toNumber() ?? 0 → **v2 §4.2 수정**
- **R-05 P2**: bigint > 2^53 precision → **v2 §4.3 single-company scope 에서 safe note 추가**
- **R-06 P2**: Return rate > 100% 가능 → **v2 §4.3 주석 (Plan D 에서 정확도)**
- **R-07 P2**: lastSyncedAt → lastModifiedAt 이름 변경 → **v2 §4.3 API 응답 필드명 변경**
- **R-08 P2**: Alert migration ordering → **v2 §6.1 T9 → T10-T12 순차 명시**
- **R-09 P2**: targetId UUID 제약 → 수용 (DB constraint 일치)
- **R-10 P1**: resolver missed caller silent 0 → **v2 §4.4 nested-only interface 로 compile-time error 강제 (A-10 합류)**
- **R-11 P3**: COUNT(DISTINCT o.id) → **v2 §4.3 명시 — getRevenueTrend 는 OrderLineItem JOIN 이라 DISTINCT 필요, getProductRanking 도 DISTINCT 유지 (단일 order 중복 방지)**
- **R-12 P3**: groupBy _count shape → **v2 §4.3 `_count: true` flat shape**
- **R-13 P3**: profit-loss integration test 부재 → **v2 §5.2 신규 spec 추가**
- **R-14 P3**: groupBy companyId explicit → **v2 §4.3 명시**
- **R-15 P3**: hasCost 변수 undefined → **v2 §4.4 코드에 hasCost 정의 포함**

### v2 도입된 새 invariants 요약

- I3 Canonical aggregation (A-01)
- I6 Service boundary (A-03)
- I7 @CurrentCompany() enforcement (A-13/R-01)
- I8 Half-open date range (A-11)
- I2 reinforcement (A-06)

### v2 deferred to Plan B3

- A-02: option-pricing-resolver common/ → products/helpers/ 재배치
- A-04: 3 Alert schemas consolidation into shared base
- `rules.service.ts:51-62` SQL injection prepared statement 변환
- `ChannelListing.syncedAt` 컬럼 추가 (lastSyncedAt 정확도)
