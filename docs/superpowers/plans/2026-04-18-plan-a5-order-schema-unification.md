# Plan A.5 — Order Schema Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A 의 3-layer schema 위에 Order 도메인을 channel-agnostic 으로 통합. `Order` (aggregate) + `OrderLineItem` (per-SKU) + `OrderReturn` + `OrderReturnLineItem` 4 모델 신설, `CoupangOrder`/`CoupangOrderItem`/`CoupangReturn` 폐기. Coupang `channel-sync.service.ts` 를 신 schema 로 재작성하고 downstream broken services 는 stub-out (Plan B2c 가 본격 rewrite).

**Architecture:** 단일 `Order` aggregate root + per-SKU `OrderLineItem` (listingOption → option 으로 SKU 해상도) + per-line `metadata Json` (채널별 raw payload). `Order.totalPrice = sum(lineItems.totalPrice)` (shipping 제외) invariant. Sync 는 `prisma.$transaction(async (tx) => { ... })` interactive transaction 으로 Order + N OrderLineItems 원자 처리. ADR-0015 가 channel-agnostic 결정 + status 의미 분리 + metadata promotion 규칙 명시.

**Tech Stack:** Prisma v7 (multi-file schema) + NestJS 11 + Zod (`@kiditem/shared`) + class-validator + vitest + real-Postgres integration tests.

**Spec:** `docs/superpowers/specs/2026-04-18-plan-a5-order-schema-unification-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Rewrite | `prisma/models/orders.prisma` | Order/OrderLineItem/OrderReturn/OrderReturnLineItem 신설, CoupangOrder*/CoupangReturn 삭제 |
| Modify | `prisma/models/core.prisma` | Company/ProductOption/ChannelListingOption back-relations 갱신 |
| Rewrite | `packages/shared/src/schemas/order.ts` | OrderSchema/OrderLineItemSchema/OrderReturnSchema/OrderReturnLineItemSchema + Platform/ReturnType enums |
| Modify | `packages/shared/src/schemas/index.ts` | barrel export 갱신 |
| Modify | `packages/shared/src/index.ts` | type re-export 갱신 |
| Rewrite | `apps/server/src/channels/services/channel-sync.service.ts` | syncSingleOrder + syncSingleReturn 신 schema 로 재작성 |
| Modify | `apps/server/src/channels/services/types.ts` | Coupang adapter response 타입 정리 |
| Create | `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts` | sync rewrite unit tests (혹 기존 파일 있으면 수정) |
| Create | `apps/server/src/channels/__tests__/order-sync.pg.integration.spec.ts` | Real Postgres integration |
| Modify | `apps/server/src/orders/services/returns.service.ts` | rename + IDOR fix + receiptType→type |
| Modify | `apps/server/src/orders/services/orders.service.ts` | productId/coupangOrderId/quantity 의존 제거 |
| Modify | `apps/server/src/picking/picking.service.ts` | order.product/productId/quantity 의존 제거, lineItems include 로 변경 |
| Modify | `apps/server/src/dashboard/services/dashboard-sales.service.ts` | coupangOrder + raw SQL 호출 stub (throw) |
| Modify | `apps/server/src/channels/services/channel-dashboard.service.ts` | 7 raw SQL coupang_* 호출 stub |
| Modify | `apps/server/src/finance/services/profit-loss.service.ts` | raw SQL coupang_* 호출 stub |
| Modify | `apps/server/src/statistics/statistics.service.ts` | coupang refs 있으면 stub |
| Modify | `apps/server/src/supplier-stats/supplier-stats.service.ts` | 동일 |
| Modify | `apps/server/src/settlements/settlements.service.ts` | 동일 |
| Modify | `apps/server/src/sales-plans/sales-plans.service.ts` | 동일 |
| Modify | `apps/server/src/dashboard/helpers/profit-calculator.ts` | 동일 |
| Create | `.claude/docs/decisions/0015-order-schema-unification.md` | ADR (channel-agnostic + status 의미 + promotion rule) |
| Create | `apps/server/src/orders/CLAUDE.md` 또는 갱신 | 신 schema 가이드 |
| Modify | `apps/server/src/channels/CLAUDE.md` | sync 패턴 갱신 |
| Modify | `prisma/CLAUDE.md` | orders.prisma 모델 라인업 갱신 |

---

## Task Dependencies

```
T1 (schema) -> T2 (db push + generate) -> T3 (shared types + barrels) ─┐
                                                                       ├─> T4 (channel-sync rewrite)
                                                                       ├─> T5 (returns sync rewrite)
                                                                       ├─> T6 (returns.service IDOR + rename)
                                                                       ├─> T7 (orders.service stub)
                                                                       ├─> T8 (picking compile-fix)
                                                                       ├─> T9 (dashboard/finance/channel-dashboard stub)
                                                                       └─> T10 (statistics/supplier-stats/etc stub)

T4-T10 sequential (각자 다른 file 이지만 독립 검증 위해 순차)
T11 (integration tests) -> T12 (ADR + CLAUDE.md) -> T13 (final verification)
```

**Parallel-safe**: Phase 1 (T1-T3) 내부는 순차 (T1→T2→T3 dependency). T6-T10 내부는 다른 파일이라 parallel 가능하지만 sequential 권장 (단순성).

---

## Task 1: Schema Rewrite (orders.prisma + core.prisma)

**Files:**
- Rewrite: `prisma/models/orders.prisma`
- Modify: `prisma/models/core.prisma`

### Step 1.1 — 현재 schema 백업 read

- [ ] **Run**: `cat prisma/models/orders.prisma | head -250`
- [ ] **Run**: `grep -n "Order\|CoupangOrder\|coupangOrder\|CoupangReturn\|coupangReturn\|OrderLineItem\|orderLineItem\|orderReturns" prisma/models/core.prisma`

기존 Company/ChannelListing/ChannelListingOption/ProductOption 의 back-relation 파악.

### Step 1.2 — orders.prisma 재작성

- [ ] **Rewrite `prisma/models/orders.prisma`** (CoupangOrder/CoupangOrderItem/CoupangReturn 삭제 + Order 재작성 + OrderLineItem/OrderReturn/OrderReturnLineItem 신설)

```prisma
/// @namespace Orders
/// @describe 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem.
model Order {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid

  platform        String    @db.VarChar(20)
  externalOrderId String    @map("external_order_id") @db.VarChar(60)
  externalNumber  String?   @map("external_number") @db.VarChar(60)

  customerName    String    @default("") @map("customer_name")
  receiverName    String?   @map("receiver_name")
  receiverPhone   String?   @map("receiver_phone")
  receiverAddr    String?   @map("receiver_addr")
  memo            String?

  status          String    @default("pending")
  orderedAt       DateTime  @default(now()) @map("ordered_at") @db.Timestamptz
  paidAt          DateTime? @map("paid_at") @db.Timestamptz
  shippedAt       DateTime? @map("shipped_at") @db.Timestamptz
  deliveredAt     DateTime? @map("delivered_at") @db.Timestamptz

  trackingNumber  String?   @map("tracking_number")
  shippingCompany String?   @map("shipping_company")
  shippingPrice   Int       @default(0) @map("shipping_price")

  totalPrice      Int       @default(0) @map("total_price")

  listingId       String?   @map("listing_id") @db.Uuid

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

/// @namespace Orders
/// @describe 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. companyId 는 IDOR 방어용 denormalize (B2a 패턴).
model OrderLineItem {
  id              String   @id @default(uuid()) @db.Uuid
  companyId       String   @map("company_id") @db.Uuid
  orderId         String   @map("order_id") @db.Uuid

  listingOptionId String?  @map("listing_option_id") @db.Uuid
  optionId        String?  @map("option_id") @db.Uuid

  productName     String   @default("") @map("product_name")
  optionName      String?  @map("option_name")
  sku             String?

  quantity        Int      @default(1)
  unitPrice       Int      @default(0) @map("unit_price")
  totalPrice      Int      @default(0) @map("total_price")

  status          String   @default("pending")

  externalLineId  String?  @map("external_line_id") @db.VarChar(60)

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

/// @namespace Orders
/// @describe 채널-agnostic 반품 aggregate. CoupangReturn 의 items JSON → OrderReturnLineItem 정규화. type=RETURN/EXCHANGE 구분 first-class.
model OrderReturn {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid
  orderId         String?   @map("order_id") @db.Uuid

  platform        String    @db.VarChar(20)
  externalReturnId String   @map("external_return_id") @db.VarChar(60)

  type            String    @default("RETURN") @db.VarChar(20)

  status          String    @default("pending")
  reason          String    @default("")
  reasonCategory1 String?   @map("reason_category1")
  reasonCategory2 String?   @map("reason_category2")
  faultBy         String    @default("CUSTOMER") @map("fault_by") @db.VarChar(20)

  requesterName   String    @default("") @map("requester_name")
  enclosePrice    Int?      @map("enclose_price")

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
  @@index([type])
  @@index([requestedAt])
  @@map("order_returns")
}

/// @namespace Orders
/// @describe 반품 라인 아이템 — 반품 건 내 SKU 단위 상세. companyId 는 IDOR 방어용 denormalize.
model OrderReturnLineItem {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid
  returnId        String    @map("return_id") @db.Uuid
  orderLineItemId String?   @map("order_line_item_id") @db.Uuid
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

기존 `Shipment`, `UnshippedItem`, `Settlement`, `CSRecord`, `Review` 모델은 그대로 유지 (touch X). `CoupangOrder`, `CoupangOrderItem`, `CoupangReturn` 모델 + 그들의 namespace 주석 모두 삭제.

### Step 1.3 — core.prisma back-relations 갱신

- [ ] **Edit `prisma/models/core.prisma` `model Company`** — `coupangOrders`/`coupangReturns` 라인 제거하고 다음 추가:

```prisma
  // Order domain (Plan A.5)
  orderLineItems        OrderLineItem[]
  orderReturns          OrderReturn[]
  orderReturnLineItems  OrderReturnLineItem[]
```

(기존 `orders Order[]` 는 유지)

- [ ] **Edit `prisma/models/core.prisma` `model ProductOption`** — 다음 추가 (기존 relation 들 사이에):

```prisma
  // Order domain (Plan A.5)
  orderLineItems        OrderLineItem[]
  orderReturnLineItems  OrderReturnLineItem[]
```

- [ ] **Edit `prisma/models/core.prisma` `model ChannelListingOption`** — `coupangOrderItems CoupangOrderItem[]` 라인 제거하고 다음 추가:

```prisma
  orderLineItems    OrderLineItem[]
```

### Step 1.4 — Commit (schema only, 아직 push X)

- [ ] **Run**:
```bash
git add prisma/models/orders.prisma prisma/models/core.prisma
git commit -m "feat(prisma): Plan A.5 Order schema unification

Drop CoupangOrder/CoupangOrderItem/CoupangReturn. Add Order (aggregate
root) + OrderLineItem (per-SKU) + OrderReturn + OrderReturnLineItem.
Channel-agnostic with metadata Json + promoted first-class fields
(receiver/status/dates/totals/shipping/type).

Update Company/ProductOption/ChannelListingOption back-relations."
```

---

## Task 2: db push + 3layer-setup + Prisma generate

**Files:** None — verification 전용

### Step 2.1 — Schema push (data drop 동의)

- [ ] **Run**: `npm run db:push -- --accept-data-loss 2>&1 | tail -10`

Expected: "in sync" + DROP TABLE coupang_orders/coupang_order_items/coupang_returns + CREATE TABLE order_line_items/order_returns/order_return_line_items + ALTER TABLE orders.

### Step 2.2 — 3-layer setup 재적용

- [ ] **Run**: `npm run db:3layer-setup 2>&1 | tail -10`

Expected: B2a RLS/CHECK/partial unique indexes 모두 재적용 (idempotent).

### Step 2.3 — Prisma generate

- [ ] **Run**: `npx prisma generate 2>&1 | tail -5`

Expected: "Generated Prisma Client" — 신규 4 모델 + 변경 back-relations 모두 인식.

### Step 2.4 — 신 클라이언트 sanity check

- [ ] **Run**: `node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log(typeof p.order.upsert, typeof p.orderLineItem.upsert, typeof p.orderReturn.upsert, typeof p.orderReturnLineItem.upsert, typeof p.coupangOrder); p.\$disconnect();"`

Expected: `function function function function undefined` (coupangOrder 는 undefined — 폐기 확인).

### Step 2.5 — Commit (검증 단계, 새 파일 없음)

- [ ] **참고**: package-lock.json 변경 가능. 확인:

```bash
git status -s
# package-lock.json 변경 있으면:
git add package-lock.json
git commit -m "chore(deps): refresh after prisma generate"
# 변경 없으면 commit skip
```

---

## Task 3: Shared Types + Barrel Exports

**Files:**
- Rewrite: `packages/shared/src/schemas/order.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`

### Step 3.1 — 기존 order.ts 백업 read

- [ ] **Run**: `cat packages/shared/src/schemas/order.ts`

기존 `OrderRowSchema`, `OrdersResponseSchema` 등 확인 — 모두 제거 대상.

### Step 3.2 — order.ts 재작성

- [ ] **Rewrite `packages/shared/src/schemas/order.ts`**:

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

// Platform / type enums (Zod-level — DB 는 String per ADR-0001)
export const OrderPlatformSchema = z.enum(['coupang', 'naver', '11st', 'manual']);
export type OrderPlatform = z.infer<typeof OrderPlatformSchema>;

export const OrderReturnTypeSchema = z.enum(['RETURN', 'EXCHANGE']);
export type OrderReturnType = z.infer<typeof OrderReturnTypeSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  platform: z.string().max(20),
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
  metadata: z.unknown().nullable(),
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

기존 OrderRow/OrdersResponse 등은 모두 제거.

### Step 3.3 — schemas/index.ts 갱신

- [ ] **Read** `packages/shared/src/schemas/index.ts` 현재 내용 확인.

- [ ] **Edit** — 기존 order 관련 export 라인 (`OrderRowSchema`, `OrdersResponseSchema` 등) 제거 후 다음 추가 (이미 `export * from './order.js'` 있으면 신규 schema 자동 포함, 없으면 추가):

```ts
export * from './order.js';
```

- [ ] **Run**: `grep -n "Order\|OrderRow\|OrdersResponse" packages/shared/src/schemas/index.ts`

Expected: `OrderRowSchema`/`OrdersResponseSchema` 없음. `export * from './order.js'` 또는 신규 type/schema 명시 export 만.

### Step 3.4 — index.ts (root barrel) 갱신

- [ ] **Edit** `packages/shared/src/index.ts` — 기존 OrderRow/OrdersResponse 제거 후 신규 type re-export 추가 (혹 `export * from './schemas/order.js'` 패턴이면 auto):

```ts
export type {
  Order,
  OrderLineItem,
  OrderReturn,
  OrderReturnLineItem,
  OrderPlatform,
  OrderReturnType,
} from './schemas/order.js';
```

- [ ] **Run**: `grep -n "Order" packages/shared/src/index.ts | head`

Expected: 신규 type 만 노출.

### Step 3.5 — Build + sanity check

- [ ] **Run**: `npm run build -w packages/shared 2>&1 | tail -8`

Expected: "Build success" + dist 갱신.

- [ ] **Run**: `node -e "const s = require('./packages/shared/dist/index.cjs'); console.log(Object.keys(s).filter(k => k.startsWith('Order')))"`

Expected: `['OrderSchema', 'OrderLineItemSchema', 'OrderReturnSchema', 'OrderReturnLineItemSchema', 'OrderPlatformSchema', 'OrderReturnTypeSchema']` 또는 자동 export 시 위 6개 + types (런타임 미노출).

### Step 3.6 — Commit

- [ ] **Run**:
```bash
git add packages/shared/src/schemas/order.ts packages/shared/src/schemas/index.ts packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(shared): Plan A.5 Order schemas

Add OrderSchema, OrderLineItemSchema, OrderReturnSchema,
OrderReturnLineItemSchema + OrderPlatform/OrderReturnType enums.

Remove legacy OrderRowSchema/OrdersResponseSchema (Plan B1 P0:
both schemas/index.ts and index.ts barrels updated)."
```

---

## Task 4: Channel-Sync Order Rewrite

**Files:**
- Modify: `apps/server/src/channels/services/channel-sync.service.ts`
- Modify: `apps/server/src/channels/services/types.ts` (필요 시)
- Create or modify: `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts`

### Step 4.1 — 현재 syncSingleOrder 위치 확인

- [ ] **Run**: `grep -n "syncSingleOrder\|coupangOrder\|coupangOrderItem" apps/server/src/channels/services/channel-sync.service.ts | head -20`

기존 함수 위치 + 호출처 확인.

### Step 4.2 — 실패 unit test 작성

- [ ] **Create or extend `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts`** — 다음 describe block 추가:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ChannelSyncService } from '../channel-sync.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ChannelSyncService.syncSingleOrder (Plan A.5)', () => {
  let service: ChannelSyncService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      order: { upsert: vi.fn() },
      orderLineItem: { upsert: vi.fn() },
      channelListingOption: { findUnique: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
        // 필요한 다른 deps 는 mock 으로 빈 객체
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  it('upserts Order with platform=coupang + externalOrderId=shipmentBoxId', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1', companyId: 'c1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-100',
      orderId: 'CO-200',
      status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 2, salesPrice: 1000, orderPrice: 2000 }],
      shippingPrice: 0,
      totalPrice: 2000,
      orderer: { name: 'Alice' },
      receiver: { name: 'Bob', addr1: 'Seoul' },
    } as any, 'c1');

    expect(prisma.$transaction).toHaveBeenCalled();
    const upsertArgs = tx.order.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({
      companyId_platform_externalOrderId: { companyId: 'c1', platform: 'coupang', externalOrderId: 'SBX-100' },
    });
    expect(upsertArgs.create.externalNumber).toBe('CO-200');
    expect(upsertArgs.create.totalPrice).toBe(2000);
    expect(upsertArgs.create.customerName).toBe('Alice');
  });

  it('vendorItemId match → optionId denormalized on OrderLineItem', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue({
      id: 'lo-1',
      optionId: 'opt-1',
      option: { sku: 'SKU-1', optionName: 'Red' },
    });
    tx.orderLineItem.upsert.mockResolvedValue({});

    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const liArgs = tx.orderLineItem.upsert.mock.calls[0][0];
    expect(liArgs.create.optionId).toBe('opt-1');
    expect(liArgs.create.listingOptionId).toBe('lo-1');
    expect(liArgs.create.sku).toBe('SKU-1');
  });

  it('vendorItemId no match → optionId null', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'UNKNOWN', sellerProductName: 'Mystery', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, 'c1');

    const liArgs = tx.orderLineItem.upsert.mock.calls[0][0];
    expect(liArgs.create.optionId).toBeNull();
    expect(liArgs.create.listingOptionId).toBeNull();
    expect(liArgs.create.sku).toBeNull();
  });

  it('totalPrice computed from sum(orderItems.orderPrice)', async () => {
    tx.order.upsert.mockResolvedValue({ id: 'order-1' });
    tx.channelListingOption.findUnique.mockResolvedValue(null);
    tx.orderLineItem.upsert.mockResolvedValue({});

    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT', orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [
        { vendorItemId: 'V1', sellerProductName: 'A', shippingCount: 1, salesPrice: 100, orderPrice: 100 },
        { vendorItemId: 'V2', sellerProductName: 'B', shippingCount: 1, salesPrice: 200, orderPrice: 200 },
      ],
    } as any, 'c1');

    const upsertArgs = tx.order.upsert.mock.calls[0][0];
    expect(upsertArgs.create.totalPrice).toBe(300);
  });
});
```

### Step 4.3 — 실패 확인

- [ ] **Run**: `cd apps/server && npx vitest run src/channels/services/__tests__/channel-sync.service.spec.ts 2>&1 | tail -15`

Expected: 4 신규 tests FAIL (현재 syncSingleOrder 가 신 schema 시그니처/로직 미반영).

### Step 4.4 — `syncSingleOrder` 재작성

- [ ] **Edit `apps/server/src/channels/services/channel-sync.service.ts`** — 기존 `syncSingleOrder` (대략 line 404-491) 를 다음으로 교체:

```ts
async syncSingleOrder(payload: any, companyId: string) {
  const shipmentBoxId = payload.shipmentBoxId;
  const totalPrice = (payload.orderItems ?? []).reduce(
    (sum: number, it: any) => sum + (it.orderPrice ?? 0),
    0,
  );
  const receiverAddr = [payload.receiver?.addr1, payload.receiver?.addr2]
    .filter(Boolean)
    .join(' ') || null;

  return this.prisma.$transaction(async (tx) => {
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
        receiverAddr,
        memo: payload.parcelPrintMessage ?? null,
        metadata: {
          orderer: payload.orderer ?? null,
          receiver: payload.receiver ?? null,
          parcelPrintMessage: payload.parcelPrintMessage ?? null,
        },
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
        receiverAddr,
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
        },
      },
    });

    for (const item of payload.orderItems ?? []) {
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
          },
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
          },
        },
      });
    }

    return order;
  }, { timeout: 15_000 });
}
```

기존 `prisma.coupangOrder.findUnique/upsert/create/update`, `prisma.coupangOrderItem.deleteMany/create` 호출 모두 제거.

### Step 4.5 — 테스트 통과 확인

- [ ] **Run**: `cd apps/server && npx vitest run src/channels/services/__tests__/channel-sync.service.spec.ts 2>&1 | tail -15`

Expected: 4 PASS.

### Step 4.6 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/channels/services/channel-sync.service.ts apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts
git commit -m "feat(channels): Plan A.5 Order sync rewrite

syncSingleOrder writes Order + OrderLineItem in single
\$transaction(async tx). Compound unique key (companyId, platform,
externalOrderId). vendorItemId lookup via ChannelListingOption.
optionId denormalized for query perf. totalPrice = sum of
lineItems.totalPrice."
```

---

## Task 5: Channel-Sync Return Rewrite

**Files:**
- Modify: `apps/server/src/channels/services/channel-sync.service.ts`
- Modify: `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts`

### Step 5.1 — 기존 syncSingleReturn (or 동등 함수) 위치 확인

- [ ] **Run**: `grep -n "coupangReturn\|syncReturn\|syncSingleReturn" apps/server/src/channels/services/channel-sync.service.ts | head`

### Step 5.2 — 실패 unit test 추가

- [ ] **Edit `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts`** — describe 추가:

```ts
describe('ChannelSyncService.syncSingleReturn (Plan A.5)', () => {
  let service: ChannelSyncService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      orderReturn: { upsert: vi.fn() },
      orderReturnLineItem: { deleteMany: vi.fn(), create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
      order: { findFirst: vi.fn() },
    };
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  it('upserts OrderReturn with type from receiptType', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
    tx.orderReturn.upsert.mockResolvedValue({ id: 'ret-1' });

    await service.syncSingleReturn({
      receiptId: 'RCT-1',
      receiptType: 'RETURN',
      receiptStatus: 'UC',
      orderId: 'CO-1',
      cancelReason: 'damaged',
      faultByType: 'CUSTOMER',
      requesterName: 'Alice',
      requestedAt: '2026-04-18T00:00:00Z',
      items: [],
    } as any, 'c1');

    const args = tx.orderReturn.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      companyId_platform_externalReturnId: { companyId: 'c1', platform: 'coupang', externalReturnId: 'RCT-1' },
    });
    expect(args.create.type).toBe('RETURN');
    expect(args.create.requesterName).toBe('Alice');
    expect(args.create.orderId).toBe('order-1');
  });

  it('items JSON → OrderReturnLineItem rows', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    tx.orderReturn.upsert.mockResolvedValue({ id: 'ret-1' });
    tx.orderReturnLineItem.create.mockResolvedValue({});

    await service.syncSingleReturn({
      receiptId: 'RCT-2',
      receiptType: 'EXCHANGE',
      receiptStatus: 'UC',
      orderId: null,
      requesterName: 'Bob',
      requestedAt: '2026-04-18T00:00:00Z',
      items: [
        { productName: 'Toy', quantity: 1 },
        { productName: 'Book', quantity: 2 },
      ],
    } as any, 'c1');

    expect(tx.orderReturnLineItem.deleteMany).toHaveBeenCalledWith({ where: { returnId: 'ret-1' } });
    expect(tx.orderReturnLineItem.create).toHaveBeenCalledTimes(2);
    const firstCreate = tx.orderReturnLineItem.create.mock.calls[0][0].data;
    expect(firstCreate.companyId).toBe('c1');
    expect(firstCreate.productName).toBe('Toy');
  });
});
```

### Step 5.3 — 실패 확인

- [ ] **Run**: `cd apps/server && npx vitest run src/channels/services/__tests__/channel-sync.service.spec.ts 2>&1 | tail -10`

Expected: 신규 2 tests FAIL.

### Step 5.4 — `syncSingleReturn` 재작성

- [ ] **Edit `apps/server/src/channels/services/channel-sync.service.ts`** — 기존 `coupangReturn` 호출 부분 제거 + 다음 method 추가/교체:

```ts
async syncSingleReturn(payload: any, companyId: string) {
  const receiptId = payload.receiptId;
  const matchedOrder = payload.orderId
    ? await this.prisma.order.findFirst({
        where: {
          companyId,
          platform: 'coupang',
          externalNumber: payload.orderId,
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
        },
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
        },
      },
    });

    await tx.orderReturnLineItem.deleteMany({ where: { returnId: ret.id } });
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const it of items) {
      await tx.orderReturnLineItem.create({
        data: {
          companyId,
          returnId: ret.id,
          productName: it.productName ?? it.vendorItemName ?? '',
          quantity: it.quantity ?? 1,
          metadata: { raw: it },
        },
      });
    }

    return ret;
  }, { timeout: 15_000 });
}
```

기존 호출처가 `syncReturn` 등 다른 이름으로 부르고 있으면 wrapper 또는 export 그대로 유지.

### Step 5.5 — 통과 확인

- [ ] **Run**: `cd apps/server && npx vitest run src/channels/services/__tests__/channel-sync.service.spec.ts 2>&1 | tail -10`

Expected: 6 PASS (4 order + 2 return).

### Step 5.6 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/channels/services/channel-sync.service.ts apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts
git commit -m "feat(channels): Plan A.5 Return sync rewrite

syncSingleReturn writes OrderReturn + N OrderReturnLineItem in single
\$transaction. type (RETURN/EXCHANGE) promoted to first-class field.
matchedOrder lookup by externalNumber for orderId resolution.
items JSON normalized to OrderReturnLineItem rows."
```

---

## Task 6: returns.service.ts — IDOR fix + rename

**Files:**
- Modify: `apps/server/src/orders/services/returns.service.ts`

### Step 6.1 — 현재 파일 read

- [ ] **Run**: `cat apps/server/src/orders/services/returns.service.ts`

기존 `prisma.coupangReturn.findMany/findUnique` 호출 + `receiptType` 필터 + `companyId` 누락 (IDOR) 확인.

### Step 6.2 — 수정

- [ ] **Edit `apps/server/src/orders/services/returns.service.ts`** — 다음 변경:
  - `prisma.coupangReturn` → `prisma.orderReturn`
  - 모든 query 에 `companyId` 필터 추가 (`findAll` `findMany` where 절, `findOne` `findFirst({where: {id, companyId}})`)
  - `receiptType` → `type`
  - 메서드 시그니처에 `companyId: string` 추가
  - controller 가 `@CurrentCompany()` 주입하므로 caller 호환 유지

예 (실제 파일에 맞춰 적용):

```ts
async findAll(type: 'return' | 'exchange', companyId: string) {
  return this.prisma.orderReturn.findMany({
    where: {
      companyId,
      type: type === 'exchange' ? 'EXCHANGE' : 'RETURN',
    },
    include: { lineItems: true },
    orderBy: { requestedAt: 'desc' },
  });
}

async findOne(id: string, companyId: string) {
  const ret = await this.prisma.orderReturn.findFirst({
    where: { id, companyId },
    include: { lineItems: true },
  });
  if (!ret) throw new NotFoundException('OrderReturn not found');
  return ret;
}
```

### Step 6.3 — 호출 controller 확인 + 갱신

- [ ] **Run**: `grep -rn "returnsService\." apps/server/src --include="*.ts"`

해당 controller 들에서 `@CurrentCompany() companyId` 받고 service 호출 시 전달하도록 변경.

### Step 6.4 — tsc check

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep "returns.service\|returns.controller" | head`

Expected: 0 lines.

### Step 6.5 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/orders/services/returns.service.ts apps/server/src/orders/controllers
git commit -m "fix(orders): returns.service IDOR + Plan A.5 rename

- prisma.coupangReturn → prisma.orderReturn
- companyId filter on all queries (was IDOR)
- findUnique({id}) → findFirst({id, companyId})
- receiptType filter → type field (RETURN/EXCHANGE)
- Controllers inject @CurrentCompany() and pass companyId"
```

---

## Task 7: orders.service.ts — productId/coupangOrderId 제거

**Files:**
- Modify: `apps/server/src/orders/services/orders.service.ts`

### Step 7.1 — 현재 코드 read

- [ ] **Run**: `cat apps/server/src/orders/services/orders.service.ts`

### Step 7.2 — 수정

- [ ] **Edit** — `productId` `coupangOrderId` `productName` `quantity` (Order level) 의존 제거.
  - `findMany` 에 `include: { lineItems: true }` 추가
  - 응답 shape 은 raw 객체 (`as any` 또는 임시 type) 로 — Plan B2c 가 정리
  - `satisfies OrderRow` 등 옛 type 사용처 제거

```ts
// 예
async findAll(companyId: string, status?: string) {
  return this.prisma.order.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    include: { lineItems: true },
    orderBy: { orderedAt: 'desc' },
  });
}
```

### Step 7.3 — tsc check

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep "orders.service\|orders.controller" | head`

Expected: 0 lines (또는 controller 가 stale Order 필드 참조 시 거기서도 제거).

### Step 7.4 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/orders
git commit -m "refactor(orders): orders.service Plan A.5 schema fix

Remove Order.productId/coupangOrderId/productName/quantity references.
Add include: { lineItems: true }. Response shape simplified for B2c
to fully rewrite."
```

---

## Task 8: Picking — compile fix (already broken pre-A.5)

**Files:**
- Modify: `apps/server/src/picking/picking.service.ts`

### Step 8.1 — 현재 코드 read

- [ ] **Run**: `cat apps/server/src/picking/picking.service.ts`

기존 `order.product`, `order.productId`, `order.productName`, `order.quantity` (이미 stale 인 Plan A 잔여) 위치 확인.

### Step 8.2 — `generate()` 수정

- [ ] **Edit `picking.service.ts` `generate()` 메서드** — Order.productId 의존 제거:

```ts
async generate(companyId: string) {
  const orders = await this.prisma.order.findMany({
    where: { companyId, status: 'confirmed' },
    include: {
      lineItems: {
        include: { option: { select: { sku: true, optionName: true } } },
      },
    },
  });

  if (orders.length === 0) {
    throw new BadRequestException('피킹 대상 주문이 없습니다 (status=confirmed)');
  }

  const listNumber = `PK-${Date.now()}`;

  const allItems: Array<{
    orderId: string;
    optionId: string | null;
    productName: string;
    sku: string | null;
    quantity: number;
  }> = [];
  for (const order of orders) {
    for (const li of order.lineItems) {
      allItems.push({
        orderId: order.id,
        optionId: li.optionId,
        productName: li.productName,
        sku: li.sku ?? li.option?.sku ?? null,
        quantity: li.quantity,
      });
    }
  }

  const pickingList = await this.prisma.pickingList.create({
    data: {
      companyId,
      listNumber,
      totalItems: allItems.length,
      items: {
        create: allItems.map((it) => ({
          orderId: it.orderId,
          optionId: it.optionId ?? '',                          // PickingItem.optionId
          productName: it.productName,
          sku: it.sku ?? undefined,
          quantity: it.quantity,
          location: undefined,
        })),
      },
    },
    include: { items: true },
  });

  return pickingList;
}
```

기존 `order.product` `order.productId` `order.productName` `order.quantity` 모두 제거.

### Step 8.3 — tsc check

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep "picking" | head`

Expected: 0 lines.

### Step 8.4 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/picking/picking.service.ts
git commit -m "refactor(picking): Plan A.5 compile-fix on lineItems

Remove pre-stale Order.productId/product/productName/quantity refs.
generate() now iterates order.lineItems and creates PickingItem per
line. PickingItem schema already uses optionId.

Full picking redesign deferred to Plan B2.picking."
```

---

## Task 9: Stub-out — dashboard / channel-dashboard / profit-loss

**Files:**
- Modify: `apps/server/src/dashboard/services/dashboard-sales.service.ts`
- Modify: `apps/server/src/channels/services/channel-dashboard.service.ts`
- Modify: `apps/server/src/finance/services/profit-loss.service.ts`

### Step 9.1 — dashboard-sales.service.ts stub

- [ ] **Run**: `grep -n "coupangOrder\|coupang_order" apps/server/src/dashboard/services/dashboard-sales.service.ts | head`

각 호출 method 확인. 다음 패턴으로 method body 교체:

```ts
async getSalesAggregate(companyId: string /* + 기타 */) {
  // Plan B2c migration: rewrite using Order/OrderLineItem schema
  throw new Error('Not implemented: Plan B2c migration');
}
```

`prisma.coupangOrder.aggregate` 호출 + `$queryRaw FROM coupang_order_items` 모두 stub.

- [ ] **Edit** — 모든 broken method body throw 처리.

### Step 9.2 — channel-dashboard.service.ts stub

- [ ] **Run**: `grep -n "coupang_orders\|coupang_order_items\|coupang_returns" apps/server/src/channels/services/channel-dashboard.service.ts`

7+ raw SQL 호출 찾고 method body throw.

- [ ] **Edit**.

### Step 9.3 — profit-loss.service.ts stub

- [ ] **Run**: `grep -n "coupang_order\|coupangOrder" apps/server/src/finance/services/profit-loss.service.ts`

Raw SQL `FROM coupang_order_items coi JOIN coupang_orders co` 호출 method 찾고 throw.

- [ ] **Edit**.

### Step 9.4 — tsc check

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep -E "dashboard-sales|channel-dashboard|profit-loss" | head`

Expected: 0 (stub 들이 compile pass).

### Step 9.5 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/dashboard/services/dashboard-sales.service.ts apps/server/src/channels/services/channel-dashboard.service.ts apps/server/src/finance/services/profit-loss.service.ts
git commit -m "chore: stub Plan B2c-pending services (Order schema)

Replace coupangOrder/coupang_orders/coupang_order_items references
with throw 'Not implemented: Plan B2c migration'. Plan B2c will
rewrite these against Order/OrderLineItem schema.

Affected: dashboard-sales, channel-dashboard, profit-loss."
```

---

## Task 10: Stub-out — statistics / supplier-stats / settlements / sales-plans / profit-calculator

**Files:**
- Modify: `apps/server/src/statistics/statistics.service.ts`
- Modify: `apps/server/src/supplier-stats/supplier-stats.service.ts`
- Modify: `apps/server/src/settlements/settlements.service.ts`
- Modify: `apps/server/src/sales-plans/sales-plans.service.ts`
- Modify: `apps/server/src/dashboard/helpers/profit-calculator.ts`

### Step 10.1 — Per-file inspect + stub

각 파일에 대해:
- `grep -n "coupangOrder\|coupang_order\|coupang_returns" <file>`
- 호출 method body throw 처리 (이미 stale 일 수 있음 — 신규 broken 만 stub)

이미 broken (Plan A 후 stale) 인 method 는 그대로 두고, schema drop 으로 `prisma.coupangOrder` 가 undefined 인 것이 새 에러면 throw 로 정리.

### Step 10.2 — tsc check

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep -E "statistics|supplier-stats|settlements|sales-plans|profit-calculator" | head`

Expected: A.5 가 추가한 신규 broken 0 (기존 stale 은 그대로).

### Step 10.3 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/statistics apps/server/src/supplier-stats apps/server/src/settlements apps/server/src/sales-plans apps/server/src/dashboard/helpers
git commit -m "chore: stub Plan B2c-pending services (continued)

Statistics/supplier-stats/settlements/sales-plans/profit-calculator
methods that referenced dropped coupang* tables now throw
'Not implemented: Plan B2c migration'."
```

---

## Task 11: Integration Tests

**Files:**
- Create: `apps/server/src/channels/__tests__/order-sync.pg.integration.spec.ts`

### Step 11.1 — Create integration spec

- [ ] **Create file**:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelSyncService } from '../services/channel-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('Order sync (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelSyncService;
  const companyId = TEST_COMPANY_ID;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('first sync creates Order + OrderLineItem', async () => {
    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 2, salesPrice: 100, orderPrice: 200 }],
    } as any, companyId);

    const orders = await prisma.order.findMany({ where: { companyId }, include: { lineItems: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].externalOrderId).toBe('SBX-1');
    expect(orders[0].externalNumber).toBe('CO-1');
    expect(orders[0].totalPrice).toBe(200);
    expect(orders[0].lineItems).toHaveLength(1);
    expect(orders[0].lineItems[0].quantity).toBe(2);
    expect(orders[0].lineItems[0].externalLineId).toBe('V1');
  });

  it('second sync of same shipmentBoxId updates (no duplicate)', async () => {
    const payload = {
      shipmentBoxId: 'SBX-1', orderId: 'CO-1', status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V1', sellerProductName: 'Toy', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    };
    await service.syncSingleOrder(payload as any, companyId);

    payload.status = 'INSTRUCT';
    payload.orderItems[0].shippingCount = 5;
    payload.orderItems[0].orderPrice = 500;
    await service.syncSingleOrder(payload as any, companyId);

    const orders = await prisma.order.findMany({ where: { companyId }, include: { lineItems: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('INSTRUCT');
    expect(orders[0].totalPrice).toBe(500);
    expect(orders[0].lineItems[0].quantity).toBe(5);
  });

  it('vendorItemId match → optionId denormalized', async () => {
    // Seed master + option + listing + listingOption
    const master = await prisma.masterProduct.create({
      data: { companyId, code: 'M-1', name: 'Master', optionCounter: 1 },
    });
    const option = await prisma.productOption.create({
      data: { companyId, masterId: master.id, sku: 'SKU-1', optionName: 'Red', isBundle: false },
    });
    const listing = await prisma.channelListing.create({
      data: { companyId, masterId: master.id, channel: 'coupang', externalId: 'LST-1' },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: { companyId, listingId: listing.id, optionId: option.id, vendorItemId: 'V_KNOWN', itemName: 'Red' },
    });

    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-2', orderId: 'CO-2', status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V_KNOWN', sellerProductName: 'Toy', shippingCount: 1, salesPrice: 100, orderPrice: 100 }],
    } as any, companyId);

    const lineItems = await prisma.orderLineItem.findMany({ where: { companyId } });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].listingOptionId).toBe(listingOption.id);
    expect(lineItems[0].optionId).toBe(option.id);
    expect(lineItems[0].sku).toBe('SKU-1');
  });

  it('vendorItemId no match → optionId null (graceful)', async () => {
    await service.syncSingleOrder({
      shipmentBoxId: 'SBX-3', orderId: 'CO-3', status: 'ACCEPT',
      orderedAt: '2026-04-18T00:00:00Z',
      orderItems: [{ vendorItemId: 'V_UNKNOWN', sellerProductName: 'Mystery', shippingCount: 1, salesPrice: 50, orderPrice: 50 }],
    } as any, companyId);

    const lineItems = await prisma.orderLineItem.findMany({ where: { companyId } });
    expect(lineItems[0].optionId).toBeNull();
    expect(lineItems[0].listingOptionId).toBeNull();
  });

  it('return sync — items JSON normalized to OrderReturnLineItem', async () => {
    await service.syncSingleReturn({
      receiptId: 'RCT-1',
      receiptType: 'RETURN',
      receiptStatus: 'UC',
      orderId: null,
      cancelReason: 'damaged',
      faultByType: 'CUSTOMER',
      requesterName: 'Alice',
      requestedAt: '2026-04-18T00:00:00Z',
      items: [
        { productName: 'Toy', quantity: 1 },
        { productName: 'Book', quantity: 2 },
      ],
    } as any, companyId);

    const returns = await prisma.orderReturn.findMany({ where: { companyId }, include: { lineItems: true } });
    expect(returns).toHaveLength(1);
    expect(returns[0].type).toBe('RETURN');
    expect(returns[0].lineItems).toHaveLength(2);
    expect(returns[0].lineItems[0].productName).toBe('Toy');
  });
});
```

### Step 11.2 — DB 준비 + 실행

- [ ] **Run**: `npm run db:test:up && npm run db:test:prepare`
- [ ] **Run**: `npm run test:integration -- order-sync 2>&1 | tail -15`

Expected: 5 PASS.

### Step 11.3 — Commit

- [ ] **Run**:
```bash
git add apps/server/src/channels/__tests__/order-sync.pg.integration.spec.ts
git commit -m "test(channels): order-sync PG integration

5 scenarios:
- first sync creates Order + OrderLineItem
- repeat sync updates (no duplicate via compound unique)
- vendorItemId match denormalizes optionId/sku
- vendorItemId no match → graceful nulls
- return sync normalizes items JSON to OrderReturnLineItem"
```

---

## Task 12: ADR-0015 + CLAUDE.md

**Files:**
- Create: `.claude/docs/decisions/0015-order-schema-unification.md`
- Modify: `apps/server/src/orders/CLAUDE.md`
- Modify: `apps/server/src/channels/CLAUDE.md`
- Modify: `prisma/CLAUDE.md`

### Step 12.1 — ADR-0015 생성

- [ ] **Create** `.claude/docs/decisions/0015-order-schema-unification.md`:

```markdown
# ADR-0015: Order Schema Channel-Agnostic Unification

**Status**: Accepted (2026-04-18, Plan A.5)
**Predecessors**: ADR-0013 (3-layer schema), ADR-0014 (single-writer)

## Context

기존 Order 도메인은 `Order` (denormalized, single-product 가정) + `CoupangOrder` + `CoupangOrderItem` + `CoupangReturn` (Coupang 전용 aggregate) 가 병존. Multi-channel 확장 시 `NaverOrder/Item`, `11stOrder/Item` 식 N+1 테이블이 필요해지는 channel-leak 패턴.

## Decision

1. **Channel-agnostic 4 모델**: `Order` (aggregate root) + `OrderLineItem` (per-SKU) + `OrderReturn` + `OrderReturnLineItem`. 채널은 `platform String` 필드로 구분, 채널별 raw payload 는 `metadata Json` 컬럼.

2. **`Order.status` vs `OrderLineItem.status` 의미 분리**:
   - `Order.status` 는 aggregate-level (사용자/관리 UI 용)
   - `OrderLineItem.status` 는 라인-level (부분 발송/취소)
   - 두 status 는 **독립적으로 유지**. `Order.status` 는 service 가 라인 status 변경 후 명시적으로 갱신 (B2c 가 규칙 정의)

3. **First-class field promotion rule**:
   - Production query (WHERE/JOIN/GROUP BY) 에서 1개 이상 도메인 service 가 사용하면 first-class column 으로 graduate
   - 단순 display 만 사용하는 필드는 `metadata Json` 유지
   - 예 promote: receiver name/phone/addr, dates, totals, shipping, return type
   - 예 metadata 유지: orderer JSON, parcelPrintMessage, vendorItemId, reasonCode, returnDeliveryId

## Rationale

- N+1 채널 테이블 폭증 방지 (Multi-channel 확장 비용 ↓)
- Picking/Statistics/Settlements/Inventory hook 등 다운스트림 service 가 channel 코드 없이 OrderLineItem 으로 SKU 처리
- Status 분리 → 부분 발송 시나리오 (`OrderLineItem.status='shipped'` 일부 + `Order.status='partial_shipped'`) 정확히 표현

## Consequences

**긍정**:
- Naver/11st 추가 시 schema 변경 없이 신 platform 값만 추가
- `OrderLineItem.optionId` denormalize 로 SKU 조회 single join

**부정**:
- `metadata Json` 은 query 시 `WHERE metadata->>'field'` 필요 (queryability 저하)
- B2c 가 모든 read-side service 를 신 schema 에 맞춰 재작성해야 함
- `Order.totalPrice` denormalization (sum of lineItems.totalPrice, shipping 제외) drift 위험 — sync 가 항상 재계산

## Enforcement

- 신규 channel-specific 테이블 생성 거부 (PR 리뷰)
- Promotion 결정 (metadata → first-class) 은 ADR amendment 또는 별도 plan 으로 기록
- `prisma.coupangOrder*` 호출 grep — 0 hits 유지

## Superseded by

N/A.

## Related

- Plan A.5 spec: docs/superpowers/specs/2026-04-18-plan-a5-order-schema-unification-design.md
- ADR-0013, ADR-0014
```

### Step 12.2 — orders/CLAUDE.md 갱신

- [ ] **Run**: `cat apps/server/src/orders/CLAUDE.md` (기존 파일 확인)
- [ ] **Edit** — Plan A.5 schema banner + Order/OrderLineItem 가이드 + IDOR 규약 추가

### Step 12.3 — channels/CLAUDE.md 갱신

- [ ] **Edit** — sync 부분에서 `coupangOrder` → `Order` 전환 명시 + `$transaction` 패턴

### Step 12.4 — prisma/CLAUDE.md 갱신

- [ ] **Edit** — orders.prisma 모델 라인업 갱신:

기존:
```
├── orders.prisma           (Order, CoupangOrder*, CoupangReturn, Shipment, UnshippedItem, Settlement, CSRecord, Review)
```

신규:
```
├── orders.prisma           (Order + OrderLineItem + OrderReturn + OrderReturnLineItem (ADR-0015 channel-agnostic), Shipment, UnshippedItem, Settlement, CSRecord, Review)
```

### Step 12.5 — Commit

- [ ] **Run**:
```bash
git add .claude/docs/decisions/0015-order-schema-unification.md apps/server/src/orders/CLAUDE.md apps/server/src/channels/CLAUDE.md prisma/CLAUDE.md
git commit -m "docs: ADR-0015 + Order CLAUDE.md chain

ADR-0015 documents channel-agnostic Order schema decision, status
semantics (Order.status vs OrderLineItem.status independent), and
metadata promotion rule.

Updates orders/CLAUDE.md, channels/CLAUDE.md, prisma/CLAUDE.md."
```

---

## Task 13: Final Verification

**Files:** None — verification only

### Step 13.1 — tsc 전체 error count

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"`

Expected: A.5 머지 후에도 전체 errors 가 baseline (356) 대비 비슷하거나 약간 증가 — stub 들로 인해 compile pass 자체는 보장. 정확한 수치는 PR description 에 기록.

### Step 13.2 — 기존 broken 외 신규 broken 없음 확인

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep "error TS" | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn | head -20`

Expected: 신규 file 에러 추가 없음 (이미 stale 인 파일들의 에러만).

### Step 13.3 — Plan A.5 신규 file unit + integration tests

- [ ] **Run**: `cd apps/server && npx vitest run src/channels 2>&1 | tail -10`

Expected: 모든 PASS.

- [ ] **Run**: `npm run test:integration -- order-sync 2>&1 | tail -10`

Expected: 5 PASS.

### Step 13.4 — coupang* table 호출 잔존 확인

- [ ] **Run**: `grep -rn "prisma\.coupangOrder\|prisma\.coupangOrderItem\|prisma\.coupangReturn" apps/server/src --include="*.ts" | head`

Expected: 0 hits (모두 stub 으로 교체됨).

- [ ] **Run**: `grep -rn "FROM coupang_order\|FROM coupang_returns\|JOIN coupang_orders" apps/server/src --include="*.ts" | head`

Expected: 0 hits.

### Step 13.5 — back-relation generate 검증

- [ ] **Run**: `node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.company.findFirst({ select: { orderLineItems: true, orderReturns: true, orderReturnLineItems: true } }).then(() => { console.log('OK'); p.\$disconnect(); }).catch(e => { console.error(e.message); p.\$disconnect(); });"`

Expected: "OK" (back-relations 정상).

### Step 13.6 — PR 생성 준비 확인

- [ ] **Run**: `git log --oneline -20`

12 task commit (1-12) + 1 verification (13 미커밋) 확인.

---

## Post-Implementation

### PR 생성

- [ ] **Run**: `git push -u origin feat/plan-a5-order-schema`
- [ ] **`gh pr create`** with PR body 명시:
  - ADR-0015 추가
  - CoupangOrder*/CoupangReturn drop
  - dev:server 부팅 안 됨 (B2c 에서 해결)
  - Squash merge 권장

### 후속 세션

- [ ] Plan B2b (advertising) 또는 B2c (orders catch-all) 진입
- [ ] `init.sql.gz` 갱신 — B2c 후 별도 PR

---

**End of plan.**
