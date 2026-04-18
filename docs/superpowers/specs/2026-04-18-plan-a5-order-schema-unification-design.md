# Plan A.5 — Order Schema Unification (Design Spec v2)

> **Status**: Draft v2 — 3-reviewer adversarial review 반영 (critic + architect + code-reviewer)
> **Session**: 2026-04-18
> **Predecessors**: [Plan A spec](2026-04-17-product-schema-redesign-design.md), [Plan B1 spec](2026-04-17-plan-b1-products-module-design.md), [Plan B2a spec](2026-04-18-plan-b2a-inventory-service-layer-design.md), [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md), [ADR-0014](../../../.claude/docs/decisions/0014-stock-mutation-single-writer.md)
> **Branch**: `feat/plan-a5-order-schema` (from `origin/main`)

---

## 1. Goal

Order 도메인의 channel-leak 을 제거하고 generic `Order` (aggregate root) + `OrderLineItem` (per-SKU) + `OrderReturn` + `OrderReturnLineItem` 4 모델로 통합한다. 채널별 metadata 는 `metadata Json` 컬럼 + 자주 쓰는 first-class 필드 promotion. `CoupangOrder`/`CoupangOrderItem`/`CoupangReturn` 폐기. `Order.productName/quantity/unitPrice` 평탄화 제거. Picking/Statistics/Settlements 등이 `OrderLineItem` 으로 SKU 해상도 가능.

본 plan 은 schema 변경 + Coupang `channel-sync.service.ts` write path + 기존에 이미 broken 인 read-side service 의 compile-broken 정리만 다룬다. 본격 service rewrite 는 **Plan B2c**.

## 2. Scope Decomposition

| Plan | Scope |
|---|---|
| **Plan A.5 (이 spec)** | Order/CoupangOrder/Item/Return schema 통합 + Coupang sync rewrite + downstream service stub-out (compile-broken 만 fix, 기능은 throw) + returns.service IDOR fix |
| Plan B2b | Advertising service rewrite |
| Plan B2c | Orders + returns + statistics + supplier-stats + settlements + picking + dashboard-sales + sales-plans + profit-calculator + channel-dashboard 등 전체 read-side rewrite. `dev:server` 부팅 목표 |
| Plan B2.picking | Picking generate 로직 OrderLineItem 기반 본격 재작성 (B2c 후) |

**중요**: A.5 머지 후에도 `dev:server` 는 부팅 안 됨. Read-side 본격 재작성은 B2c 가 담당. A.5 의 stub 은 method body 가 throw 하는 형태 (compile pass 만 보장).

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope files

#### 3.1.1 Schema (Prisma)

| Path | 작업 |
|---|---|
| `prisma/models/orders.prisma` | **재작성**. `Order` 단일화 + `OrderLineItem` / `OrderReturn` / `OrderReturnLineItem` 신설. `CoupangOrder`/`CoupangOrderItem`/`CoupangReturn` 삭제 |
| `prisma/models/core.prisma` | (1) `Company` 모델: `coupangOrders` / `coupangReturns` back-relation 제거 + `orderLineItems` / `orderReturns` / `orderReturnLineItems` 추가. (2) `ProductOption` 모델: `orderLineItems` / `orderReturnLineItems` back-relation 추가. (3) `ChannelListingOption` 모델: `coupangOrderItems` 제거 + `orderLineItems` 추가. (4) `ChannelListing.orders` back-relation 변경 없음 (이미 존재) |

#### 3.1.2 Sync write path

| Path | 작업 |
|---|---|
| `apps/server/src/channels/services/channel-sync.service.ts` | Coupang sync rewrite. `coupangOrder`/`coupangOrderItem`/`coupangReturn` upsert → `order`/`orderLineItem`/`orderReturn`/`orderReturnLineItem` upsert. 모든 mutation 이 단일 `prisma.$transaction(async (tx) => { ... })` 안. `vendorItemId` lookup 으로 `listingOption` 매칭 + `optionId` denormalize |
| `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts` | sync rewrite 검증 (mock Coupang payload → Order/OrderLineItem 생성/upsert/listingOption 미매칭 시나리오) |
| `apps/server/src/channels/services/types.ts` | Coupang adapter 응답 타입 (`OrderItemPayload` 등) 정리 — productId/productName 잔여 제거 |

#### 3.1.3 Stub-out (이미 broken 또는 신규 broken — method body throw 패턴)

각 service 의 `coupangOrder`/`coupangOrderItem`/`coupangReturn` 호출 또는 raw SQL `coupang_order*` / `coupang_returns` 참조를 `throw new Error('Not implemented: Plan B2c migration')` 또는 빈 결과 반환으로 교체. Plan B1/B2a 의 "fully fix or fully defer" 원칙에 따라 `@ts-expect-error` 회피 — method body 자체를 정리.

| Path | 작업 |
|---|---|
| `apps/server/src/orders/services/returns.service.ts` | `prisma.coupangReturn` → `prisma.orderReturn` rename + **IDOR fix** (`findAll` 에 `companyId` 필터 추가, `findOne` 을 `findFirst({id, companyId})` 로). `receiptType` 필터는 신규 `OrderReturn.type` 으로 (4.3 참조) |
| `apps/server/src/orders/services/orders.service.ts` | `Order.productId/productName/quantity/unitPrice/coupangOrderId` 의존 제거. `findMany` 에 `include: { lineItems: true }` 추가하되 응답 shape 은 임시로 raw 객체 반환 (Zod parse 는 B2c 가 정리) |
| `apps/server/src/picking/picking.service.ts` | **이미 broken (Plan A 잔여)**. `order.productId`/`order.product`/`order.productName`/`order.quantity` 제거. `findMany({ include: { lineItems: { include: { option: true } } } })` 로 lineItem 단위 PickingItem 생성. `optionId: lineItem.optionId` (PickingItem 모델은 이미 optionId column 보유). 기능은 정상 작동 가능 (B2.picking 은 generate 정책/algorithm 재설계). |
| `apps/server/src/dashboard/services/dashboard-sales.service.ts` | `prisma.coupangOrder.aggregate` 호출 + raw SQL `FROM coupang_order_items coi JOIN coupang_orders co` 제거. method body throw |
| `apps/server/src/dashboard/services/dashboard-inventory.service.ts` | (이미 stale, 변경 없음) |
| `apps/server/src/channels/services/channel-dashboard.service.ts` | 7 raw SQL `coupang_orders`/`coupang_returns`/`coupang_order_items` 호출 method body throw |
| `apps/server/src/finance/services/profit-loss.service.ts` | raw SQL `FROM coupang_order_items coi JOIN coupang_orders co` 제거. method body throw |
| `apps/server/src/statistics/statistics.service.ts` | (이미 broken — `order.productId` 등) raw SQL coupang refs 있으면 throw |
| `apps/server/src/supplier-stats/supplier-stats.service.ts` | (이미 broken) Order/CoupangOrder coupang refs 만 throw 처리 |
| `apps/server/src/settlements/settlements.service.ts` | (이미 broken) coupang refs 만 throw 처리 |
| `apps/server/src/sales-plans/sales-plans.service.ts` | coupang refs 만 throw 처리 |
| `apps/server/src/dashboard/helpers/profit-calculator.ts` | coupang refs 만 throw 처리 |

**원칙**: A.5 가 추가하는 새 broken 만 정리 (compile pass 보장). 이미 stale (Plan A 후) 부분은 추가 정리 불요 — 단 schema drop 으로 raw SQL table 자체가 사라지면 method body throw.

#### 3.1.4 Shared types

| Path | 작업 |
|---|---|
| `packages/shared/src/schemas/order.ts` | **재작성**. `OrderRowSchema` / `OrdersResponseSchema` 등 기존 schema 제거 + 신규 `OrderSchema` / `OrderLineItemSchema` / `OrderReturnSchema` / `OrderReturnLineItemSchema` / `OrderPlatformSchema` (z.enum) / `OrderReturnTypeSchema` (z.enum) 정의 |
| `packages/shared/src/schemas/index.ts` | **Plan B1 P0 lesson**: 신규 schema export 추가 + 기존 OrderRow/OrdersResponse export 제거 |
| `packages/shared/src/index.ts` | **동일**: 신규 type re-export 추가 + 기존 OrderRow/OrdersResponse re-export 제거 |

#### 3.1.5 ADR + CLAUDE.md

| Path | 작업 |
|---|---|
| `.claude/docs/decisions/0015-order-schema-unification.md` | 신규 ADR. (1) channel-agnostic 결정, (2) metadata field promotion 규칙, (3) `Order.status` vs `OrderLineItem.status` 의미 분리 |
| `apps/server/src/orders/CLAUDE.md` | A.5 schema 적용 banner + 신규 모델 가이드 + IDOR 규약 |
| `apps/server/src/channels/CLAUDE.md` | sync 부분 갱신 (Order/OrderLineItem upsert 패턴) |
| `prisma/CLAUDE.md` | orders.prisma 모델 라인업 갱신 + Order schema notes |
| `apps/server/CLAUDE.md` | (변경 없음 — orders/CLAUDE.md 는 이미 Domain Guides 표에 존재) |

### 3.2 Out-of-scope

- 본격 read-side service rewrite (B2c)
- Picking generate 알고리즘 재설계 (B2.picking)
- Advertising rewrite (B2b)
- Frontend (Plan D)
- `init.sql.gz` 갱신 (B2c 후 별도)

### 3.3 데이터 마이그레이션

**없음**. `npm run db:push` (필요 시 `--accept-data-loss`) 로 schema 재적용. `CoupangOrder*` / `CoupangReturn` 테이블 drop. 기존 데이터 무시 (사용자 명시).

## 4. Schema Design

### 4.1 Order (aggregate root)

```prisma
/// @namespace Orders
/// @describe 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem.
model Order {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid

  // External identification (per-platform)
  // Coupang: externalOrderId = shipmentBoxId (shipment-level unique). externalNumber = orderId (display).
  // 1 Coupang orderId can have multiple shipmentBoxId (multiple boxes per order) → 1 Order per shipmentBoxId.
  platform        String    @db.VarChar(20)                          // 'coupang' / 'naver' / '11st' / 'manual'
  externalOrderId String    @map("external_order_id") @db.VarChar(60)
  externalNumber  String?   @map("external_number") @db.VarChar(60)

  // Customer + receiver (denormalized, 분석용)
  customerName    String    @default("") @map("customer_name")
  receiverName    String?   @map("receiver_name")
  receiverPhone   String?   @map("receiver_phone")
  receiverAddr    String?   @map("receiver_addr")
  memo            String?

  // Status (aggregate-level — 별도 OrderLineItem.status 가 라인별 fulfillment 추적)
  status          String    @default("pending")
  orderedAt       DateTime  @default(now()) @map("ordered_at") @db.Timestamptz
  paidAt          DateTime? @map("paid_at") @db.Timestamptz
  shippedAt       DateTime? @map("shipped_at") @db.Timestamptz
  deliveredAt     DateTime? @map("delivered_at") @db.Timestamptz

  // Shipping
  trackingNumber  String?   @map("tracking_number")
  shippingCompany String?   @map("shipping_company")
  shippingPrice   Int       @default(0) @map("shipping_price")

  // Totals — invariant: totalPrice = sum(lineItems.totalPrice), excludes shippingPrice
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

  @@unique([companyId, platform, externalOrderId])
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

  // SKU resolution chain
  listingOptionId String?  @map("listing_option_id") @db.Uuid
  optionId        String?  @map("option_id") @db.Uuid                       // denormalized for query perf

  // Denormalized (option soft-delete 후에도 분석 가능)
  productName     String   @default("") @map("product_name")
  optionName      String?  @map("option_name")
  sku             String?

  // Quantities + prices (per-line) — Coupang null 대응 위해 default 0
  quantity        Int      @default(1)
  unitPrice       Int      @default(0) @map("unit_price")
  totalPrice      Int      @default(0) @map("total_price")

  // Per-line status (multi-item 부분 발송/취소)
  status          String   @default("pending")

  // External per-line identifier (Coupang vendorItemId 등)
  externalLineId  String?  @map("external_line_id") @db.VarChar(60)

  // Channel-specific raw payload
  metadata        Json?

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  order           Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  listingOption   ChannelListingOption? @relation(fields: [listingOptionId], references: [id], onDelete: SetNull)
  option          ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)

  @@unique([orderId, externalLineId])
  @@index([companyId])
  @@index([orderId])
  @@index([listingOptionId])
  @@index([optionId])
  @@map("order_line_items")
}
```

**Note on `vendorItemId` 중복 가능성**: Coupang API 가 단일 shipmentBoxId 안에서 동일 vendorItemId 를 두 번 반환하는 경우 (예: 동일 SKU 가 두 번 주문) 는 **현재 채널 동작 상 발생하지 않음** — 동일 vendorItemId 는 quantity 로 합쳐짐. 만약 발생한다면 `@@unique([orderId, externalLineId])` 위반 → sync transaction 실패 → 명시적 에러로 노출. 추후 발견 시 `externalLineId = "${vendorItemId}_${idx}"` 로 변경.

### 4.3 OrderReturn / OrderReturnLineItem

```prisma
/// @namespace Orders
/// @describe 채널-agnostic 반품 aggregate. CoupangReturn 의 items JSON → OrderReturnLineItem 정규화. type=RETURN/EXCHANGE 구분 first-class.
model OrderReturn {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid
  orderId         String?   @map("order_id") @db.Uuid                     // 매칭 안 되는 단독 반품 가능

  platform        String    @db.VarChar(20)
  externalReturnId String   @map("external_return_id") @db.VarChar(60)

  // RETURN / EXCHANGE — 기존 CoupangReturn.receiptType 흡수 (returns.service 가 필터)
  type            String    @default("RETURN") @db.VarChar(20)

  status          String    @default("pending")
  reason          String    @default("")
  reasonCategory1 String?   @map("reason_category1")
  reasonCategory2 String?   @map("reason_category2")
  faultBy         String    @default("CUSTOMER") @map("fault_by") @db.VarChar(20)

  // Coupang 보존 필드 (자주 쓰임)
  requesterName   String    @default("") @map("requester_name")
  enclosePrice    Int?      @map("enclose_price")

  requestedAt     DateTime  @map("requested_at") @db.Timestamptz
  completedAt     DateTime? @map("completed_at") @db.Timestamptz

  // Channel-specific raw payload (reasonCode/reasonCodeText/returnDeliveryId 등)
  metadata        Json?

  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  order           Order?              @relation(fields: [orderId], references: [id], onDelete: SetNull)
  lineItems       OrderReturnLineItem[]

  @@unique([companyId, platform, externalReturnId])
  @@index([companyId])
  @@index([status])
  @@index([type])
  @@index([requestedAt])
  @@map("order_returns")
}

/// @namespace Orders
/// @describe 반품 라인 아이템 — 반품 건 내 SKU 단위 상세. companyId 는 IDOR 방어용 denormalize (B2a 패턴).
model OrderReturnLineItem {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid                   // IDOR (B2a 패턴 일관)
  returnId        String    @map("return_id") @db.Uuid
  orderLineItemId String?   @map("order_line_item_id") @db.Uuid           // 매칭되면 연결, 아니면 null
  optionId        String?   @map("option_id") @db.Uuid

  productName     String    @default("") @map("product_name")
  quantity        Int

  metadata        Json?

  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  company         Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  return          OrderReturn    @relation(fields: [returnId], references: [id], onDelete: Cascade)
  orderLineItem   OrderLineItem? @relation(fields: [orderLineItemId], references: [id], onDelete: SetNull)
  option          ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)

  @@index([companyId])
  @@index([returnId])
  @@index([optionId])
  @@map("order_return_line_items")
}
```

### 4.4 폐기 (orders.prisma 에서 삭제)

```prisma
// DROP:
//   model CoupangOrder
//   model CoupangOrderItem
//   model CoupangReturn
```

### 4.5 core.prisma 변경 (back-relations)

```prisma
model Company {
  // ... 기존 필드 유지 ...

  // 제거:
  //   coupangOrders   CoupangOrder[]
  //   coupangReturns  CoupangReturn[]

  // 추가:
  orderLineItems        OrderLineItem[]
  orderReturns          OrderReturn[]
  orderReturnLineItems  OrderReturnLineItem[]
}

model ProductOption {
  // ... 기존 필드 유지 ...

  // 추가:
  orderLineItems        OrderLineItem[]
  orderReturnLineItems  OrderReturnLineItem[]
}

model ChannelListingOption {
  // ... 기존 필드 유지 ...

  // 제거:
  //   coupangOrderItems CoupangOrderItem[]

  // 추가:
  orderLineItems    OrderLineItem[]
}
```

`ChannelListing.orders Order[]` 는 변경 없음 (이미 존재).

## 5. Channel-Sync Rewrite (Coupang)

### 5.1 단일 transaction 안에서 Order + OrderLineItem upsert

```ts
// channel-sync.service.ts — syncSingleOrder (재작성)
async syncSingleOrder(payload: CoupangOrderSheet, companyId: string) {
  const shipmentBoxId = payload.shipmentBoxId;
  const totalPrice = payload.orderItems.reduce(
    (sum, it) => sum + (it.orderPrice ?? 0),
    0,
  );

  return this.prisma.$transaction(async (tx) => {
    // 1) Order upsert (compound unique key)
    const order = await tx.order.upsert({
      where: {
        companyId_platform_externalOrderId: {
          companyId,
          platform: 'coupang',
          externalOrderId: shipmentBoxId,
        },
      },
      update: {
        status: payload.status,
        shippedAt: payload.shippedAt ? new Date(payload.shippedAt) : undefined,
        trackingNumber: payload.invoiceNumber ?? null,
        shippingCompany: payload.deliveryCompanyName ?? null,
        shippingPrice: payload.shippingPrice ?? 0,
        totalPrice,
        receiverName: payload.receiver?.name ?? null,
        receiverPhone: payload.receiver?.safeNumber ?? null,
        receiverAddr: [payload.receiver?.addr1, payload.receiver?.addr2].filter(Boolean).join(' '),
        memo: payload.parcelPrintMessage ?? null,
        metadata: {
          orderer: payload.orderer ?? null,
          receiver: payload.receiver ?? null,
          parcelPrintMessage: payload.parcelPrintMessage ?? null,
        } as Prisma.InputJsonValue,
      },
      create: {
        companyId,
        platform: 'coupang',
        externalOrderId: shipmentBoxId,
        externalNumber: payload.orderId ?? null,
        status: payload.status ?? 'ACCEPT',
        customerName: payload.orderer?.name ?? '',
        receiverName: payload.receiver?.name ?? null,
        receiverPhone: payload.receiver?.safeNumber ?? null,
        receiverAddr: [payload.receiver?.addr1, payload.receiver?.addr2].filter(Boolean).join(' '),
        memo: payload.parcelPrintMessage ?? null,
        orderedAt: new Date(payload.orderedAt),
        paidAt: payload.paidAt ? new Date(payload.paidAt) : null,
        shippedAt: payload.shippedAt ? new Date(payload.shippedAt) : null,
        shippingPrice: payload.shippingPrice ?? 0,
        totalPrice,
        trackingNumber: payload.invoiceNumber ?? null,
        shippingCompany: payload.deliveryCompanyName ?? null,
        metadata: {
          orderer: payload.orderer ?? null,
          receiver: payload.receiver ?? null,
          parcelPrintMessage: payload.parcelPrintMessage ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    // 2) OrderLineItem upsert per item — vendorItemId 로 listingOption 매칭
    for (const item of payload.orderItems) {
      const listingOption = item.vendorItemId
        ? await tx.channelListingOption.findUnique({
            where: {
              companyId_vendorItemId: {
                companyId,
                vendorItemId: item.vendorItemId,
              },
            },
            select: {
              id: true,
              optionId: true,
              option: { select: { sku: true, optionName: true } },
            },
          })
        : null;

      await tx.orderLineItem.upsert({
        where: {
          orderId_externalLineId: {
            orderId: order.id,
            externalLineId: item.vendorItemId,
          },
        },
        update: {
          quantity: item.shippingCount ?? 1,
          unitPrice: item.salesPrice ?? 0,
          totalPrice: item.orderPrice ?? 0,
          listingOptionId: listingOption?.id ?? null,
          optionId: listingOption?.optionId ?? null,
          productName: item.sellerProductName ?? '',
          optionName: item.vendorItemName ?? listingOption?.option?.optionName ?? null,
          sku: listingOption?.option?.sku ?? null,
          metadata: {
            sellerProductId: item.sellerProductId ?? null,
            instantCouponDiscount: item.instantCouponDiscount ?? 0,
          } as Prisma.InputJsonValue,
        },
        create: {
          companyId,
          orderId: order.id,
          listingOptionId: listingOption?.id ?? null,
          optionId: listingOption?.optionId ?? null,
          productName: item.sellerProductName ?? '',
          optionName: item.vendorItemName ?? listingOption?.option?.optionName ?? null,
          sku: listingOption?.option?.sku ?? null,
          quantity: item.shippingCount ?? 1,
          unitPrice: item.salesPrice ?? 0,
          totalPrice: item.orderPrice ?? 0,
          externalLineId: item.vendorItemId,
          metadata: {
            sellerProductId: item.sellerProductId ?? null,
            instantCouponDiscount: item.instantCouponDiscount ?? 0,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return order;
  }, { timeout: 15_000 });
}
```

### 5.2 Returns sync

```ts
async syncSingleReturn(payload: CoupangReturnSheet, companyId: string) {
  const receiptId = payload.receiptId;

  // Coupang.orderId (display string) → 내부 Order 조회 (best-effort)
  const matchedOrder = payload.orderId
    ? await this.prisma.order.findFirst({
        where: {
          companyId,
          platform: 'coupang',
          externalNumber: payload.orderId,    // Coupang display orderId
        },
        select: { id: true },
      })
    : null;

  return this.prisma.$transaction(async (tx) => {
    const ret = await tx.orderReturn.upsert({
      where: {
        companyId_platform_externalReturnId: {
          companyId,
          platform: 'coupang',
          externalReturnId: receiptId,
        },
      },
      update: {
        type: payload.receiptType ?? 'RETURN',
        status: payload.receiptStatus ?? 'pending',
        reason: payload.cancelReason ?? '',
        reasonCategory1: payload.cancelReasonCategory1 ?? null,
        reasonCategory2: payload.cancelReasonCategory2 ?? null,
        faultBy: payload.faultByType ?? 'CUSTOMER',
        requesterName: payload.requesterName ?? '',
        enclosePrice: payload.enclosePrice ?? null,
        completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
        orderId: matchedOrder?.id ?? null,
        metadata: {
          reasonCode: payload.reasonCode ?? null,
          reasonCodeText: payload.reasonCodeText ?? null,
          returnDeliveryId: payload.returnDeliveryId ?? null,
        } as Prisma.InputJsonValue,
      },
      create: {
        companyId,
        platform: 'coupang',
        externalReturnId: receiptId,
        type: payload.receiptType ?? 'RETURN',
        status: payload.receiptStatus ?? 'pending',
        reason: payload.cancelReason ?? '',
        reasonCategory1: payload.cancelReasonCategory1 ?? null,
        reasonCategory2: payload.cancelReasonCategory2 ?? null,
        faultBy: payload.faultByType ?? 'CUSTOMER',
        requesterName: payload.requesterName ?? '',
        enclosePrice: payload.enclosePrice ?? null,
        requestedAt: new Date(payload.requestedAt),
        completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
        orderId: matchedOrder?.id ?? null,
        metadata: {
          reasonCode: payload.reasonCode ?? null,
          reasonCodeText: payload.reasonCodeText ?? null,
          returnDeliveryId: payload.returnDeliveryId ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    // items JSON → OrderReturnLineItem 다중 row (delete-and-recreate 패턴)
    await tx.orderReturnLineItem.deleteMany({ where: { returnId: ret.id } });
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const it of items) {
      await tx.orderReturnLineItem.create({
        data: {
          companyId,
          returnId: ret.id,
          productName: it.productName ?? it.vendorItemName ?? '',
          quantity: it.quantity ?? 1,
          metadata: { raw: it } as Prisma.InputJsonValue,
        },
      });
    }

    return ret;
  }, { timeout: 15_000 });
}
```

## 6. Stub-out 패턴 (compile pass 보장)

`@ts-expect-error` 사용 안 함 (codebase precedent 없음, B2a "fully fix or fully defer" 원칙 위반). 대신 method body 자체를 정리:

```ts
// 예: dashboard-sales.service.ts
async getSalesAggregate(companyId: string, days: number) {
  // Plan B2c: rewrite using Order/OrderLineItem schema
  throw new Error('Not implemented: Plan B2c migration');
}

// 예: profit-loss.service.ts (raw SQL 호출 메서드)
async getProfitLossByMaster(companyId: string, params: PLParams) {
  throw new Error('Not implemented: Plan B2c migration');
}
```

이 패턴으로 caller 가 메서드를 호출하는 순간 명확한 에러 발생 → B2c 가 정리할 surface 가 grep 으로 명확.

## 7. Shared types

`packages/shared/src/schemas/order.ts` 재작성:

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

// Platform enum (Zod-level — DB 는 String per ADR-0001)
export const OrderPlatformSchema = z.enum(['coupang', 'naver', '11st', 'manual']);
export type OrderPlatform = z.infer<typeof OrderPlatformSchema>;

export const OrderReturnTypeSchema = z.enum(['RETURN', 'EXCHANGE']);
export type OrderReturnType = z.infer<typeof OrderReturnTypeSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  platform: z.string().max(20),                          // Zod runtime narrows to OrderPlatformSchema at parse boundary
  externalOrderId: z.string().max(60),
  externalNumber: z.string().max(60).nullable(),
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
  metadata: z.unknown().nullable(),                      // Json — 객체/배열/원시 모두 허용
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
  externalLineId: z.string().max(60).nullable(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

export const OrderReturnSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  platform: z.string().max(20),
  externalReturnId: z.string().max(60),
  type: OrderReturnTypeSchema,
  status: z.string(),
  reason: z.string(),
  reasonCategory1: z.string().nullable(),
  reasonCategory2: z.string().nullable(),
  faultBy: z.string().max(20),
  requesterName: z.string(),
  enclosePrice: z.number().int().nullable(),
  requestedAt: zIsoDate,
  completedAt: zIsoDate.nullable(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type OrderReturn = z.infer<typeof OrderReturnSchema>;

export const OrderReturnLineItemSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  returnId: z.string().uuid(),
  orderLineItemId: z.string().uuid().nullable(),
  optionId: z.string().uuid().nullable(),
  productName: z.string(),
  quantity: z.number().int(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
});
export type OrderReturnLineItem = z.infer<typeof OrderReturnLineItemSchema>;
```

**기존 제거**: `OrderRowSchema`, `OrdersResponseSchema` (있다면) — `packages/shared/src/schemas/index.ts` + `packages/shared/src/index.ts` 양쪽 barrel 동기화 (Plan B1 P0 lesson).

## 8. ADR-0015

`.claude/docs/decisions/0015-order-schema-unification.md`:

**Decision**:
1. Order/Return 도메인은 channel-agnostic. 채널 metadata 는 `metadata Json` + 자주 쓰는 필드만 first-class field 로 promote.
2. `Order.status` 는 aggregate-level (사용자/관리 UI 에 노출), `OrderLineItem.status` 는 라인-level (부분 발송/취소 추적). 둘은 **독립적으로 유지** — derive 안 함. Aggregate `Order.status` 변경은 service 가 라인 status 변경 후 명시적으로 갱신 (B2c 가 규칙 정의).
3. **Promotion rule**: 필드가 production query (WHERE/JOIN/GROUP BY) 에서 1개 이상 도메인 service 가 사용하면 first-class column 으로 graduate. 단순 display 만 사용은 metadata Json 유지.

**Rationale**:
- Multi-channel 확장 (Naver/11st) 시 N+1 테이블 생성 방지
- Picking/Statistics/Settlements 가 channel-specific 코드 없이 OrderLineItem 으로 SKU 처리
- Status 분리 → 부분 발송 시나리오 (`OrderLineItem.status='shipped'` 일부 + `Order.status='partial_shipped'`) 표현 가능

**Consequences**:
- 기존 raw Coupang 필드 (`orderer/receiver` JSON, `parcelPrintMessage`, `vendorItemId`, `reasonCode/Text`, `returnDeliveryId`) 는 metadata Json 으로 이동
- `receiver.name/phone/addr` 는 자주 쓰여 promote (`receiverName/Phone/Addr`)
- `receiptType` (RETURN/EXCHANGE) 는 `OrderReturn.type` 으로 promote (returns.service 가 필터)

**Enforcement**:
- 신규 channel-specific table 생성 거부 (PR 리뷰)
- Promotion 결정은 ADR amendment 또는 별도 plan 으로 기록

## 9. Testing strategy

### 9.1 Unit (vitest mock)

`apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts`:
- 신규 Order 생성 (외부 ID 미존재)
- 기존 Order 갱신 (upsert, transaction 내)
- vendorItemId 매칭 → optionId denormalize
- 매칭 안 되는 vendorItemId → optionId null
- payload.orderItems 빈 배열 (Order 만 생성, lineItem 없음)
- Returns sync — items JSON → OrderReturnLineItem 다중 row + delete-and-recreate

### 9.2 Integration (real Postgres)

`apps/server/src/channels/__tests__/order-sync.pg.integration.spec.ts`:
- 동일 shipmentBoxId 두 번째 sync = update (no duplicate, transaction 안)
- 다중 vendorItem payload → 각 OrderLineItem upsert + companyId denormalize 검증
- listingOption 미매칭 → graceful (optionId null)
- 반품 sync — items JSON 다중 OrderReturnLineItem
- transaction rollback — 중간에 throw 시 Order/lineItems 모두 미생성

### 9.3 검증 명령

```bash
npm run db:push --accept-data-loss               # schema 적용 (Coupang* 테이블 drop)
npm run db:3layer-setup                          # B2a RLS/CHECK 재적용
npx prisma generate
npm run build -w packages/shared

cd apps/server
npx vitest run src/channels/services/__tests__/channel-sync.service.spec.ts
cd ../../
npm run db:test:up && npm run db:test:prepare
npm run test:integration -- order-sync

cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"
# baseline 측정 — A.5 후 stub 으로 compile pass. 정확한 수치는 머지 시 기록.
```

## 10. Risks

| Risk | Mitigation |
|---|---|
| `prisma generate` 실패 (back-relation 누락) | Section 4.5 가 Company/ProductOption/ChannelListingOption 모두 명시. db push 전 generate 로 검증 |
| Sync transaction 부분 실패 시 Order/lineItems 비일관 | `prisma.$transaction(async (tx) => {...})` interactive — auto rollback. Integration test 로 검증 |
| `vendorItemId` 동일 line 중복 → unique 충돌 | 현재 Coupang 미발생 가정 명시. 발생 시 `_${idx}` 패턴으로 복합 (별도 PR) |
| `Order.totalPrice` denormalization drift | Sync 가 `sum(item.orderPrice)` 로 항상 재계산. Application invariant. |
| `OrderReturn.orderId` resolution 실패 (Coupang orderId 가 없거나 미매칭) | nullable + best-effort lookup. 매칭 실패 = null (단독 반품으로 취급) |
| Stub method 호출이 production trigger | 모든 stub 이 `throw new Error('Not implemented: Plan B2c migration')` 명시 → 호출 즉시 명확한 에러 |
| `returns.service` IDOR fix 가 호출처 깨짐 | Service 시그니처 변경 안 함 (`companyId` 는 controller 가 이미 `@CurrentCompany` 주입). 내부 query 만 추가 |
| `init.sql.gz` 미갱신 → 신규 dev 환경 Order 데이터 없음 | A.5 머지 시점 명시. 별도 PR 로 갱신 (B2c 후) |
| `shipmentBoxId` global unique → company-scoped 변경 | 의도된 변경. multi-tenant 격리 강화 |
| `dev:server` 부팅 안 됨 | A.5 의도된 trade-off. B2c 가 부팅 목표. PR description 명시 |

## 11. Migration / Rollout

1. `feat/plan-a5-order-schema` 브랜치 (이미 생성)
2. `prisma/models/orders.prisma` + `core.prisma` 수정 → `npm run db:push --accept-data-loss`
3. `npm run db:3layer-setup` (B2a RLS 재적용)
4. `npx prisma generate`
5. `packages/shared/src/schemas/order.ts` + barrel files 갱신 → `npm run build -w packages/shared`
6. `channel-sync.service.ts` rewrite + unit tests
7. Stub-out 모든 broken services (compile pass)
8. ADR-0015 + CLAUDE.md 갱신
9. Integration tests
10. PR 생성 + adversarial review (2 plan reviews) + squash merge

## 12. Resolved Open Questions (v1 → v2)

- **`Order.platform` enum 화**: Zod-level `OrderPlatformSchema = z.enum([...])`, DB 는 String per ADR-0001. **Resolved**.
- **`Order.status` vs `OrderLineItem.status`**: 독립 유지 (ADR-0015 #2). **Resolved**.
- **`init.sql.gz` 갱신 시점**: B2c 후 별도 PR. **Resolved**.

---

**End of spec v2.**
