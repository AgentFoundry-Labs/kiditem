# Plan B2c.orders — Orders domain lineItem rewire (spec v2)

- 작성일: 2026-04-19
- v2: 3-reviewer adversarial review (critic + architect + code-reviewer) 반영
- Status: draft-v2
- 관련 ADR: [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md), [ADR-0015](../../../.claude/docs/decisions/0015-order-schema-unification.md), [ADR-0014](../../../.claude/docs/decisions/0014-stock-mutation-single-writer.md), [ADR-0006](../../../.claude/docs/decisions/0006-authenticated-company-scope.md)
- 전제: Plan A.5 (PR #28) + B2a (PR #27) + B2b (PR #30) + B2b.refactor (PR #31) — 모두 merged
- 후속: **Plan B2c.dashboard** (dashboard + finance + channel-dashboard + channel-sync + traffic + action-task + rules + panel test fix + sourcing + processing-costs + agent-registry + ontology + master-product-resolver 삭제 + AdSnapshot TTL + uploads 결정 + **dev:server 부팅 달성**)

---

## 1. Goal

Order / OrderLineItem / ProfitLoss / SupplierProduct / MasterSupplierProduct 의 schema 변경은 이미 적용됨 (A.5 + B2a + B2b). 그러나 다음 5 services + 2 controller 가 stale schema 참조로 **tsc 73 errors** (v1 spec 측정: 73, delivery/repurchase 등 재확인 후 **실질 80+ 추정**).

| 파일 | 명목 errors | 작업 성격 |
|---|---|---|
| `orders/services/cs.service.ts` + `orders/controllers/cs.controller.ts` + `orders/dto/create-cs.dto.ts` | 1 | `CSRecord.productId` 제거 → `listingId`. DTO backward compat (productId→listingId @Transform) |
| `statistics/statistics.service.ts` | 24+ | 7 methods (overview/products/categories/delivery/grades/pareto/repurchase) 재작성. ProfitLoss include + Order/OrderLineItem mixed. |
| `supplier-stats/supplier-stats.service.ts` | 39 | `SupplierProduct.optionId` + `MasterSupplierProduct.masterId` 기반 재작성. OrderLineItem `optionId` groupBy. |
| `settlements/settlements.service.ts` + `settlements/settlements.controller.ts` | 9 | ProfitLoss(listingId) + Order-line aggregate 기반 reconcile 재작성. update() IDOR fix + KST boundary. |
| `sales-plans/sales-plans.service.ts` + `sales-plans/sales-plans.controller.ts` | 0 | **IDOR 3건 fix (update/syncActuals/delete)** + KST boundary + OrderLineItem totalPrice 정확성 검토. `create` 는 compound unique (`companyId_period`) 로 IDOR 안전. |
| `packages/shared/src/schemas/profit-loss.ts` (PLDataSchema) | — | `productId` / `sku` 필드 → `listingId` / `master*`. satisfies 체인 유지. |

목표: B2c.orders 범위에서 **해당 파일들의 tsc 0 errors** + **integration test PASS** + **unit test 커버 갱신** + **ADR-0006 IDOR compliance**.

**Non-goal (B2c.dashboard 이연)**: `dev:server` 부팅 달성, master-product-resolver 삭제, dashboard/finance/channel-dashboard/channel-sync/action-task/traffic/rules/panel/sourcing/processing-costs/agent-registry/ontology rewire, AdSnapshot.listingId null TTL, uploads 결정.

---

## 2. Context — 확정 schema (실제 파일 검증 완료)

### 2.1 ProfitLoss (`prisma/models/finance.prisma`)

```
model ProfitLoss {
  companyId String
  listingId String               // productId 제거 완료
  year Int, month Int
  revenue/cogs/commission/shippingCost/adCost/otherCost/netProfit Int
  profitRate Decimal?
  orderCount/returnCount Int
  listing ChannelListing @relation(..., onDelete: Restrict)
  @@unique([companyId, listingId, year, month])
}
```

### 2.2 Order (`prisma/models/orders.prisma`, ADR-0015)

```
model Order {
  companyId String
  platform String @db.VarChar(20), externalOrderId String @db.VarChar(60), externalNumber String?
  status String @default("pending"), orderedAt DateTime, paidAt/shippedAt/deliveredAt DateTime?
  customerName String, receiverName/Phone/Addr String?, memo String?
  trackingNumber String?, shippingCompany String?, shippingPrice Int @default(0)
  totalPrice Int @default(0)     // lineItems 합 (shipping 제외)
  listingId String?              // aggregate-level denormalize (nullable, "first lineItem listing")
  metadata Json?
  lineItems OrderLineItem[]
  returns OrderReturn[]
  listing ChannelListing? @relation(..., onDelete: SetNull)
  @@unique([companyId, platform, externalOrderId])

  // ❌ 없음: productId, quantity, product relation.
}
```

### 2.3 OrderLineItem (`prisma/models/orders.prisma`)

```
model OrderLineItem {
  companyId String (IDOR denormalize)
  orderId String
  listingOptionId String? @map("listing_option_id")  // FK ChannelListingOption (nullable unmatched)
  optionId String? @map("option_id")                 // FK ProductOption (nullable unmatched)
  productName String @default(""), optionName String?, sku String?
  quantity Int @default(1)
  unitPrice Int @default(0), totalPrice Int @default(0)
  status String @default("pending")
  externalLineId String? @db.VarChar(60)              // Coupang: vendorItemId (nullable)
  metadata Json?
  order Order @relation(onDelete: Cascade)
  listingOption ChannelListingOption? @relation(onDelete: SetNull)
  option ProductOption? @relation(onDelete: SetNull)
  @@unique([orderId, externalLineId])
  @@index([companyId]) @@index([orderId]) @@index([listingOptionId]) @@index([optionId])

  // ❌ 없음: listingId 직접 필드 (listingOption 경유만 가능)
}
```

### 2.4 OrderReturn / OrderReturnLineItem

```
model OrderReturn {
  companyId, orderId?, platform, externalReturnId?, type String ('RETURN'|'EXCHANGE'),
  status, reasonCode?, reasonText?, metadata Json?
  @@unique([companyId, platform, externalReturnId])
}
model OrderReturnLineItem {
  returnId, orderLineItemId?, optionId?, quantity Int, totalPrice, metadata Json?
  // ❌ listingId 직접 필드 없음 — orderLineItem.listingOption 경유
}
```

### 2.5 CSRecord (`prisma/models/orders.prisma`)

```
model CSRecord {
  companyId, orderId?, listingId?    // ← productId drop, listingId String?
  csType, csStatus @default("접수"), priority, assignee?, content, resolution?
  createdBy?
  listing ChannelListing? @relation(onDelete: SetNull)
}
```

### 2.6 Settlement (`prisma/models/orders.prisma`, 참고 — 레코드 테이블)

```
model Settlement {
  companyId, period String  // YYYY-MM
  expectedAmount/actualAmount/commission/shippingFee/orderCount/returnCount Int
  status String @default("pending"), notes String?
}
```

### 2.7 SalesPlan (`prisma/models/finance.prisma`)

```
model SalesPlan {
  companyId, period String                              // period = YYYY-MM
  targetRevenue Int @default(0), targetOrders Int @default(0), targetProfit Int @default(0)
  actualRevenue Int @default(0), actualOrders Int @default(0), actualProfit Int @default(0)
  notes String?
  @@unique([companyId, period])

  // ❌ 없음: status 필드 (plan 이 active/completed 개념은 별도 파생).
}
```

### 2.8 SupplierProduct / MasterSupplierProduct (`prisma/models/supply.prisma`)

```
model SupplierProduct {                 // 옵션(SKU) 단위 공급가
  supplierId, optionId                  // productId drop
  supplyPrice Int @default(0), minOrderQty Int @default(1)
  supplier Supplier, option ProductOption
  @@unique([supplierId, optionId])
}
model MasterSupplierProduct {            // Master 단위 주공급처 (supplyPrice 없음)
  masterId, supplierId                   // masterProductId → masterId, product → master
  isPrimary Boolean, minOrderQty Int, memo String?
  master MasterProduct @relation(onDelete: Cascade)
  supplier Supplier @relation(onDelete: Cascade)
  @@unique([masterId, supplierId])

  // ❌ 없음: supplyPrice 필드 (SupplierProduct 에만)
}
model Supplier {
  supplierProducts SupplierProduct[]
  masterSupplierProducts MasterSupplierProduct[]
  masterProducts MasterProduct[]          // B1 추가 — 주공급처 direct FK
  purchaseOrders PurchaseOrder[]
  payments SupplierPayment[]
}
```

### 2.9 ChannelListing / ChannelListingOption (`prisma/models/core.prisma`)

```
model ChannelListing {
  masterId, companyId, channel String, externalId String
  channelName String?              // ← title 아님, channelName
  channelPrice Int?, status?, exposureStatus?
  deliveryChargeType/freeShipOverAmount/returnCharge/deliveryInfo
  isDeleted Boolean @default(false), deletedAt DateTime?
  master MasterProduct @relation(onDelete: Restrict)   // ← masterProduct 아님, master
  options ChannelListingOption[]
  reviews/itemWinners/trafficStats/adSnapshots/thumbnails/thumbnailTrackings/ads/adActions/orders/unshippedItems/shipments/csRecords/profitLoss (back-relations)
  @@unique([channel, externalId])
}
model ChannelListingOption {
  listingId, optionId?, companyId
  vendorItemId String @db.VarChar(60), itemName?, salePrice Int?
  isActive Boolean @default(true), isUnmatched Boolean @default(false)
  listing ChannelListing (Cascade)
  option ProductOption? (SetNull)
  orderLineItems OrderLineItem[]   // 역관계
}
```

### 2.10 MasterProduct / ProductOption (참고)

- MasterProduct: `id, companyId, code (master_code), name, category String?, abcGrade String?, costPrice, sellPrice, commissionRate, thumbnailUrl String?, isDeleted, deletedAt`
- ProductOption: `id, masterId, companyId, sku, optionName?, barcode?, legacyCode?, costPrice, sellPrice, commissionRate, isDeleted, deletedAt`

---

## 3. Aggregation path decision — OrderLineItem 과 listing 집계

`OrderLineItem` 에 `listingId` 직접 필드 **없음**. 집계 경로 3가지:

### Path A: ProfitLoss.listingId 기반 (snapshot)

```ts
prisma.profitLoss.findMany({
  where: { companyId, year, month },
  include: { listing: LISTING_WITH_MASTER_SELECT_EXTENDED }
})
```

- 용도: **statistics.products / categories / grades / pareto** (월별 리포트성 지표)
- 장점: 단일 테이블 쿼리. listingId 직접 필드. ProfitLoss 가 이미 listing 레벨 집계 완료.
- 제약: 실시간 아닌 스냅샷 (ProfitLoss 는 배치로 업데이트).

### Path B: OrderLineItem + listingOption 경유 (실시간 listing 집계)

두 sub-path:

**B-1: findMany + include + JS aggregate**
```ts
const lines = await prisma.orderLineItem.findMany({
  where: {
    order: { companyId, orderedAt: { gte, lt }, status: { notIn: ['cancelled', 'returned'] } }
  },
  select: {
    quantity: true, totalPrice: true, optionId: true,
    listingOption: { select: { listingId: true } }
  }
});
// JS: Map<listingId, { totalPrice, quantity, count }> reduce
const byListing = new Map<string, { totalPrice: number; quantity: number; count: number }>();
for (const l of lines) {
  const lid = l.listingOption?.listingId ?? null;
  if (!lid) continue;   // unmatched line skip
  const entry = byListing.get(lid) ?? { totalPrice: 0, quantity: 0, count: 0 };
  entry.totalPrice += l.totalPrice;
  entry.quantity += l.quantity;
  entry.count += 1;
  byListing.set(lid, entry);
}
```

- 장점: Prisma type-safe, schema 변경 無
- 제약: JS aggregate 비용. 대량 라인 (월 5만+) 에서 메모리 압력.

**B-2: `$queryRaw` JOIN 집계**
```ts
const rows = await prisma.$queryRaw<Array<{ listing_id: string; total_price: number; quantity: number; count: bigint }>>`
  SELECT clo.listing_id, SUM(oli.total_price)::int AS total_price, SUM(oli.quantity)::int AS quantity, COUNT(*)::bigint AS count
  FROM order_line_items oli
  JOIN channel_listing_options clo ON oli.listing_option_id = clo.id
  JOIN orders o ON oli.order_id = o.id
  WHERE o.company_id = ${companyId}::uuid
    AND o.ordered_at >= ${periodStart}
    AND o.ordered_at < ${periodEnd}
    AND o.status NOT IN ('cancelled', 'returned')
  GROUP BY clo.listing_id
`;
```

- 장점: DB-level 집계. 성능 best. dashboard/finance 가 이미 `$queryRaw` 사용 (선례).
- 제약: Type safety 약함. SQL injection 주의 (Prisma template literal 로 안전).

### Path C: OrderLineItem.optionId groupBy (option 단위 집계)

```ts
prisma.orderLineItem.groupBy({
  by: ['optionId'],
  where: {
    order: { companyId, orderedAt: { gte, lt }, status: { notIn: ['cancelled', 'returned'] } }
  },
  _sum: { totalPrice: true, quantity: true },
  _count: { _all: true }
})
```

- 용도: **supplier-stats** (SupplierProduct.optionId 매칭, option 단위 공급가)
- 장점: groupBy 직접 가능 (optionId 실존 필드). supplier 도메인 자연.
- 제약: `optionId` nullable — unmatched line 은 groupBy 결과에 null 키.

### 서비스별 선택

| 서비스 | 메서드 | Path |
|---|---|---|
| **statistics.overview** | totalRevenue/Profit/Orders (ProfitLoss agg) + totalProducts (count) | A + count 정의 재결정 (§4.2) |
| **statistics.products** | 월별 listing 매출 | A |
| **statistics.categories** | 카테고리별 매출 roll-up | A (`listing.master.category`) |
| **statistics.delivery** | 배송 통계 + daily orders (Shipment + Order.lineItems) | **B-1** (Order.lineItems reduce for `quantity`) |
| **statistics.grades** | ABC 등급별 roll-up | A (`listing.master.abcGrade`) |
| **statistics.pareto** | top 20 + cumulative | A |
| **statistics.repurchase** | 상품별 반복 구매 (receiver 기반) | **B-1** (lineItem.listingOption.listingId 또는 master level) |
| **settlements.reconcile** | PL vs Order 비교 (listing 단위) | **B-2 $queryRaw** (perf + DB-level GROUP BY) |
| **sales-plans.syncActuals** | period 누적 Order.totalPrice | 기존 `Order.aggregate` 유지 + KST boundary 보정. lineItem 미사용. |
| **supplier-stats.getSupplierStats** | supplier 별 optionId 매출 | **C** (option level groupBy) |
| **supplier-stats.getAllSupplierStats** | 회사 전체 supplier map | **C** + chunked IN (>1000 optionIds 시) |

---

## 4. Schema rewire 규칙 (10 patterns, 검증 완료)

| # | 금지 패턴 | 대체 |
|---|---|---|
| 1 | `prisma.product.*` | 맥락 확인 후 `prisma.masterProduct.*` (product family) 또는 `prisma.productOption.*` (SKU) 또는 `prisma.channelListing.*` (channel). `statistics.overview.totalProducts` 는 **§4.2** 참조 (MasterProduct count 결정). |
| 2 | `Order.productId` select/where/groupBy | Path B/C 선택. Order 에 `listingId?` (aggregate-level, nullable) 존재하나 line 레벨 집계엔 부적합. |
| 3 | `Order.quantity` select/sum | `Order.lineItems.reduce((s, li) => s + li.quantity, 0)` 또는 `OrderLineItem.quantity` sum via groupBy. |
| 4 | `ProfitLoss.productId` where | `ProfitLoss.listingId`. |
| 5 | `ProfitLoss.product` include | `ProfitLoss.listing: { select: LISTING_WITH_MASTER_SELECT_EXTENDED }` (§5.1). 응답 shape: `listing.master.name` / `listing.master.abcGrade` / `listing.channelName` / `listing.master.category`. |
| 6 | `CSRecord.productId` create/where | `CSRecord.listingId`. DTO `productId` 는 `@Transform` 으로 `listingId` 매핑 (backward compat). |
| 7 | `SupplierProduct.productId` | `SupplierProduct.optionId`. `product` include → `option` include + `option.master` nested. |
| 8 | `MasterSupplierProduct.masterProductId` / `product`/`masterProduct` include | `masterId` / `master` include. **`supplyPrice` 필드 없음** — master-path 응답에서 `supplyPrice: null` 또는 `avg(primary option's SupplierProduct.supplyPrice)` (§4.3 결정). |
| 9 | `Supplier.supplierProducts` / `Supplier.masterSupplierProducts` 접근 | `include: { supplierProducts: {...}, masterSupplierProducts: {...} }` 명시. Prisma relation auto-include 안 함. |
| 10 | `findUnique({ id })` single GET/PATCH/DELETE | `findFirst({ where: { id, companyId } })`. ADR-0006 IDOR 방어. 컨트롤러 `@CurrentCompany()` + 서비스 signature 업데이트. |

### ChannelListing field 실명 (v1 spec 오기재 수정)

- ✓ `master` (relation, NOT `masterProduct`)
- ✓ `channelName` (field, NOT `title`)
- ✓ `channel`, `externalId`, `isDeleted`, `options`

### OrderLineItem field 실명

- ✓ `listingOptionId` (FK ChannelListingOption, nullable)
- ✓ `optionId` (FK ProductOption, nullable)
- ✓ `sku`, `productName`, `optionName`, `unitPrice`, `quantity`, `totalPrice`, `externalLineId` (nullable)
- ❌ `listingId` (없음 — listingOption 경유만)

---

## 5. Service 별 재설계

### 5.1 Common preset — `apps/server/src/common/listing-select.ts`

```ts
import type { Prisma } from '@prisma/client';

// Listing + master + category (B2b LISTING_SUMMARY_SELECT 확장)
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

// Option hydration 이 필요한 경우 별도 preset (perf 분리)
export const LISTING_WITH_OPTIONS_SELECT = {
  ...LISTING_WITH_MASTER_SELECT_EXTENDED,
  options: {
    where: { isActive: true, isUnmatched: false },
    select: {
      id: true,
      vendorItemId: true,
      option: { select: { id: true, sku: true, optionName: true } },
    },
  },
} as const satisfies Prisma.ChannelListingSelect;
```

- 파일 위치: `apps/server/src/common/listing-select.ts`
- B2b `LISTING_SUMMARY_SELECT` (advertising/services/types.ts) 는 그대로 유지 (adversting 전용 축소 버전 — `channelName` + `master { id code name }` 만). B2c 의 EXTENDED 는 `category/abcGrade/thumbnailUrl` 추가.
- OPTIONS split: statistics/settlements 는 options 불필요 → EXTENDED. supplier-stats 는 options 필요 → `LISTING_WITH_OPTIONS_SELECT` 또는 별도 supplier 전용 preset. 차후 필요 시 advertising 과 common 통합은 Plan B2c.dashboard 또는 B3 재평가 (지금은 2 preset 공존).

### 5.2 KST boundary helper — `apps/server/src/common/kst.ts` 확장

기존 `common/kst.ts` 에 `KST_OFFSET_MS` 상수 + `kstDayStart` 존재. 추가:

```ts
/**
 * Returns the UTC Date that equals '{year}-{month}-01 00:00:00+09:00' (KST midnight).
 * month 는 1-12. month === 13 이면 다음해 1월로 wrap (reconcile 의 periodEnd 용).
 *
 * Example: kstMonthStart(2026, 4) → 2026-03-31T15:00:00Z (= 2026-04-01T00:00:00+09:00 KST)
 */
export function kstMonthStart(year: number, month: number): Date {
  const y = month === 13 ? year + 1 : year;
  const m = month === 13 ? 1 : month;
  // Build UTC midnight of that KST-date, then subtract the KST offset to get the UTC Date
  // representing midnight in Seoul.
  return new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
}
```

`KST_OFFSET_MS` 재사용으로 negative-hour trick 회피. `kstDayStart` 의 naming + 구조 일관.

Settlements.reconcile + statistics (buildPeriodFilter) + sales-plans.syncActuals 의 `new Date(year, month-1, 1)` 를 `kstMonthStart(year, month)` / `kstMonthStart(year, month+1)` 로 교체.

---

### 5.3 `orders/services/cs.service.ts` (1 error + backward compat)

#### 현 문제

- `create()` 에 `productId` 필드 전달 (line 79). `CSRecord.productId` drop → TS2353.
- DTO class 실명: `CreateCsBodyDto` (apps/server/src/orders/dto/create-cs.dto.ts).

#### 변경

- `CreateCsBodyDto`: `listingId?: string` (UUID) 추가. `productId?: string` 유지하되 `@Transform` 으로 listingId 로 매핑:

```ts
@IsOptional() @IsUUID() listingId?: string;

/** @deprecated use listingId. Legacy frontend fallback. */
@IsOptional() @IsUUID()
@Transform(({ value, obj }) => {
  if (value && !obj.listingId) { obj.listingId = value; }
  return value;
})
productId?: string;
```

- `CsService.create(data, companyId)`: 시그니처 유지, 내부에서 `listingId ?? productId` 로 resolve → `prisma.cSRecord.create({ data: { ..., listingId: resolved ?? null, ... } })`.
- `global ValidationPipe { whitelist: true, transform: true }` 가 unknown 제거하지만 `productId` 는 DTO 에 유지하므로 whitelist pass.
- Backward compat 기간: Plan D (frontend) 완료 후 후속 PR 에서 `productId` 완전 제거 (새 ADR 필요 없음, deprecation 주석 + 로그).

#### 테스트

- Unit (`orders/__tests__/cs.service.spec.ts`):
  - `create({ listingId })` → listingId 저장 OK.
  - `create({ productId })` → @Transform 이 listingId 로 매핑, 저장 OK.
  - `create({ listingId, productId })` → listingId 우선 (productId 무시).
  - `create({})` → listingId null.
- Controller e2e: DTO validation `listingId` UUID + optional.

---

### 5.4 `statistics/statistics.service.ts` (24+ errors, 7 methods)

#### `overview(companyId, period?)` (1 error)

**현재**: `prisma.product.count({ where: { companyId } })` → Product 모델 제거 → TS2339.

**변경**: Business decision — "총 상품 수" 의 의미를 결정.
- 권장: **`prisma.masterProduct.count({ where: { companyId, isDeleted: false } })`** (product family 단위 count, 기존 의미에 가장 가까움. 3-layer 에서 "하나의 제품" = MasterProduct).
- 대안 확인 후 B2c.orders plan 에서 확정 (dashboard KPI 와 정합성).

#### `products(companyId, period?)` (~8 errors)

**현재**: ProfitLoss.include.product + product.name/category/abcGrade/thumbnailUrl + r.productId/product.*.

**변경**:
```ts
const records = await this.prisma.profitLoss.findMany({
  where: { companyId, ...this.buildPlPeriodFilter(period) },
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
```

**응답 shape 변경**: `productId` → `listingId` + `masterId` 추가, `productName` → `listing.master.name`, `grade` → `listing.master.abcGrade`, `category` → `listing.master.category`. Frontend 는 Plan D 에서 재배선.

#### `categories(companyId, period?)` (~3 errors)

**현재**: ProfitLoss.include.product.category로 그룹.

**변경**: `include: { listing: { select: { master: { select: { category: true } } } } }`. `const cat = r.listing.master.category ?? '미분류';`.

#### `delivery(companyId, period?)` (~2 errors)

**현재**: `prisma.order.findMany({ select: { ..., totalPrice, quantity } })` + `o.quantity` 합산.

**변경**: Path B-1.
```ts
const dailyOrders = await this.prisma.order.findMany({
  where: { companyId, orderedAt: { gte: thirtyDaysAgo, lte: now }, status: { notIn: ['cancelled', 'returned'] } },
  select: {
    orderedAt: true,
    totalPrice: true,
    lineItems: { select: { quantity: true } },
  },
});
for (const o of dailyOrders) {
  const qty = o.lineItems.reduce((s, li) => s + li.quantity, 0);
  // ... entry.qty += qty;
}
```

- `thirtyDaysAgo`/`now` 는 KST 로 보정 여부 plan 에서 결정 (현재 UTC 로 계산 중. 30일 롤링 윈도우라 약간의 오차 허용).

#### `grades(companyId, period?)` (~2 errors)

**현재**: ProfitLoss.include.product.abcGrade.

**변경**: `include: { listing: { select: { master: { select: { abcGrade: true } } } } }`. `const grade = r.listing.master.abcGrade ?? 'N/A';`.

#### `pareto(companyId, period?)` (~3 errors)

**현재**: ProfitLoss.include.product + product.name/abcGrade + r.productId.

**변경**:
```ts
include: { listing: { select: { master: { select: { id: true, name: true, abcGrade: true } } } } }
// map: { id: r.listingId, rank: ..., name: r.listing.master.name, currentGrade: r.listing.master.abcGrade ?? 'N/A', ... }
```

#### `repurchase(companyId, period?)` (~7 errors)

**현재**: Order 에서 productId filter + product include + o.productId map key + o.product.name/category.

**변경**: Path B-1. Order → listingOption.listingId + master (또는 listing) 기준 group.
- 정책 결정: repurchase 단위를 **listing** 으로 할지 **master (family)** 로 할지. 원래 코드는 "product" = 단일 상품 = (3-layer 전) Product. 전환 옵션:
  - **Option X (listing 단위)**: 채널별 listing 이 다르면 별도 상품으로 간주. eCommerce 정의엔 자연.
  - **Option Y (master 단위)**: 동일 MasterProduct 면 동일 상품. 집계가 더 정확. 권장.
  - Plan 단계에서 최종 결정 후 T-task 고정. spec 은 **Y 권장** 명시.

권장 Option Y 재작성:
```ts
const lines = await this.prisma.orderLineItem.findMany({
  where: {
    order: { companyId, ...whereOrder, status: { notIn: ['cancelled', 'returned'] } },
    listingOptionId: { not: null },
  },
  select: {
    quantity: true,
    order: { select: { receiverName: true } },
    listingOption: { select: { listing: { select: { masterId: true, master: { select: { name: true, category: true } } } } } },
  },
});
const masterMap = new Map<string, { productName: string; category: string | null; customers: Set<string>; orderCount: number }>();
for (const l of lines) {
  const master = l.listingOption?.listing?.master;
  const masterId = l.listingOption?.listing?.masterId;
  if (!masterId) continue;
  const entry = masterMap.get(masterId) ?? { productName: master?.name ?? '', category: master?.category ?? null, customers: new Set(), orderCount: 0 };
  if (l.order.receiverName) entry.customers.add(l.order.receiverName);
  entry.orderCount += 1;
  masterMap.set(masterId, entry);
}
// 응답 shape: { productId → masterId, productName, category, orderCount, customers.size }
```

`totalCustomers/repeatCount/repurchaseRate` 는 `Order` level 로 기존 유지 (receiver 집계). 단, `Order.totalPrice` 필드는 유지됨 (no change).

#### 테스트

- Unit: 7 methods × happy/empty/boundary. 특히 repurchase 의 null listingOption 처리.
- Integration (`statistics-flow.pg.integration.spec.ts`): 3-4 ProfitLoss + 2 Order × 3 lineItem fixture → products/categories/grades/pareto/repurchase/delivery 각 검증. overview 의 masterProduct count 정확성.

---

### 5.5 `supplier-stats/supplier-stats.service.ts` (39 errors)

#### 구조

- `getAll(companyId)` — 회사 전체 supplier 별 통계 map.
- `getSupplier(id, companyId)` — 단일 supplier detail.

#### 변경 원칙

- Supplier → Option → OrderLineItem groupBy (Path C).
- Supplier → Master (MasterSupplierProduct) → Option → OrderLineItem groupBy.
- MasterSupplierProduct 응답의 `supplyPrice` 는 **null** (Master level 에 없음). 또는 primary option 의 `SupplierProduct.supplyPrice` join (복잡, 우선 null).

#### 주요 재작성

```ts
// Step 1: company 내 모든 supplier + options 수집
const suppliers = await this.prisma.supplier.findMany({
  where: { companyId },
  include: {
    supplierProducts: {
      include: { option: { select: { id: true, sku: true, optionName: true, masterId: true, master: { select: { id: true, code: true, name: true } } } } },
    },
    masterSupplierProducts: {
      include: { master: { select: { id: true, code: true, name: true } } },
    },
  },
});

// Step 2: 모든 optionIds 수집 (1000+ 시 chunk)
const optionIds = suppliers.flatMap((s) => s.supplierProducts.map((sp) => sp.optionId));
const CHUNK = 1000;
const groupByResults: Array<{ optionId: string | null; _sum: { totalPrice: number | null; quantity: number | null }; _count: { _all: number } }> = [];
for (let i = 0; i < optionIds.length; i += CHUNK) {
  const chunk = optionIds.slice(i, i + CHUNK);
  const rows = await this.prisma.orderLineItem.groupBy({
    by: ['optionId'],
    where: {
      optionId: { in: chunk },
      order: { companyId, status: { notIn: ['cancelled', 'returned'] } },
    },
    _sum: { totalPrice: true, quantity: true },
    _count: { _all: true },
  });
  groupByResults.push(...rows);
}
const byOption = new Map(groupByResults.map((r) => [r.optionId!, r]));

// Step 3: supplier 별 stats 조립
return suppliers.map((s) => {
  const optionStats = s.supplierProducts.map((sp) => {
    const row = byOption.get(sp.optionId);
    return {
      optionId: sp.optionId, sku: sp.option.sku, optionName: sp.option.optionName,
      masterId: sp.option.master.id, masterCode: sp.option.master.code, masterName: sp.option.master.name,
      supplyPrice: sp.supplyPrice, minOrderQty: sp.minOrderQty,
      totalRevenue: row?._sum.totalPrice ?? 0, totalQuantity: row?._sum.quantity ?? 0, orderCount: row?._count._all ?? 0,
    };
  });
  const masterStats = s.masterSupplierProducts.map((msp) => ({
    masterId: msp.masterId, masterCode: msp.master.code, masterName: msp.master.name,
    isPrimary: msp.isPrimary, minOrderQty: msp.minOrderQty, memo: msp.memo,
    supplyPrice: null,  // MasterSupplierProduct 에 supplyPrice 없음 (§4.3 결정)
    // 필요 시 primary option 의 SupplierProduct.supplyPrice 로 채움 — follow-up
  }));
  return { supplier: { id: s.id, name: s.name, status: s.status }, optionStats, masterStats };
});
```

#### 응답 shape 변경

- `productId` → `optionId` + `masterId` 추가.
- `product.name/sku` → `option.sku / masterName`.
- MasterSupplierProduct 레벨 `supplyPrice: null` (deprecation note in CLAUDE.md 또는 shared schema).

#### 테스트

- Unit: 3 supplier × 2 option × 3 orderLineItem, `supplyPrice: null` 에 대한 명시 assertion.
- Integration (`supplier-stats-flow.pg.integration.spec.ts`): real Postgres + chunk limit (100 optionIds 로 CHUNK=50 으로 낮춰 경로 검증).

---

### 5.6 `settlements/settlements.service.ts` + `settlements.controller.ts` (9 + IDOR)

#### reconcile 재작성 (Path B-2 $queryRaw 권장)

```ts
async reconcile(companyId: string, period: string) {
  const [year, month] = period.split('-').map(Number);
  const periodStart = kstMonthStart(year, month);
  const periodEnd = kstMonthStart(year, month + 1);

  // 1. ProfitLoss (listing hydration)
  const plRecords = await this.prisma.profitLoss.findMany({
    where: { companyId, year, month },
    include: { listing: { select: LISTING_WITH_MASTER_SELECT_EXTENDED } },
  });

  // 2. Order → listing 단위 집계 ($queryRaw JOIN)
  const rows = await this.prisma.$queryRaw<Array<{ listing_id: string; total_price: number; order_count: bigint }>>`
    SELECT clo.listing_id AS listing_id,
           SUM(oli.total_price)::int AS total_price,
           COUNT(DISTINCT o.id)::bigint AS order_count
      FROM order_line_items oli
      JOIN channel_listing_options clo ON oli.listing_option_id = clo.id
      JOIN orders o ON oli.order_id = o.id
     WHERE o.company_id = ${companyId}::uuid
       AND o.ordered_at >= ${periodStart}
       AND o.ordered_at <  ${periodEnd}
       AND o.status NOT IN ('cancelled', 'returned')
     GROUP BY clo.listing_id
  `;
  const orderMap = new Map(rows.map((r) => [r.listing_id, { total: r.total_price, count: Number(r.order_count) }]));

  // 3. 매칭 + diff
  let totalPlRevenue = 0, totalOrderRevenue = 0, matched = 0, mismatched = 0;
  const details = plRecords.map((r) => {
    const od = orderMap.get(r.listingId) ?? { total: 0, count: 0 };
    const revenueDiff = r.revenue - od.total;
    const status = Math.abs(revenueDiff) <= 100 ? 'matched' : Math.abs(revenueDiff) <= 1000 ? 'minor_diff' : 'mismatch';
    totalPlRevenue += r.revenue; totalOrderRevenue += od.total;
    if (status === 'matched') matched++; else mismatched++;
    return {
      listingId: r.listingId,
      externalId: r.listing.externalId,
      channelName: r.listing.channelName,
      masterCode: r.listing.master.code,
      masterName: r.listing.master.name,
      plRevenue: r.revenue, plCommission: r.commission, plNetProfit: r.netProfit, plOrderCount: r.orderCount,
      orderTotal: od.total, orderCount: od.count, revenueDiff, isMatched: status === 'matched', status,
    };
  });

  return {
    success: true, period,
    summary: {
      totalPlRevenue, totalOrderRevenue,
      totalCommission: plRecords.reduce((s, r) => s + r.commission, 0),
      totalShipping: plRecords.reduce((s, r) => s + r.shippingCost, 0),
      revenueDifference: totalPlRevenue - totalOrderRevenue,
      productCount: details.length,
      orderCount: rows.reduce((s, r) => s + Number(r.order_count), 0),
      matchedCount: matched, mismatchCount: mismatched,
      matchRate: details.length > 0 ? Math.round((matched / details.length) * 100) : 0,
    },
    details,
  };
}
```

#### update() IDOR fix — 컨트롤러 + 서비스 둘 다 변경

`settlements.controller.ts:34`:
```ts
@Patch(':id')
update(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,   // ← 추가
  @Body() dto: UpdateSettlementDto,
) {
  return this.settlementsService.update(id, companyId, dto);   // ← 추가
}
```

`settlements.service.ts:127`:
```ts
async update(id: string, companyId: string, dto: UpdateSettlementDto) {
  const existing = await this.prisma.settlement.findFirst({
    where: { id, companyId },
  });
  if (!existing) throw new BadRequestException('정산 내역을 찾을 수 없습니다');
  return this.prisma.settlement.update({ where: { id }, data: { ... } });
}
```

#### 테스트

- Unit: reconcile tolerance 경계 (±100, ±1000), update IDOR (cross-company 차단), period 파싱.
- Integration (`settlements-flow.pg.integration.spec.ts`): 2 ProfitLoss + 2 Order × 2 lineItem fixture + 매칭 / 불일치 시나리오 + KST 월 경계 테스트.

---

### 5.7 `sales-plans/sales-plans.service.ts` + `sales-plans.controller.ts`

#### 현 상태

- tsc 0 errors (compile 통과, `Order.totalPrice` + `Order.aggregate` 유효).
- **IDOR 4건**: `update(id, dto)`, `syncActuals(id)`, `delete(id)` 모두 `findUnique({ where: { id } })` (companyId 누락). `create` 는 compound unique (companyId_period) 이라 OK.
- `syncActuals()` 는 Order.totalPrice sum + ProfitLoss.netProfit sum 으로 actual 계산. 이건 schema 변경과 무관하므로 OK.
- `buildPeriodRange(period)` 또는 동급 로직에 `new Date(year, month-1, 1)` 사용 시 KST 보정 필요.

#### 변경

- 컨트롤러 (`sales-plans.controller.ts`):
  - `@Patch(':id')` → `@CurrentCompany() companyId` 주입 → `update(id, companyId, dto)`.
  - `@Patch(':id/sync')` → `@CurrentCompany() companyId` → `syncActuals(id, companyId)`.
  - `@Delete(':id')` → `@CurrentCompany() companyId` → `delete(id, companyId)`.
- 서비스:
  - `update(id, companyId, dto)`: `findFirst({ where: { id, companyId } })`.
  - `syncActuals(id, companyId)`: 동상. + 내부 date filter 를 `kstMonthStart` 로 교체.
  - `delete(id, companyId)`: 동상.

#### 테스트

- Unit: IDOR cross-company → NotFound, syncActuals 의 period → KST 월 경계 내 Order 만 집계.
- Integration: 2 company × 2 SalesPlan → cross-tenant 접근 차단 검증.

---

## 6. @kiditem/shared 업데이트

### 6.1 PLDataSchema (`packages/shared/src/schemas/profit-loss.ts`)

기존:
```ts
export const PLDataSchema = z.object({
  productId: z.string(), sku: z.string().nullable(), ..., revenue, netProfit, ...
});
```

변경:
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
  // ...financial fields unchanged
  revenue: z.number().int(), netProfit: z.number().int(), orderCount: z.number().int(), ...
});
```

- `productId` 완전 제거 or deprecated alias 유지? **완전 제거 권장** — frontend 는 Plan D 에서 일괄 재배선. backend 의 `satisfies PLData` 는 구 필드 없으면 컴파일 에러로 drift detect.
- **apps/web 컴파일 파급 (인지 + 수용)**: `apps/web/src/app/profit-loss/page.tsx` + `components/ProfitLossTable.tsx` 가 `d.productName` / `d.sku` / `d.company` / `d.grade` 사용. PLDataSchema 완전 교체 시 apps/web 빌드 실패. 이는 **B2b 관례 유지** — `apps/web` 빌드 일시 실패 허용 (Plan D 대기). Success criteria 에 `apps/web` 빌드 검증 포함하지 않음 (§8 유지).
- 신규 schema: `StatisticsProductsResponse`, `SettlementsReconcileResponse`, `SupplierStatsResponse` — listing-based 응답 shape. frontend consumer 는 Plan D.

### 6.2 OrderSchema 등 (변경 없음 확인)

`packages/shared/src/schemas/order.ts` 는 A.5 에서 listingId/lineItems 포함으로 완성. B2c.orders 는 재수정 없음.

### 6.3 shared build 검증

```bash
cd packages/shared && npm run build
```

에러 0. 타입 export 확인.

---

## 7. Out of scope

| 항목 | 이연 | 이유 |
|---|---|---|
| `master-product-resolver.ts` 삭제 | B2c.dashboard | traffic/profit-calculator 사용 |
| `dev:server` 부팅 달성 | B2c.dashboard | dashboard/finance/rules/action-task/channel-sync 등 100+ 잔존 에러 |
| dashboard / finance / channel-dashboard / channel-sync / action-task / traffic / rules / panel / sourcing / processing-costs / agent-registry / ontology | B2c.dashboard | cohesion |
| AdSnapshot.listingId null TTL | B2c.dashboard | Ad 도메인 |
| `uploads.processAdCsv` 재구현 여부 | B2c.dashboard | B3 이연 유력 |
| Picking generate 재설계 (OrderLineItem 기반) | Plan B2.picking | 별도 plan |
| Frontend contract 업데이트 (`productId` → `listingId`) | Plan D | backend 완료 후 일괄 |
| Statistics/Settlements/Supplier-stats 의 `@kiditem/shared` new response schemas (frontend consumer 관점) | Plan D | 이 plan 은 PLDataSchema 까지 |

---

## 8. Success criteria

| 항목 | 측정 |
|---|---|
| Type 체크 (scope) | `cd apps/server && npx tsc --noEmit 2>&1 \| grep -cE "^src/(orders/services/cs\|orders/controllers/cs\|orders/dto/create-cs\|statistics\|supplier-stats\|settlements\|sales-plans)"` → `0` |
| Type 체크 (shared) | `cd packages/shared && npm run build` → 0 errors |
| Lint | `cd apps/server && npm run lint` → scope 파일 0 warnings |
| Unit | `cd apps/server && npx vitest run src/orders src/statistics src/supplier-stats src/settlements src/sales-plans` → PASS |
| Integration | `npm run test:integration` → 신규 3-4 `.pg.integration.spec.ts` PASS (statistics-flow / supplier-stats-flow / settlements-flow / sales-plans-flow optional) |
| ADR-0006 | `grep -rE "getDefaultCompanyId\|companyId\\s*=\\s*null" apps/server/src/{orders,statistics,supplier-stats,settlements,sales-plans}` → 0 |
| IDOR (mutation) | `grep -rE "findUnique\\(\\{\\s*where:\\s*\\{\\s*id:\\s*[a-zA-Z]" apps/server/src/{orders,statistics,supplier-stats,settlements,sales-plans}` → 0 (compound unique `findUnique({ where: { companyId_period: ... } })` 는 허용) |
| Stale schema grep | `grep -rE "prisma\\.product\\.\|\\.productId\\b\|Ad\\.productId\|Order\\.quantity" apps/server/src/{orders,statistics,supplier-stats,settlements,sales-plans}` → 0 |
| Shared | `grep -rE "productId" packages/shared/src/schemas/profit-loss.ts` → 0 |

실측 baseline (v2 작성 시점):
- tsc scope 0 검증 전 baseline: **73+ (실측)**. 플랜 T1 에서 정확 숫자 재측정.
- `dev:server` 전체 부팅 달성은 **non-goal** — B2c.dashboard 다음.

---

## 9. 위험 / 엣지 케이스

### 9.1 OrderLineItem.listingOptionId 가 nullable

- Unmatched line (채널 sync 에서 vendorItemId 매칭 실패) → `listingOptionId: null`. Path B-1/B-2 는 `WHERE listing_option_id IS NOT NULL` 또는 `listingOption: { isNot: null }` 필터 필요. spec 예시는 WHERE 절 생략 (JOIN 이 inner join 으로 자동 제외). NULL 라인은 listing 집계에서 배제되나 totalRevenue 에선 누락 → 리포트상 "미매칭 매출" 카운트 분리 검토 가능 (B2c.dashboard 에서 dashboard-inventory unmatched rate 와 연계 고려).

### 9.2 OrderLineItem.optionId 가 nullable

- Supplier-stats Path C 의 groupBy 결과에 `optionId: null` 행 포함 → 집계 skip. Supplier 의 공급 option 과 매칭 안되는 주문(미등록 product) 은 supplier stats 에 미포함.

### 9.3 Order.status vs OrderLineItem.status

- ADR-0015: 두 status 독립. B2c.orders 의 모든 집계는 **Order.status NOT IN ('cancelled','returned')** 기반 (기존 동작 보존). line 레벨 부분 취소는 Plan B2.picking 이후 재평가.

### 9.4 ProfitLoss.listing.isDeleted 처리

- `ProfitLoss.listing` 이 `onDelete: Restrict` — ChannelListing 삭제 불가. `isDeleted: true` (soft-delete) 시 어떻게?
- 서비스별 정책:
  - **statistics (user-facing analytics)**: deleted listing 도 집계에 포함 (historical accuracy). UI 에서 `isDeleted` flag 로 graying out — Plan D.
  - **settlements (finance audit)**: 무조건 전체 포함 (audit trail).
  - **supplier-stats (procurement ops)**: 전체 포함 (historical supplier performance).
- 즉 3 서비스 모두 `isDeleted` 필터 **적용 안 함**. 필요 시 Plan D 에서 flag 기반 UI 분리.

### 9.5 대규모 optionIds IN clause (supplier-stats)

- 5000+ optionIds 시 Prisma IN param 시리얼라이제이션 비용 + Postgres parse plan 저하.
- 해결: §5.5 CHUNK=1000 분할 query + merge. spec 에 명시 (`const CHUNK = 1000`).

### 9.6 $queryRaw 경로 type drift

- Prisma schema 변경 시 `$queryRaw` 의 SQL 참조 (`channel_listing_options`, `orders.company_id`, `orders.ordered_at`, `orders.status`) 는 자동 체크 안 됨.
- Plan 의 integration test 가 $queryRaw 결과 shape 을 검증 (type cast `::int`, `::bigint` 포함).

### 9.7 DTO productId backward compat TTL

- `CreateCsBodyDto.productId` 는 frontend 재배선 (Plan D) 완료 후 제거. spec 에 명시 — Plan D 머지 후 follow-up PR 에서 deprecation 주기 종료.

### 9.8 KST boundary 일관성

- `kstMonthStart(year, month+1)` 가 12월 → 다음해 1월 정확히 처리 (spec 내 helper `month === 13 ? year+1 : year` 로직 예시 포함).

---

## 10. 의존 그래프 / 순서

```
┌─────────────────────────────────────────┐
│ T1: common util 추출                     │
│   - listing-select.ts (EXTENDED + OPTS) │
│   - kst.ts (kstMonthStart 추가)         │
└─────────────────────────────────────────┘
           │
           ├──────────┬──────────┬──────────┬──────────┐
           ▼          ▼          ▼          ▼          ▼
       ┌──────┐  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
       │ cs   │  │statistics│ │supplier │ │settlement│ │sales-plan│
       │(DTO  │  │(7 methd) │ │-stats   │ │s + IDOR  │ │s + IDOR  │
       │+svc) │  │          │ │(39 err) │ │+reconcile│ │4건       │
       └──────┘  └──────────┘ └─────────┘ └──────────┘ └──────────┘
           │          │          │          │          │
           └──────────┴──────────┴──────────┴──────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ T-final: @kiditem/   │
                     │ shared PLDataSchema  │
                     │ + shared build       │
                     └──────────────────────┘
```

- T1 (util 추출) 은 4 서비스 공통 의존 → 먼저.
- cs + 4 서비스 는 T1 후 병렬 가능. 단, implementer 수에 따라 순차 실행 가능 (lead 결정).
- Shared 업데이트 는 모든 서비스가 listing 기반 response 완성 후 마지막.

---

## 11. 실행 패턴 재판단 (plan 완성 후 재확인 — user 결정)

옵션:
1. **TeamCreate 4 teammates** (B2b pattern): 15+ T-task 이고 multi-service 병렬 가능.
2. **subagent-driven-development** (B2b.refactor pattern): lead 가 매 task 후 inline 검토. scope 가 5 서비스 × 평균 3 task = 15 task 수준이라 이쪽도 가능.
3. **하이브리드**: T1 (util) + cs (단순) 은 subagent-driven, 나머지 4 서비스는 TeamCreate.

Plan 확정 후 T-task 수 + 병렬 가능도 + 복잡도 기반 user 와 재확인.

---

## 12. 참조

- v1 spec 3-reviewer findings (이 v2 의 basis): C-01~13 (critic), A-01~12 (architect), R-01~13 (code-reviewer).
- `docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md` — listing-primary 템플릿.
- `docs/superpowers/plans/2026-04-18-plan-b2b-advertising-listing-migration.md` — T-task 포맷.
- `docs/superpowers/plans/2026-04-19-plan-b2b-refactor-ad-strategy-split.md` — pure refactor 동등성 패턴.
- `apps/server/src/orders/CLAUDE.md`, `advertising/CLAUDE.md` — 도메인 규칙.
- `apps/server/src/advertising/services/types.ts:11` — `LISTING_SUMMARY_SELECT` 실 구현 (참고).
- `prisma/CLAUDE.md` + `prisma/models/` — schema source of truth.

---

## 13. 다음 단계

1. v2 spec 이 blocker 해소했는지 확인 (R-01 listingId 없음 → Path A/B/C 3-split 으로 해결, R-02 master/channelName 교정 반영).
2. 필요 시 2nd round review (critic subagent 재-review, architect/code-reviewer 는 optional). Budget 제약 시 skip 하고 plan 단계 review 로 대체.
3. Plan 작성 (`docs/superpowers/plans/2026-04-19-plan-b2c-orders-domain-rewire.md`) — T-task 분해.
4. Plan → 2 review (critic + plan-eng-review skill).
5. 실행 패턴 confirm (user) + 실행.
6. PR #? merge 후 B2c.dashboard 세션 핸드오프.
