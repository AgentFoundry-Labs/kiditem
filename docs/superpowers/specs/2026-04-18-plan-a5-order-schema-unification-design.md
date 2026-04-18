# Plan A.5 — Order Schema Unification (Design Spec)

> **Status**: Draft
> **Session**: 2026-04-18
> **Predecessors**: [Plan A spec](2026-04-17-product-schema-redesign-design.md), [Plan B1 spec](2026-04-17-plan-b1-products-module-design.md), [Plan B2a spec](2026-04-18-plan-b2a-inventory-service-layer-design.md), [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md), [ADR-0014](../../../.claude/docs/decisions/0014-stock-mutation-single-writer.md)
> **Branch**: `feat/plan-a5-order-schema` (from `origin/main`)

---

## 1. Goal

Order 도메인의 channel-leak 을 제거하고 generic `Order` (aggregate root) + `OrderLineItem` (per-SKU) + `OrderReturn` + `OrderReturnLineItem` 4 모델로 통합한다. 채널별 metadata 는 `metadata Json` 컬럼에 넣어 다채널 (Coupang/Naver/11st 등) 확장 가능한 구조 확보. `CoupangOrder`/`CoupangOrderItem`/`CoupangReturn` 폐기. `Order.productName/quantity/unitPrice` 평탄화 제거. Picking/Statistics/Settlements 등이 `OrderLineItem` 으로 SKU 해상도 가능.

본 plan 은 schema 변경 + Coupang `channel-sync.service.ts` write path 만 다룬다. 다른 read-side service (orders/returns/statistics/supplier-stats/picking 등) 의 재작성은 **Plan B2c** 범위.

## 2. Scope Decomposition

| Plan | Scope |
|---|---|
| **Plan A.5 (이 spec)** | Order/CoupangOrder/CoupangOrderItem/CoupangReturn schema 통합 + `channels/services/channel-sync.service.ts` Coupang sync rewrite + Picking module 의 Order.productId 의존 제거 (compile-broken 만 fix, 기능 재작성 X) |
| Plan B2b | Advertising service rewrite |
| Plan B2c | Orders + returns + statistics + supplier-stats + settlements + picking + dashboard-sales + sales-plans + profit-calculator + channel-dashboard 등 모든 read-side rewrite. `dev:server` 부팅 목표 |
| Plan B2.picking | Picking generate logic 를 OrderLineItem 기반으로 본격 재작성 (B2c 후) |

**중요**: A.5 머지 후에도 `dev:server` 는 부팅 안 됨 (out-of-scope service 들이 stale 한 채로 머지됨). Read-side 재작성은 B2c 가 담당.

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope files

| Path | 작업 |
|---|---|
| `prisma/models/orders.prisma` | **재작성**. `Order` 단일화 (aggregate root). `OrderLineItem` / `OrderReturn` / `OrderReturnLineItem` 신설. `CoupangOrder` / `CoupangOrderItem` / `CoupangReturn` 삭제 |
| `prisma/models/core.prisma` | `ChannelListingOption.coupangOrderItems` relation 제거 (CoupangOrderItem 폐기 따름) |
| `apps/server/src/channels/services/channel-sync.service.ts` | Coupang sync rewrite. `coupangOrder`/`coupangOrderItem` upsert → `order`/`orderLineItem` upsert. `vendorItemId` lookup 으로 `listingOption` 매칭, `optionId` denormalize |
| `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts` | sync rewrite 검증 (mock Coupang payload → Order/OrderLineItem 생성 시나리오) |
| `apps/server/src/picking/picking.service.ts` | `order.productId` / `order.product` / `order.productName` / `order.quantity` 참조 제거. `findMany({include: { lineItems: true } })` 로 변경. 신규 schema 와 컴파일 가능하게 정리. **재작성 아님** — 기능적 정합성은 Plan B2.picking |
| `apps/server/src/orders/services/returns.service.ts` | `prisma.coupangReturn` → `prisma.orderReturn` 로 단순 이름 교체. 기능 재작성은 B2c |
| `apps/server/src/orders/services/orders.service.ts` | `prisma.coupangOrder` 참조 있으면 정리. 기능 재작성은 B2c |
| `apps/server/src/dashboard/services/dashboard-sales.service.ts` | `prisma.coupangOrder` 참조 stub-out (TODO 주석으로 B2c 대기 표시). compile-broken 만 fix |
| `apps/server/src/channels/services/channel-dashboard.service.ts` | 동일 |
| `packages/shared/src/schemas/order.ts` | 신규/확장 — `Order`, `OrderLineItem`, `OrderReturn` Zod schemas. Coupang 전용 schema 정리 |
| `prisma/3layer-setup.sql` | 변경 없음 (Order schema 와 무관). Plan B2a 의 RLS/CHECK 그대로 |
| `apps/server/src/inventory/CLAUDE.md` | 영향 없음 (Plan B2a) |
| `apps/server/src/orders/CLAUDE.md` | "Plan A.5 schema 적용 — `Order` aggregate + `OrderLineItem`. Service layer rewrite 는 Plan B2c" banner |
| `apps/server/src/channels/CLAUDE.md` | sync 부분 갱신 |
| `prisma/CLAUDE.md` | orders.prisma 모델 라인업 갱신 |
| `.claude/docs/decisions/0015-order-schema-unification.md` | 신규 ADR |

### 3.2 Out-of-scope (Plan B2b/B2c/picking)

- `apps/server/src/statistics/`, `supplier-stats/`, `settlements/`, `sales-plans/`, `dashboard/helpers/profit-calculator.ts` (read-side rewrite)
- `apps/server/src/picking/` 의 generate 로직 본격 재설계
- `apps/server/src/advertising/` (B2b)
- `apps/web/*` (Plan D)

### 3.3 데이터 마이그레이션

**없음**. 사용자 명시: 기존 DB 데이터 무시하고 새로 넣음. `npm run db:push` 로 schema 갱신 + 기존 `Order`/`CoupangOrder*`/`CoupangReturn` 테이블 drop. `init.sql.gz` 는 Plan A.5 머지 후 시드 새로 생성 (별도 작업).

## 4. Schema Design

### 4.1 Order (aggregate root)

```prisma
/// @namespace Orders
/// @describe 채널-agnostic 주문 aggregate. 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem.
model Order {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid

  // External identification (per-platform)
  platform        String                                              // 'coupang' / 'naver' / '11st' / ...
  externalOrderId String    @map("external_order_id")                 // Coupang shipmentBoxId 등
  externalNumber  String?   @map("external_number")                   // display 용 (Coupang orderId)

  // Customer + receiver (denormalized, 분석용)
  customerName    String    @default("") @map("customer_name")
  receiverName    String?   @map("receiver_name")
  receiverPhone   String?   @map("receiver_phone")
  receiverAddr    String?   @map("receiver_addr")
  memo            String?

  // Status + dates
  status          String    @default("pending")
  orderedAt       DateTime  @default(now()) @map("ordered_at") @db.Timestamptz
  paidAt          DateTime? @map("paid_at") @db.Timestamptz
  shippedAt       DateTime? @map("shipped_at") @db.Timestamptz
  deliveredAt     DateTime? @map("delivered_at") @db.Timestamptz

  // Shipping
  trackingNumber  String?   @map("tracking_number")
  shippingCompany String?   @map("shipping_company")
  shippingPrice   Int       @default(0) @map("shipping_price")

  // Totals (sum of lineItems, denormalized)
  totalPrice      Int       @default(0) @map("total_price")

  // Listing 연결 (optional — multi-listing 주문은 lineItem 단위 listing)
  listingId       String?   @map("listing_id") @db.Uuid

  // Channel-specific raw payload
  metadata        Json?

  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  listing         ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)
  lineItems       OrderLineItem[]
  shipments       Shipment[]
  returns         OrderReturn[]

  @@unique([companyId, platform, externalOrderId])    // sync upsert key
  @@index([companyId])
  @@index([companyId, status])
  @@index([companyId, orderedAt])
  @@index([listingId])
  @@index([platform])
  @@map("orders")
}
```

### 4.2 OrderLineItem (per-SKU)

```prisma
/// @namespace Orders
/// @describe 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. companyId 는 IDOR 방어용 denormalize.
model OrderLineItem {
  id              String   @id @default(uuid()) @db.Uuid
  companyId       String   @map("company_id") @db.Uuid
  orderId         String   @map("order_id") @db.Uuid

  // SKU resolution chain (Coupang vendorItemId → ChannelListingOption → ProductOption)
  listingOptionId String?  @map("listing_option_id") @db.Uuid
  optionId        String?  @map("option_id") @db.Uuid                 // denormalized for query perf

  // Denormalized item info (option soft-delete 후에도 분석 가능)
  productName     String   @default("") @map("product_name")
  optionName      String?  @map("option_name")
  sku             String?

  // Quantities + prices (per-line)
  quantity        Int      @default(1)
  unitPrice       Int      @map("unit_price")
  totalPrice      Int      @map("total_price")

  // Per-line status (multi-item 부분 발송/취소)
  status          String   @default("pending")

  // External per-line identifier (Coupang vendorItemId 등)
  externalLineId  String?  @map("external_line_id")

  // Channel-specific raw payload
  metadata        Json?

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  order           Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  listingOption   ChannelListingOption? @relation(fields: [listingOptionId], references: [id], onDelete: SetNull)
  option          ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)

  @@unique([orderId, externalLineId])      // sync upsert key (per order)
  @@index([companyId])
  @@index([orderId])
  @@index([listingOptionId])
  @@index([optionId])
  @@map("order_line_items")
}
```

### 4.3 OrderReturn / OrderReturnLineItem

```prisma
/// @namespace Orders
/// @describe 채널-agnostic 반품 aggregate. CoupangReturn 의 items JSON → OrderReturnLineItem 정규화.
model OrderReturn {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid
  orderId         String?   @map("order_id") @db.Uuid                 // 매칭 안 되는 단독 반품 가능

  platform        String
  externalReturnId String   @map("external_return_id")                // Coupang receiptId 등

  status          String    @default("pending")
  reason          String    @default("")
  reasonCategory1 String?   @map("reason_category1")
  reasonCategory2 String?   @map("reason_category2")
  faultBy         String    @default("CUSTOMER") @map("fault_by")     // CUSTOMER/SELLER

  requestedAt     DateTime  @map("requested_at") @db.Timestamptz
  completedAt     DateTime? @map("completed_at") @db.Timestamptz

  metadata        Json?

  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  order           Order?              @relation(fields: [orderId], references: [id], onDelete: SetNull)
  lineItems       OrderReturnLineItem[]

  @@unique([companyId, platform, externalReturnId])
  @@index([companyId])
  @@index([status])
  @@index([requestedAt])
  @@map("order_returns")
}

/// @namespace Orders
model OrderReturnLineItem {
  id              String    @id @default(uuid()) @db.Uuid
  returnId        String    @map("return_id") @db.Uuid
  orderLineItemId String?   @map("order_line_item_id") @db.Uuid       // 매칭되면 연결, 아니면 null
  optionId        String?   @map("option_id") @db.Uuid

  productName     String    @default("") @map("product_name")
  quantity        Int

  metadata        Json?

  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  return          OrderReturn    @relation(fields: [returnId], references: [id], onDelete: Cascade)
  orderLineItem   OrderLineItem? @relation(fields: [orderLineItemId], references: [id], onDelete: SetNull)
  option          ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)

  @@index([returnId])
  @@index([optionId])
  @@map("order_return_line_items")
}
```

### 4.4 폐기

```prisma
// DROP:
//   model CoupangOrder       — 기능은 Order + metadata Json 으로 흡수
//   model CoupangOrderItem   — OrderLineItem 으로 통합
//   model CoupangReturn      — OrderReturn + OrderReturnLineItem 로 정규화
```

### 4.5 ChannelListingOption.coupangOrderItems 제거

```prisma
// 기존:
//   coupangOrderItems CoupangOrderItem[]
// 신규:
//   orderLineItems    OrderLineItem[]
```

## 5. Channel-Sync Rewrite (Coupang)

### 5.1 Order upsert

기존 `coupangOrder.upsert(by shipmentBoxId)` → 신규 `order.upsert(by [companyId, 'coupang', shipmentBoxId])`:

```ts
const order = await this.prisma.order.upsert({
  where: {
    companyId_platform_externalOrderId: {
      companyId,
      platform: 'coupang',
      externalOrderId: shipmentBoxId,
    },
  },
  update: {
    status: payload.status,
    shippedAt: payload.shippedAt,
    trackingNumber: payload.invoiceNumber,
    shippingCompany: payload.deliveryCompanyName,
    totalPrice: payload.totalPrice,
    metadata: {
      orderer: payload.orderer,
      receiver: payload.receiver,
      parcelPrintMessage: payload.parcelPrintMessage,
      shipmentBoxId,
    },
  },
  create: {
    companyId,
    platform: 'coupang',
    externalOrderId: shipmentBoxId,
    externalNumber: payload.orderId,             // display 용
    status: payload.status ?? 'ACCEPT',
    customerName: payload.orderer?.name ?? '',
    receiverName: payload.receiver?.name,
    receiverPhone: payload.receiver?.safeNumber,
    receiverAddr: payload.receiver?.fullAddress,
    orderedAt: new Date(payload.orderedAt),
    paidAt: payload.paidAt ? new Date(payload.paidAt) : null,
    shippingPrice: payload.shippingPrice ?? 0,
    totalPrice: payload.totalPrice,
    metadata: { orderer: payload.orderer, receiver: payload.receiver, parcelPrintMessage: payload.parcelPrintMessage, shipmentBoxId },
  },
});
```

### 5.2 OrderLineItem upsert (per item)

`vendorItemId` 로 `ChannelListingOption` 조회 → `optionId` denormalize:

```ts
for (const item of payload.orderItems) {
  const listingOption = await tx.channelListingOption.findFirst({
    where: { companyId, vendorItemId: item.vendorItemId },
    select: { id: true, optionId: true, option: { select: { sku: true, optionName: true } } },
  });

  await tx.orderLineItem.upsert({
    where: {
      orderId_externalLineId: {
        orderId: order.id,
        externalLineId: item.vendorItemId,
      },
    },
    update: {
      quantity: item.shippingCount,
      unitPrice: item.salesPrice,
      totalPrice: item.orderPrice,
      // listingOption 매칭이 sync 시점 변할 수 있으므로 매번 갱신
      listingOptionId: listingOption?.id ?? null,
      optionId: listingOption?.optionId ?? null,
      productName: item.sellerProductName,
      optionName: item.vendorItemName,
      sku: listingOption?.option?.sku ?? null,
      metadata: { vendorItemId: item.vendorItemId, sellerProductId: item.sellerProductId, instantCouponDiscount: item.instantCouponDiscount },
    },
    create: {
      companyId,
      orderId: order.id,
      listingOptionId: listingOption?.id ?? null,
      optionId: listingOption?.optionId ?? null,
      productName: item.sellerProductName,
      optionName: item.vendorItemName,
      sku: listingOption?.option?.sku ?? null,
      quantity: item.shippingCount,
      unitPrice: item.salesPrice,
      totalPrice: item.orderPrice,
      externalLineId: item.vendorItemId,
      metadata: { vendorItemId: item.vendorItemId, sellerProductId: item.sellerProductId, instantCouponDiscount: item.instantCouponDiscount },
    },
  });
}
```

### 5.3 OrderReturn (Coupang return sync)

`coupangReturn.upsert(by receiptId)` → `orderReturn.upsert(by [companyId, 'coupang', receiptId])`. items JSON → `OrderReturnLineItem` 다중 row.

### 5.4 Atomicity

`Order` + `OrderLineItem[]` 는 `prisma.$transaction([...])` 으로 묶어 부분 실패 방지. 단일 sync iteration 내 batch processing.

## 6. Out-of-scope service: stub-out 전략

A.5 머지 후에도 `dev:server` 부팅 필요 없음. 하지만 schema 변경으로 compile-broken 되는 service 는 다음 중 하나로 처리:

- **이미 stale (compile-broken)**: 그대로 둠 (Plan A 후 stale 인 게 더 늘어났을 뿐). B2c 가 청소.
- **새로 broken (이전엔 통과)**: stub `// @ts-expect-error Plan B2c migration` 주석 + 호출 제거. 또는 dummy return.

핵심은 **A.5 머지 후 새로 broken 되는 file 만 손대고**, 기존 stale 은 건드리지 않는다.

영향 추정 (A.5 후 신규 broken):
- `picking.service.ts` — `order.productId` `order.product` `order.productName` `order.quantity` 참조. → `findMany({include: {lineItems: true}})` 로 바꿔 lineItem 단위 처리. 기능 보존이 어려우면 stub.
- `orders/services/returns.service.ts` — `prisma.coupangReturn` 호출. → `prisma.orderReturn` 로 단순 rename.
- `dashboard-sales.service.ts` — `prisma.coupangOrder` 참조. stub.
- `channel-dashboard.service.ts` — `prisma.coupangOrder` 참조. stub.
- `orders/services/orders.service.ts` — 검사 후 필요시 stub.

## 7. Shared types

`packages/shared/src/schemas/order.ts` (신규 또는 확장):

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

export const OrderSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  platform: z.string(),
  externalOrderId: z.string(),
  externalNumber: z.string().nullable(),
  customerName: z.string(),
  receiverName: z.string().nullable(),
  receiverPhone: z.string().nullable(),
  receiverAddr: z.string().nullable(),
  memo: z.string().nullable(),
  status: z.string(),
  orderedAt: zIsoDate,
  paidAt: zIsoDate.nullable(),
  shippedAt: zIsoDate.nullable(),
  deliveredAt: zIsoDate.nullable(),
  trackingNumber: z.string().nullable(),
  shippingCompany: z.string().nullable(),
  shippingPrice: z.number().int(),
  totalPrice: z.number().int(),
  listingId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderLineItemSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  orderId: z.string().uuid(),
  listingOptionId: z.string().uuid().nullable(),
  optionId: z.string().uuid().nullable(),
  productName: z.string(),
  optionName: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  totalPrice: z.number().int(),
  status: z.string(),
  externalLineId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

export const OrderReturnSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  platform: z.string(),
  externalReturnId: z.string(),
  status: z.string(),
  reason: z.string(),
  reasonCategory1: z.string().nullable(),
  reasonCategory2: z.string().nullable(),
  faultBy: z.string(),
  requestedAt: zIsoDate,
  completedAt: zIsoDate.nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type OrderReturn = z.infer<typeof OrderReturnSchema>;

export const OrderReturnLineItemSchema = z.object({
  id: z.string().uuid(),
  returnId: z.string().uuid(),
  orderLineItemId: z.string().uuid().nullable(),
  optionId: z.string().uuid().nullable(),
  productName: z.string(),
  quantity: z.number().int(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: zIsoDate,
});
export type OrderReturnLineItem = z.infer<typeof OrderReturnLineItemSchema>;
```

기존 Coupang 전용 schema (있다면 `CoupangOrderSchema` 등) 제거.

## 8. ADR-0015 (신규)

`.claude/docs/decisions/0015-order-schema-unification.md`:

- **Decision**: Order/Return 도메인은 channel-agnostic. 채널 metadata 는 `metadata Json` 컬럼 + 자주 쓰는 필드 (status/dates/totals/shipping/receiver) 만 first-class field 로 promote.
- **Rationale**: Multi-channel (Coupang/Naver/11st) 확장 시 N+1 테이블 생성 방지. Picking/Statistics/Settlements 가 channel-specific 코드 없이 OrderLineItem 으로 SKU 처리.
- **Consequences**: 기존 raw Coupang 필드 (orderer JSON / receiver JSON / parcelPrintMessage / vendorItemId 등) 는 metadata Json 으로 이동. 자주 쓰는 receiver name/phone/addr 만 promote.
- **Enforcement**: PR 리뷰 시 신규 channel 전용 모델 생성 거부 (ChannelListing/ChannelListingOption 외).

## 9. Testing strategy

3-tier:

### 9.1 Unit (vitest mock)

- `channel-sync.service.spec.ts` — Coupang sync rewrite 검증:
  - 신규 Order 생성 (외부 orderId 미존재)
  - 기존 Order 갱신 (upsert)
  - vendorItemId 매칭 OrderLineItem 생성 + optionId denormalize
  - 매칭 안 되는 vendorItem (listingOption 없음) → optionId null
  - returns sync (CoupangReturn → OrderReturn + lineItems)

### 9.2 Integration (real Postgres)

- `order-sync.pg.integration.spec.ts` (신규):
  - 동일 shipmentBoxId 에 대한 두 번째 sync 가 update (no duplicate)
  - 다중 vendorItem payload → 각 OrderLineItem upsert
  - listingOption 미매칭 시 graceful fallback
  - 반품 sync — items JSON 파싱 → 다중 OrderReturnLineItem

### 9.3 검증 명령

```bash
npm run db:push                                            # schema 적용
npm run db:3layer-setup                                    # RLS/CHECK 재적용
npx prisma generate
npm run build -w packages/shared
npx vitest run apps/server/src/channels                   # unit
npm run test:integration -- order-sync                    # integration
cd apps/server && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l   # B2c 의 baseline
```

A.5 머지 후 tsc error 수가 일시적으로 증가할 수 있음 (compile-broken 추가) — 이는 B2c 에서 -X 진행되는 baseline.

## 10. Risks

| Risk | Mitigation |
|---|---|
| `coupangOrderId` 가 `Order.externalNumber` 로 이동했지만 기존 grep 검색 망실 | A.5 PR description 에 "old: Order.coupangOrderId, new: Order.externalNumber" 명시. B2c 에서 callsite 검색 |
| `vendorItemId` 매칭 실패 시 optionId null — picking 등에서 NPE | OrderLineItem.optionId 는 nullable. 모든 caller 가 null 처리 (B2c 가이드라인) |
| Order.totalPrice (denormalized) 가 sum(lineItems.totalPrice) 와 drift | sync 시 `totalPrice = sum(lineItems[i].orderPrice)` 로 계산. Application invariant. 향후 trigger / generated column 고려 |
| Out-of-scope service (statistics 등) 의 stale 코드가 schema 변경 후 새 에러 추가 | 의도된 것. B2c 가 정리. A.5 머지 시 dev:server 부팅 안 됨 명시 |
| `init.sql.gz` 갱신 누락 → 신규 dev 환경에서 Order 시드 없음 | A.5 머지 후 `pg_dump` 로 시드 새로 생성 (별도 task) |
| shipment.orderId FK 가 cascade 안 함 (SetNull) — order 삭제 시 shipment 고아 | 현재 동작 유지. 기존 패턴 답습 |
| `OrderReturn.externalReturnId` 충돌 (Coupang receiptId 가 회사 간 충돌 가능?) | unique 는 `(companyId, platform, externalReturnId)` 복합 키 — 회사 격리 |

## 11. Migration / Rollout

### 11.1 데이터

**없음**. drop tables + reseed via `npm run db:push`.

### 11.2 Rollout 시퀀스

1. `feat/plan-a5-order-schema` 브랜치 (이미 생성)
2. Schema 작성 + `npm run db:push` 로 로컬 검증
3. `prisma generate` + shared 빌드
4. Channel-sync rewrite + unit/integration tests
5. Out-of-scope service stub-out (compile only)
6. ADR + CLAUDE.md 갱신
7. Adversarial reviews (spec 3 + plan 2)
8. Implementation via team
9. PR + squash merge
10. 후속: Plan B2b (advertising) / B2c (orders+catch-all)

## 12. Open Questions

- `init.sql.gz` 갱신을 A.5 PR 에 포함할지, 별도 PR 로 할지 (B2c 후 final 갱신이 더 자연스러움 — 제안: 별도)
- `Order.platform` enum 화 여부 — 현재 String, 향후 'coupang' | 'naver' | ... 등 좁히기
- `OrderLineItem.status` 와 `Order.status` 관계 (line 부분 발송 vs aggregate status) — Plan B2c 의 service 재작성 시 결정

---

**End of spec.**
