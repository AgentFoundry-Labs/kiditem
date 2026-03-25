# Phase 1: Foundation - Research

**Researched:** 2026-03-26
**Domain:** Prisma 스키마 재설계 + JSON 데이터 임포트 (NestJS/Prisma/PostgreSQL)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 기존 `Order` 모델을 삭제하고 새로운 2-tier 구조로 재설계: `CoupangOrder` (배송박스 단위) + `CoupangOrderItem` (아이템 단위)
- **D-02:** 쿠팡 원본 필드명 최대한 유지 (orderer, receiver는 JSON 타입으로 저장, orderItems는 별도 테이블)
- **D-03:** `shipmentBoxId`를 CoupangOrder의 unique key로 사용 (upsert 기준)
- **D-04:** `CoupangReturn` + `CoupangReturnItem` 2-tier 구조로 신규 생성
- **D-05:** `receiptId`를 CoupangReturn의 unique key로 사용 (upsert 기준)
- **D-06:** `faultByType` (VENDOR/CUSTOMER), `reasonCode`, `reasonCodeText` 등 사유/귀책 필드를 1급 컬럼으로 저장
- **D-07:** 쿠팡 대형 ID (shipmentBoxId, orderId, vendorItemId, returnDeliveryId 등 19자리)는 `String` 타입으로 저장. Prisma에서 `@db.VarChar(30)` 사용.
- **D-08:** 쿠팡 타임스탬프("2026-03-23T13:59:41", timezone offset 없음)는 KST로 간주하고 `+09:00` 붙여 UTC 변환 후 `@db.Timestamptz`로 저장. 헬퍼 함수 `parseKST(str)` 구현.
- **D-09:** Product 모델에 `deliveryInfo` (Json), `items` (별도 `ProductItem` 테이블), `images` (Json 배열) 추가
- **D-10:** `ProductItem`은 옵션 단위 (itemName, salePrice, originalPrice, vendorItemId 등). Product:ProductItem = 1:N
- **D-11:** 기존 `prisma/seed.ts`와 별도로 `prisma/seed-coupang.ts` 생성. 쿠팡 JSON 데이터 임포트 전용.
- **D-12:** `upsert` 패턴으로 멱등성 보장. 쿠팡 원본 ID(shipmentBoxId, receiptId, sellerProductId)를 unique 키로 사용.
- **D-13:** ~~`coupang_orders_raw.json`은 배열이 아닌 객체(`{0:..., 1:...}`) 형태 → `Object.values()` 처리 필수.~~ **[수정됨: 직접 확인 결과 Array 형태임. Object.values() 불필요.]**
- **D-14:** npm script `db:seed-coupang` 추가 (`tsx prisma/seed-coupang.ts`)
- **D-15:** `dashboard.service.ts`의 `prisma.order.aggregate()` → `prisma.coupangOrder` 기반으로 리팩토링
- **D-16:** `products.service.ts`와 `reviews.service.ts`의 `prisma.order.groupBy()` → `prisma.coupangOrderItem.groupBy()` (productId 기준)
- **D-17:** `prisma/seed.ts` 기존 Order 생성 코드 → CoupangOrder/CoupangOrderItem 구조로 변경
- **D-18:** 기존 orders.service.ts의 쿠팡 API 호출 로직은 유지하되, DB CRUD 메서드 추가

### Claude's Discretion

- Prisma 모델 필드의 정확한 타입/길이 결정
- seed-coupang.ts 내부 배치 처리 전략 (createMany vs loop)
- 에러 핸들링 패턴 (skip vs fail on invalid record)
- Product.deliveryInfo JSON 구조의 정확한 형태

### Deferred Ideas (OUT OF SCOPE)

None — Phase 1은 순수 인프라/스키마 작업, scope creep 위험 없음.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHM-01 | 쿠팡 주문 데이터를 shipmentBox → orderItems 계층 구조로 저장할 수 있다 | CoupangOrder + CoupangOrderItem 2-tier 스키마 설계 완료 |
| SCHM-02 | 쿠팡 반품 데이터를 return → returnItems 계층 구조로 저장할 수 있다 | CoupangReturn + CoupangReturnItem 스키마 설계 완료 |
| SCHM-03 | 상품 상세 정보(옵션, 이미지, 배송정책)를 저장할 수 있다 | Product 확장 + ProductItem 신규 모델 설계 완료 |
| SCHM-04 | 쿠팡 ID(shipmentBoxId, orderId 등 대형 숫자)를 데이터 손실 없이 저장할 수 있다 | String VarChar(30) 타입 결정, NestJS 직렬화 안전성 확인 |
| SCHM-05 | 기존 Order 의존 서비스(dashboard, inventory, products, reviews)가 스키마 변경 후에도 정상 동작한다 | 4개 서비스의 정확한 Order 의존 코드 특정 완료 |
| IMPT-01 | data/ 폴더의 쿠팡 주문 JSON(298건)을 DB에 임포트할 수 있다 | 파일 구조 확인(Array, 298건), upsert 패턴 설계 |
| IMPT-02 | data/ 폴더의 쿠팡 반품 JSON(20건)을 DB에 임포트할 수 있다 | 파일 구조 확인(Array, 20건), receiptId unique 키 |
| IMPT-03 | data/ 폴더의 쿠팡 상품 상세 JSON(200건)을 DB에 임포트할 수 있다 | detail_50(50건) + detail_150more(150건) = 200건 확인 |
| IMPT-04 | 쿠팡 타임스탬프(KST, timezone offset 없음)를 UTC로 정확하게 변환하여 저장할 수 있다 | parseKST() 헬퍼 패턴 확인 |
| IMPT-05 | 임포트 스크립트를 반복 실행해도 중복 없이 멱등하게 동작한다 | upsert + createMany skipDuplicates 패턴 |

</phase_requirements>

---

## Summary

이 Phase의 핵심은 두 가지다: (1) Prisma 스키마를 기존 단순 `Order` 모델에서 쿠팡 원본 구조에 맞는 `CoupangOrder/CoupangOrderItem/CoupangReturn/CoupangReturnItem` + Product 확장으로 재설계하고, (2) `data/` 폴더의 실 JSON 데이터를 멱등성을 보장하면서 DB에 임포트하는 것이다.

직접 코드 분석 결과, 기존 `Order` 모델에 의존하는 서비스는 4개 + 1개(총 5개)가 실제로 확인되었다: `dashboard.service.ts` (order.aggregate), `products.service.ts` (order.groupBy — 2곳: findAll과 classifyAbc), `inventory.service.ts` (order.groupBy — recalculate), `reviews.service.ts` (order.groupBy). 이 모든 코드를 스키마 변경과 동시에 수정해야 tsc 컴파일을 통과할 수 있다.

데이터 파일 구조에 대한 중요한 수정 사항이 있다: `coupang_orders_raw.json`은 CONTEXT.md(D-13)에 기록된 `{0:..., 1:...}` 객체 형태가 아니라 **정상적인 JSON Array** 형태다. `Object.values()` 변환이 불필요하다. 반품 `returnDeliveryId`는 19자리 숫자로 float64 MAX_SAFE_INTEGER를 초과하지만, 실제 파일에서는 이미 정밀도 손실이 발생한 채로 저장되어 있다(모든 값이 trailing 00/000 패턴). String 저장이 올바른 선택이다.

**Primary recommendation:** 스키마 변경 → `db:push` → `prisma generate` → 기존 5개 서비스 수정 → tsc --noEmit 통과 확인 → seed-coupang.ts 작성 → 데이터 임포트 → 검증 쿼리 실행의 순서로 진행한다.

---

## Project Constraints (from CLAUDE.md)

CLAUDE.md에서 추출한 Phase 1 관련 필수 지침:

| 지침 | 상세 |
|------|------|
| Native PG enum 금지 | `String` 필드 + app-level validation. `faultByType`, `receiptStatus` 등 모두 String |
| UUID PK 필수 | `@default(uuid()) @db.Uuid` — CoupangOrder, CoupangReturn 등 모두 적용 |
| camelCase 필드 → snake_case 컬럼 | `@map("snake_case")` 및 `@@map("snake_case")` |
| `@db.Timestamptz` | 모든 타임스탬프 컬럼에 적용 |
| 금액은 `Int` (KRW) | totalPrice, salesPrice, orderPrice 등 |
| prisma generate 필수 | 스키마 수정 후 반드시 `npm run db:push` + `npx prisma generate` |
| 도메인 모듈 자기 완결 | 새 CoupangOrder 도메인 추가 시 다른 도메인 Service 직접 import 금지 |
| API 경로에 /v1/ 금지 | `/api/orders`, `/api/returns` 직접 매핑 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^7.5.0 (설치됨) | ORM + 스키마 관리 | 이미 설치, 전체 DB 레이어 |
| TypeScript | ^5.0.0 (설치됨) | 타입 안전성 | 프로젝트 언어 |
| tsx | 설치됨 | seed-coupang.ts 실행 | 기존 seed.ts와 동일 패턴 |
| @prisma/adapter-pg | 설치됨 (seed.ts에서 사용) | Prisma v7 PG 어댑터 | 기존 seed.ts 패턴 그대로 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 (설치됨) | 날짜 포맷팅 | 필요 시 사용 가능 |
| date-fns-tz | 미설치 | KST→UTC 변환 | parseKST() 헬퍼로 직접 구현하면 불필요 |
| zod | 미설치 | JSON 필드 검증 | 선택적 — 단순 nullish coalescence로 대체 가능 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `new Date(str + "+09:00")` | date-fns-tz | 의존성 추가 없이 동일 효과. date-fns-tz 불필요. |
| String ID 저장 | BigInt Prisma 타입 | BigInt는 NestJS JSON 직렬화 실패. String이 유일한 안전한 선택. |
| upsert loop | createMany skipDuplicates | createMany가 빠르지만 upsert가 update도 지원. 주문 헤더는 upsert, 아이템은 delete+createMany. |

### Installation

새로 필요한 패키지 없음. 기존 의존성으로 충분:

```bash
# 설치 불필요 — 기존 패키지로 구현 가능
# date-fns-tz: parseKST() 헬퍼로 대체
# zod: nullish coalescence 패턴으로 대체
```

npm script 추가만 필요:

```json
"db:seed-coupang": "tsx prisma/seed-coupang.ts"
```

---

## Architecture Patterns

### Recommended Project Structure

```
prisma/
├── schema.prisma          — 스키마 재설계 (CoupangOrder, CoupangReturn, ProductItem 추가)
├── seed.ts                — 기존 (Order 생성 코드 → CoupangOrder로 교체)
└── seed-coupang.ts        — 신규 (JSON 임포트 전용)

apps/server/src/
├── dashboard/             — dashboard.service.ts 수정
├── inventory/             — inventory.service.ts 수정
├── products/              — products.service.ts 수정
├── reviews/               — reviews.service.ts 수정
├── orders/                — orders.service.ts 수정 (D-18: DB CRUD 메서드 추가)
└── returns/               — returns.service.ts 수정 (Return 모델 신규 + DB CRUD 추가)
```

### Pattern 1: CoupangOrder 스키마 설계

**What:** 기존 `Order` 모델을 `CoupangOrder`로 재명명하며 쿠팡 원본 shipmentBox 구조로 전면 재설계
**When to use:** D-01~D-07 결정에 따라

```prisma
model CoupangOrder {
  id            String   @id @default(uuid()) @db.Uuid
  companyId     String   @map("company_id") @db.Uuid

  // 쿠팡 원본 식별자 (String — D-07)
  shipmentBoxId String   @unique @map("shipment_box_id") @db.VarChar(30)
  orderId       String   @map("order_id") @db.VarChar(30)

  // 주문자 / 수취인 (D-02: JSON 타입으로 저장)
  orderer       Json?    // { name, email, safeNumber, ordererNumber }
  receiver      Json?    // { name, safeNumber, addr1, addr2, postCode }

  // 상태 / 배송
  status              String   @default("ACCEPT")
  deliveryCompanyName String?  @map("delivery_company_name")
  invoiceNumber       String?  @map("invoice_number")
  parcelPrintMessage  String?  @map("parcel_print_message")
  shippingPrice       Int      @default(0) @map("shipping_price")

  // 금액 요약
  totalPrice    Int      @default(0) @map("total_price")

  // D-08: KST parseKST() 헬퍼로 UTC 변환
  orderedAt     DateTime  @map("ordered_at") @db.Timestamptz
  paidAt        DateTime? @map("paid_at") @db.Timestamptz
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company       Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  orderItems    CoupangOrderItem[]

  @@index([companyId])
  @@index([status])
  @@index([orderedAt])
  @@map("coupang_orders")
}

model CoupangOrderItem {
  id            String   @id @default(uuid()) @db.Uuid
  orderId       String   @map("order_id") @db.Uuid    // FK → coupang_orders.id

  vendorItemId      String  @map("vendor_item_id") @db.VarChar(30)
  vendorItemName    String  @default("") @map("vendor_item_name")
  sellerProductId   String? @map("seller_product_id") @db.VarChar(30)
  sellerProductName String  @default("") @map("seller_product_name")

  shippingCount           Int @default(1) @map("shipping_count")
  salesPrice              Int @default(0) @map("sales_price")
  orderPrice              Int @default(0) @map("order_price")
  instantCouponDiscount   Int @default(0) @map("instant_coupon_discount")

  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz

  order         CoupangOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([sellerProductId])
  @@map("coupang_order_items")
}
```

### Pattern 2: CoupangReturn 스키마 설계

**What:** 신규 CoupangReturn + CoupangReturnItem 모델
**When to use:** D-04~D-06 결정에 따라

```prisma
model CoupangReturn {
  id            String   @id @default(uuid()) @db.Uuid
  companyId     String   @map("company_id") @db.Uuid

  receiptId     String   @unique @map("receipt_id") @db.VarChar(30)  // D-05
  orderId       String   @map("order_id") @db.VarChar(30)

  requesterName   String  @default("") @map("requester_name")
  receiptStatus   String  @default("UC") @map("receipt_status")   // D-07: String
  receiptType     String  @default("RETURN") @map("receipt_type")

  // D-06: 사유/귀책 1급 컬럼
  faultByType             String  @default("CUSTOMER") @map("fault_by_type")  // VENDOR|CUSTOMER
  cancelReason            String  @default("") @map("cancel_reason")
  cancelReasonCategory1   String? @map("cancel_reason_category1")
  cancelReasonCategory2   String? @map("cancel_reason_category2")
  reasonCode              String? @map("reason_code")
  reasonCodeText          String? @map("reason_code_text")

  returnDeliveryId        String? @map("return_delivery_id") @db.VarChar(30)  // D-07
  enclosePrice            Int?    @map("enclose_price")

  requestedAt   DateTime  @map("requested_at") @db.Timestamptz
  completedAt   DateTime? @map("completed_at") @db.Timestamptz
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company       Company            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  returnItems   CoupangReturnItem[]

  @@index([companyId])
  @@index([receiptStatus])
  @@index([faultByType])
  @@index([requestedAt])
  @@map("coupang_returns")
}

model CoupangReturnItem {
  id            String   @id @default(uuid()) @db.Uuid
  returnId      String   @map("return_id") @db.Uuid

  vendorItemId    String? @map("vendor_item_id") @db.VarChar(30)
  vendorItemName  String  @default("") @map("vendor_item_name")
  sellerProductId String? @map("seller_product_id") @db.VarChar(30)
  sellerProductName String @default("") @map("seller_product_name")
  purchaseCount   Int     @default(1) @map("purchase_count")
  cancelCount     Int     @default(1) @map("cancel_count")

  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz

  return        CoupangReturn @relation(fields: [returnId], references: [id], onDelete: Cascade)

  @@index([returnId])
  @@map("coupang_return_items")
}
```

### Pattern 3: Product 확장 + ProductItem 신규

**What:** D-09, D-10에 따른 Product 모델 필드 추가 및 ProductItem 신규 생성

```prisma
// Product 모델에 추가할 필드:
deliveryChargeType    String?  @map("delivery_charge_type")
freeShipOverAmount    Int?     @map("free_ship_over_amount")
returnCharge          Int?     @map("return_charge")
deliveryInfo          Json?    @map("delivery_info")  // D-09: 배송정책 전체 Json
images                Json?    @default("[]")          // D-09: 이미지 URL 배열

// Product 모델에 추가할 relation:
productItems          ProductItem[]

// 신규 모델 (D-10)
model ProductItem {
  id              String   @id @default(uuid()) @db.Uuid
  productId       String   @map("product_id") @db.Uuid

  vendorItemId    String?  @map("vendor_item_id") @db.VarChar(30)
  itemName        String   @default("") @map("item_name")
  originalPrice   Int      @default(0) @map("original_price")
  salePrice       Int      @default(0) @map("sale_price")
  supplyPrice     Int      @default(0) @map("supply_price")
  isActive        Boolean  @default(true) @map("is_active")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@map("product_items")
}
```

### Pattern 4: KST 타임스탬프 헬퍼 (D-08)

**What:** 쿠팡 naive datetime을 UTC로 변환
**When to use:** 모든 날짜 파싱에 적용

```typescript
// prisma/seed-coupang.ts 상단에 정의
function parseKST(naive: string | null | undefined): Date | null {
  if (!naive || naive === '') return null;
  return new Date(naive + '+09:00');  // KST = UTC+9
}

// 사용 예시
orderedAt: parseKST(box.orderedAt)!,
paidAt: parseKST(box.paidAt),
```

### Pattern 5: 멱등 임포트 (D-12)

**What:** upsert + deleteMany/createMany 조합으로 멱등성 보장

```typescript
// 주문 헤더: upsert (shipmentBoxId unique key)
const order = await prisma.coupangOrder.upsert({
  where: { shipmentBoxId: String(box.shipmentBoxId) },
  update: { status: box.status },
  create: { /* full fields */ },
});

// 주문 아이템: deleteMany + createMany (멱등)
await prisma.coupangOrderItem.deleteMany({ where: { orderId: order.id } });
await prisma.coupangOrderItem.createMany({
  data: (box.orderItems ?? []).map(item => ({
    orderId: order.id,
    vendorItemId: String(item.vendorItemId),
    // ...
  })),
});
```

### Pattern 6: 기존 서비스 수정 방향

**What:** 스키마 변경으로 깨지는 5개 서비스 수정 방향

| 파일 | 현재 코드 | 수정 방향 |
|------|-----------|-----------|
| `dashboard.service.ts:19` | `prisma.order.aggregate({ _sum: { totalPrice, quantity } })` | `prisma.coupangOrder.aggregate({ _sum: { totalPrice } })` — quantity 필드 없음 주의 |
| `products.service.ts:70` | `prisma.order.groupBy({ by: ['productId'] })` | 기존 Order 모델에 productId가 있었으므로 → CoupangOrderItem에 productId FK가 없어 `{ by: ['sellerProductId'] }` 또는 0으로 반환 처리 |
| `products.service.ts:172` | `prisma.order.groupBy({ by: ['productId'], _sum: { totalPrice } })` | 동일 — sellerProductId 기반 또는 0 반환 |
| `inventory.service.ts:14` | `prisma.order.groupBy({ by: ['productId'], _sum: { quantity } })` | CoupangOrderItem에 quantity 없음 → shippingCount 사용. productId 없음 → sellerProductId 매핑 |
| `reviews.service.ts:17` | `prisma.order.groupBy({ by: ['productId'] })` | 동일 패턴 |

**핵심 주의:** 기존 `Order` 모델은 `productId` FK(→ products.id UUID)를 직접 보유했지만, 새 `CoupangOrderItem`은 `sellerProductId`(쿠팡 ID, String)만 보유한다. Phase 1에서는 UUID 매핑 없이 count=0 반환 또는 sellerProductId 기반 집계로 처리하고, 실제 Product-Order 연결은 v1.x에서 처리한다.

### Anti-Patterns to Avoid

- **기존 seed.ts에 쿠팡 임포트 코드 병합:** seed.ts는 개발 초기화용, seed-coupang.ts는 실 데이터 적재용 — 목적이 다르다.
- **BigInt Prisma 타입 사용:** NestJS JSON 직렬화 시 `TypeError: Do not know how to serialize a BigInt` 런타임 에러. String 사용 필수.
- **CoupangOrderItem에 중첩 upsert:** Prisma createMany는 중첩 relations 미지원. 2단계 패턴 사용.
- **`--force-reset` 사용:** 전체 DB 리셋으로 Product/Company 데이터 손실. `db:push` 전 명시적 DELETE.
- **반품 집계를 프론트엔드에서 계산:** 서버에서 집계해야 한다 (Phase 3에서 구현).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KST→UTC 변환 | 복잡한 date 라이브러리 | `new Date(str + "+09:00")` | 2줄로 충분, 의존성 불필요 |
| 중복 임포트 방지 | 수동 SELECT-then-INSERT | Prisma `upsert` + `createMany({ skipDuplicates: true })` | 내장 atomic 연산 |
| 타입 안전 JSON 파싱 | 커스텀 파서 | TypeScript nullish coalescence (`??`) | 단순하고 충분 |
| DB 스키마 마이그레이션 | 수동 SQL ALTER | `npm run db:push` + `npx prisma generate` | Prisma 내장 |

**Key insight:** Phase 1은 새 라이브러리 없이 기존 Prisma + TypeScript 패턴만으로 구현 가능하다. 복잡성은 기술이 아닌 데이터 구조 매핑에 있다.

---

## Critical Data File Findings (직접 분석)

### 수정된 사실: coupang_orders_raw.json 파일 구조

**CONTEXT.md D-13에 `{0:..., 1:...}` 객체 형태라고 기록되어 있으나, 직접 확인 결과 정상적인 JSON Array다.**

```
파일: data/coupang_orders_raw.json
실제 구조: JSON Array ([ { shipmentBoxId: ..., ... }, ... ])
레코드 수: 298건
Object.values() 처리: 불필요
```

플래너는 seed-coupang.ts 구현 시 `Object.values()` 없이 직접 배열로 처리해야 한다.

### 데이터 파일 목록 및 크기

| 파일 | 구조 | 레코드 수 | 임포트 대상 |
|------|------|-----------|------------|
| `data/coupang_orders_raw.json` | Array | 298건 (shipmentBox) | CoupangOrder + CoupangOrderItem (총 381 items) |
| `data/coupang_returns_all.json` | Array | 20건 | CoupangReturn + CoupangReturnItem |
| `data/coupang_products_detail_50.json` | Array (code/message/data 래핑) | 50건 | Product 확장 + ProductItem |
| `data/coupang_products_detail_150more.json` | Array (code/message/data 래핑) | 150건 | Product 확장 + ProductItem |

**상품 상세 파일 접근 패턴:**
```typescript
// 두 파일 모두 { code, message, data: { sellerProductId, items: [], deliveryChargeType, ... } } 구조
const detail50 = JSON.parse(await readFile('data/coupang_products_detail_50.json', 'utf-8'));
const detail150 = JSON.parse(await readFile('data/coupang_products_detail_150more.json', 'utf-8'));
const allDetails = [...detail50, ...detail150];  // 200건

for (const record of allDetails) {
  const d = record.data;  // 실제 데이터는 .data 안에 있음
  // d.sellerProductId, d.items[], d.deliveryChargeType, d.returnCharge 등
}
```

### returnDeliveryId 정밀도 문제 정밀 분석

- 파일의 모든 20건 `returnDeliveryId`가 19자리 숫자
- 모두 BigInt MAX_SAFE_INTEGER(9007199254740991) 초과
- **이미 파일에서 정밀도 손실 발생** (모든 값 trailing 00/000/0000 패턴 — float64 반올림 흔적)
- 현재 JavaScript로 파싱해도 추가 정밀도 손실은 없음 (이미 손실된 값이 안정적)
- **결론:** String으로 저장하면 현재 파일의 값을 그대로 보존 가능. `String(returnDeliveryId)` 사용.

### 주문 데이터 특이사항

- shipmentBoxId: 최대 668,271,992,684,618 (15자리) — MAX_SAFE_INT 미만이지만 String 저장 (D-07)
- orderId: 15,100,179,293,100 (14자리) — MAX_SAFE_INT 미만이지만 String 저장 (D-07)
- orderer/receiver는 JSON 객체로 저장 (D-02)
- 상태 분포: FINAL_DELIVERY(243), DEPARTURE(37), INSTRUCT(10), ACCEPT(6), DELIVERING(2)

### 반품 데이터 특이사항

- faultByType 분포: VENDOR(18), CUSTOMER(2) — 중요 비즈니스 인사이트
- reasonCode 패턴: OOSSELLER, REORDER 등 영문 코드, reasonCodeText는 한글
- receiptStatus 값: "RETURNS_COMPLETED" (실 데이터에서 확인)
- cancelReasonCategory1 예시: "오류", cancelReasonCategory2: "재고연동오류"

---

## Common Pitfalls

### Pitfall 1: BigInt 직렬화 에러

**What goes wrong:** Prisma 스키마에서 `BigInt` 타입 선언 시 NestJS API 응답에서 `TypeError: Do not know how to serialize a BigInt`
**Why it happens:** Node.js JSON.stringify는 BigInt를 기본 지원하지 않음
**How to avoid:** 스키마에서 모든 쿠팡 ID를 `String @db.VarChar(30)` 선언, 임포트 시 `String(id)` 변환
**Warning signs:** API가 200 대신 500 반환, DB 쿼리는 성공

### Pitfall 2: 기존 서비스 컴파일 에러 연쇄 (5개 파일)

**What goes wrong:** `npx tsc --noEmit` 실행 시 Order 모델 의존 코드 에러
**Why it happens:** Prisma Client 타입이 바뀌면 모든 TypeScript 참조가 깨짐
**How to avoid:** 스키마 변경 → prisma generate → tsc --noEmit → 에러 목록 → 5개 파일 수정
**Warning signs:** `Property 'productId' does not exist on type 'Order'` 류 에러

**실제 확인된 5개 의존 위치:**
1. `dashboard.service.ts:19` — `prisma.order.aggregate({ _sum: { totalPrice, quantity } })`
2. `products.service.ts:70` — `prisma.order.groupBy({ by: ['productId'], _count })`
3. `products.service.ts:172` — `prisma.order.groupBy({ by: ['productId'], _sum: { totalPrice } })`
4. `inventory.service.ts:14` — `prisma.order.groupBy({ by: ['productId'], _sum: { quantity } })`
5. `reviews.service.ts:17` — `prisma.order.groupBy({ by: ['productId'], _count })`

### Pitfall 3: db:push 데이터 손실

**What goes wrong:** Order → CoupangOrder 재설계는 파괴적 변경으로 orders 테이블 DROP 위험
**Why it happens:** db:push가 호환되지 않는 변경 시 테이블을 재생성
**How to avoid:**
```bash
# 기존 orders 테이블 먼저 명시적 삭제
npx prisma db execute --stdin <<< "DELETE FROM orders;"
# 그 후 스키마 push
npm run db:push
```
**Warning signs:** `--force-reset` 금지, Product/Company 데이터 CASCADE 삭제 방지

### Pitfall 4: KST 타임스탬프 9시간 오차

**What goes wrong:** Docker 컨테이너(UTC 환경)에서 `new Date("2026-03-23T13:59:41")` 파싱 시 9시간 오차
**Why it happens:** 쿠팡 API는 KST naive datetime 반환, Docker는 UTC 환경
**How to avoid:** 모든 날짜 파싱에 `parseKST()` 헬퍼 사용
**Warning signs:** 주문 시간이 항상 9시간 빠르게 표시됨, Mac에서 테스트 통과해도 Docker에서 실패

### Pitfall 5: seed.ts 기존 Order 생성 코드

**What goes wrong:** `prisma/seed.ts`의 `prisma.order.create()` 루프(약 70-80건)가 스키마 변경 후 컴파일 에러
**Why it happens:** seed.ts에도 Order 모델 의존 코드가 있음
**How to avoid:** D-17에 따라 seed.ts의 Order 생성 코드를 CoupangOrder/CoupangOrderItem 구조로 교체
**Warning signs:** `npm run db:seed` 실행 시 TypeScript 컴파일 에러

### Pitfall 6: 상품 상세 파일의 중첩 구조

**What goes wrong:** `coupang_products_detail_50.json`의 실제 데이터가 `record.data` 안에 있음을 놓치고 `record.sellerProductId`로 접근
**Why it happens:** 쿠팡 API 응답 래핑 구조 (`{ code, message, data: { ... } }`)
**How to avoid:** 항상 `.data` 프로퍼티로 접근: `const d = record.data;`
**Warning signs:** sellerProductId가 undefined로 나오면 래핑 구조 접근 확인

---

## Code Examples

### seed-coupang.ts 권장 구조

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFile } from 'fs/promises';
import path from 'path';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseKST(naive: string | null | undefined): Date | null {
  if (!naive || naive === '') return null;
  return new Date(naive + '+09:00');
}

async function importOrders(companyId: string) {
  const filePath = path.join(process.cwd(), '..', '..', 'data', 'coupang_orders_raw.json');
  const raw = JSON.parse(await readFile(filePath, 'utf-8'));
  // raw는 Array — Object.values() 불필요 (직접 확인 완료)

  for (const box of raw) {
    const order = await prisma.coupangOrder.upsert({
      where: { shipmentBoxId: String(box.shipmentBoxId) },
      update: { status: box.status },
      create: {
        companyId,
        shipmentBoxId: String(box.shipmentBoxId),
        orderId: String(box.orderId),
        orderer: box.orderer ?? null,
        receiver: box.receiver ?? null,
        status: box.status ?? 'ACCEPT',
        deliveryCompanyName: box.deliveryCompanyName ?? null,
        invoiceNumber: box.invoiceNumber ?? null,
        parcelPrintMessage: box.parcelPrintMessage ?? null,
        shippingPrice: box.shippingPrice ?? 0,
        totalPrice: (box.orderItems ?? []).reduce((s: number, i: Record<string,number>) => s + (i.orderPrice ?? 0), 0),
        orderedAt: parseKST(box.orderedAt)!,
        paidAt: parseKST(box.paidAt),
      },
    });

    await prisma.coupangOrderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.coupangOrderItem.createMany({
      data: (box.orderItems ?? []).map((item: Record<string, unknown>) => ({
        orderId: order.id,
        vendorItemId: String(item.vendorItemId),
        vendorItemName: String(item.vendorItemName ?? ''),
        sellerProductId: item.sellerProductId ? String(item.sellerProductId) : null,
        sellerProductName: String(item.sellerProductName ?? ''),
        shippingCount: Number(item.shippingCount ?? 1),
        salesPrice: Number(item.salesPrice ?? 0),
        orderPrice: Number(item.orderPrice ?? 0),
        instantCouponDiscount: Number(item.instantCouponDiscount ?? 0),
      })),
    });
  }
  console.log(`Orders imported: ${raw.length}`);
}

async function importReturns(companyId: string) {
  const filePath = path.join(process.cwd(), '..', '..', 'data', 'coupang_returns_all.json');
  const raw = JSON.parse(await readFile(filePath, 'utf-8'));
  // raw는 Array (20건)

  for (const ret of raw) {
    const returnRecord = await prisma.coupangReturn.upsert({
      where: { receiptId: String(ret.receiptId) },
      update: { receiptStatus: ret.receiptStatus },
      create: {
        companyId,
        receiptId: String(ret.receiptId),
        orderId: String(ret.orderId),
        receiptStatus: ret.receiptStatus ?? 'RETURNS_COMPLETED',
        receiptType: ret.receiptType ?? 'RETURN',
        requesterName: ret.requesterName ?? '',
        faultByType: ret.faultByType ?? 'CUSTOMER',
        cancelReason: ret.cancelReason ?? '',
        cancelReasonCategory1: ret.cancelReasonCategory1 ?? null,
        cancelReasonCategory2: ret.cancelReasonCategory2 ?? null,
        reasonCode: ret.reasonCode ?? null,
        reasonCodeText: ret.reasonCodeText ?? null,
        returnDeliveryId: ret.returnDeliveryId ? String(ret.returnDeliveryId) : null,
        enclosePrice: ret.enclosePrice ?? null,
        requestedAt: parseKST(ret.createdAt)!,
        completedAt: parseKST(ret.completeConfirmDate),
      },
    });

    await prisma.coupangReturnItem.deleteMany({ where: { returnId: returnRecord.id } });
    if (ret.returnItems?.length) {
      await prisma.coupangReturnItem.createMany({
        data: ret.returnItems.map((item: Record<string, unknown>) => ({
          returnId: returnRecord.id,
          vendorItemId: item.vendorItemId ? String(item.vendorItemId) : null,
          vendorItemName: String(item.vendorItemName ?? ''),
          sellerProductId: item.sellerProductId ? String(item.sellerProductId) : null,
          sellerProductName: String(item.sellerProductName ?? ''),
          purchaseCount: Number(item.purchaseCount ?? 1),
          cancelCount: Number(item.cancelCount ?? 1),
        })),
      });
    }
  }
  console.log(`Returns imported: ${raw.length}`);
}

async function importProductDetails(companyId: string) {
  const [detail50, detail150] = await Promise.all([
    readFile(path.join(process.cwd(), '..', '..', 'data', 'coupang_products_detail_50.json'), 'utf-8'),
    readFile(path.join(process.cwd(), '..', '..', 'data', 'coupang_products_detail_150more.json'), 'utf-8'),
  ]);
  const allDetails = [
    ...JSON.parse(detail50),
    ...JSON.parse(detail150),
  ];

  for (const record of allDetails) {
    const d = record.data;  // 실제 데이터는 .data 안에 있음!
    if (!d?.sellerProductId) continue;

    // Product를 coupangProductId로 찾아서 업데이트
    const product = await prisma.product.findFirst({
      where: { coupangProductId: String(d.sellerProductId) },
    });
    if (!product) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        deliveryChargeType: d.deliveryChargeType ?? null,
        freeShipOverAmount: d.freeShipOverAmount ?? null,
        returnCharge: d.returnCharge ?? null,
        deliveryInfo: d,  // 전체 배송정책 Json으로 저장
        images: (d.items?.[0]?.images ?? []).map((img: Record<string,unknown>) => img.cdnPath),
      },
    });

    // ProductItems (옵션 단위)
    if (d.items?.length) {
      await prisma.productItem.deleteMany({ where: { productId: product.id } });
      await prisma.productItem.createMany({
        data: d.items.map((item: Record<string, unknown>) => ({
          productId: product.id,
          vendorItemId: item.vendorItemId ? String(item.vendorItemId) : null,
          itemName: String(item.itemName ?? ''),
          originalPrice: Number(item.originalPrice ?? 0),
          salePrice: Number(item.salePrice ?? 0),
          supplyPrice: Number(item.supplyPrice ?? 0),
        })),
      });
    }
  }
  console.log(`Product details imported: ${allDetails.length}`);
}
```

### Company 조회 (seed.ts 패턴 재사용)

```typescript
// seed-coupang.ts 시작부에서 geoyoung company ID 조회
const company = await prisma.company.findUniqueOrThrow({
  where: { slug: 'geoyoung' },
});
```

### data/ 파일 경로 (루트 상대 경로)

```typescript
// data/ 디렉토리는 프로젝트 루트에 있음
// seed-coupang.ts는 prisma/ 디렉토리에서 실행되므로 한 단계 위로 올라가야 함
const dataDir = path.join(process.cwd(), '..', 'data');
// 또는 절대 경로 기준:
// process.cwd()가 /workspace/kiditem/prisma 이면 '../data'
// process.cwd()가 /workspace/kiditem 이면 'data'
```

**주의:** `tsx prisma/seed-coupang.ts`를 루트에서 실행하면 `process.cwd()`는 루트다. 실행 위치에 따라 경로 조정 필요. seed.ts에서 `process.cwd()` + 'data'로 처리하거나 __dirname 기반으로 처리.

### 기존 서비스 수정 — dashboard.service.ts

```typescript
// 변경 전
const todayAgg = await this.prisma.order.aggregate({
  _sum: { totalPrice: true, quantity: true },
  _count: true,
  where: { orderedAt: { gte: todayStart } },
});

// 변경 후 (CoupangOrder — quantity 필드 없음)
const todayAgg = await this.prisma.coupangOrder.aggregate({
  _sum: { totalPrice: true },
  _count: true,
  where: { orderedAt: { gte: todayStart } },
});

// 응답 수정 (quantity 제거 또는 items 합산)
todayRevenue: todayAgg._sum.totalPrice ?? 0,
todayOrders: todayAgg._count,
```

### 기존 서비스 수정 — products.service.ts / reviews.service.ts / inventory.service.ts

```typescript
// Phase 1 임시 처리: productId 매핑이 없으므로 orderCount = 0 반환
// (실제 CoupangOrderItem → Product 매핑은 v1.x에서)
const orderCounts = new Map<string, number>();  // 빈 맵으로 대체

// inventory.service.ts도 동일:
// orderData groupBy productId → 데이터 없으므로 dailySalesAvg 계산 건너뜀
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Order 단일 모델 (flat) | CoupangOrder + CoupangOrderItem 2-tier | Phase 1 | 쿠팡 원본 구조와 1:1 매핑 |
| API passthrough | DB-native | Phase 1 | 오프라인 동작, 통계 집계 가능 |
| BigInt Prisma 타입 | String VarChar(30) | Phase 1 | NestJS 직렬화 안전 |

**Deprecated/outdated:**
- 기존 `Order` 모델: Phase 1에서 `CoupangOrder`로 대체됨
- `orders.service.ts` API passthrough 로직: DB CRUD로 교체 예정 (D-18)

---

## Open Questions

1. **data/ 경로 — seed-coupang.ts 실행 위치**
   - What we know: `tsx prisma/seed-coupang.ts`를 루트에서 실행 시 `process.cwd()` = 프로젝트 루트
   - What's unclear: 정확한 경로가 `path.join(process.cwd(), 'data', 'filename')` 인지 `path.join(process.cwd(), '..', 'data', 'filename')` 인지
   - Recommendation: seed.ts의 기존 패턴을 참조. seed.ts에 data 경로 사용 예가 없으므로, 플래너가 orders.service.ts에서 `path.join(process.cwd(), 'data', 'coupang_orders_raw.json')` 패턴을 이미 사용 중임을 확인 → 동일하게 `path.join(process.cwd(), 'data', filename)` 사용.

2. **seed.ts Order 생성 코드 교체 방향 (D-17)**
   - What we know: seed.ts에 `prisma.order.create()` 루프가 있음. CoupangOrder 구조로 교체 필요.
   - What's unclear: 새 CoupangOrder에 필요한 필드(shipmentBoxId unique)를 seed 데이터에서 어떻게 채울지 — 더미 ID 생성 필요
   - Recommendation: seed.ts의 Order 생성 섹션을 CoupangOrder upsert로 교체, shipmentBoxId는 임의 UUID 문자열로 생성 (`ORD-${Date.now()}-${i}` 등). 또는 seed.ts Order 섹션을 완전 제거하고 seed-coupang.ts만 사용.

3. **Product.coupangProductId 매핑**
   - What we know: 기존 `Product.coupangProductId` 필드가 있고, detail 파일의 `sellerProductId`가 이에 대응함.
   - What's unclear: 1131개 Product 중 200개 detail만 있음 — 대부분은 ProductItem/images 없이 남음
   - Recommendation: Phase 1에서는 `product.findFirst({ where: { coupangProductId: String(d.sellerProductId) } })`로 매칭. 매칭 실패 시 skip (에러 아닌 경고).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | seed-coupang.ts 실행 | ✓ | v25.8.1 | — |
| tsx | seed-coupang.ts 실행 | ✓ | 기존 설치 | — |
| PostgreSQL | Prisma DB | ✓ (Docker) | port 5433 | — |
| Prisma | ORM | ✓ | ^7.5.0 | — |
| data/ 디렉토리 | JSON 임포트 | ✓ | 루트에 존재 | — |

**Missing dependencies with no fallback:** 없음

**Missing dependencies with fallback:** 없음

---

## Validation Architecture

> `.planning/config.json` 없음 — nyquist_validation 기본값 enabled로 처리

### Test Framework

| Property | Value |
|----------|-------|
| Framework | 없음 (Phase 1은 DB/서버 측 작업, 자동화 테스트 프레임워크 없음) |
| Config file | 없음 |
| Quick run command | `npx tsc --noEmit` (컴파일 검사) |
| Full suite command | 성공 기준 쿼리 직접 실행 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHM-01 | CoupangOrder/CoupangOrderItem 테이블 존재 | smoke | `npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM coupang_orders;"` | ❌ Wave 0 |
| SCHM-02 | CoupangReturn/CoupangReturnItem 테이블 존재 | smoke | `npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM coupang_returns;"` | ❌ Wave 0 |
| SCHM-03 | product_items 테이블 존재 | smoke | `npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM product_items;"` | ❌ Wave 0 |
| SCHM-04 | shipmentBoxId가 String으로 저장됨 | smoke | `npx prisma db execute --stdin <<< "SELECT data_type FROM information_schema.columns WHERE table_name='coupang_orders' AND column_name='shipment_box_id';"` | ❌ Wave 0 |
| SCHM-05 | tsc 컴파일 통과 | unit | `npx tsc --noEmit` | ✅ (tsc 사용) |
| IMPT-01 | 주문 298건 임포트 | smoke | `npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM coupang_orders;"` (결과=298) | ❌ Wave 0 |
| IMPT-02 | 반품 20건 임포트 | smoke | `npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM coupang_returns;"` (결과=20) | ❌ Wave 0 |
| IMPT-03 | 상품 상세 최소 100건 ProductItem 생성 | smoke | `npx prisma db execute --stdin <<< "SELECT COUNT(DISTINCT product_id) FROM product_items;"` | ❌ Wave 0 |
| IMPT-04 | 주문 타임스탬프 UTC 정확성 | smoke | `npx prisma db execute --stdin <<< "SELECT ordered_at AT TIME ZONE 'Asia/Seoul' FROM coupang_orders LIMIT 1;"` (JSON의 시간과 일치) | ❌ Wave 0 |
| IMPT-05 | 멱등성 (2회 실행 후 count 동일) | manual | `npm run db:seed-coupang && npm run db:seed-coupang && npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM coupang_orders;"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** 전체 smoke 검증 쿼리 실행
- **Phase gate:** `npx tsc --noEmit` 에러 0개 + SELECT COUNT(*) = 298/20 + `curl http://localhost:4000/api/orders` 200 응답

### Wave 0 Gaps

- [ ] smoke test 명령어는 SQL 직접 실행 — 별도 테스트 파일 없이 bash 명령으로 충분
- [ ] `npx tsc --noEmit` — tsc 설치 확인 (`apps/server/tsconfig.json` 존재)
- [ ] Wave 0에서 테스트 프레임워크 설치 불필요 (SQL + tsc로 충분)

---

## Sources

### Primary (HIGH confidence — 직접 분석)

- `data/coupang_orders_raw.json` — 298건 Array 확인, shipmentBoxId 15자리, orderItems 381개 total
- `data/coupang_returns_all.json` — 20건 Array, faultByType VENDOR 18/CUSTOMER 2, returnDeliveryId 19자리
- `data/coupang_products_detail_50.json`, `coupang_products_detail_150more.json` — code/message/data 래핑 구조, 총 200건
- `prisma/schema.prisma` — 현재 Order 모델, Product 모델, Company/User 관계
- `apps/server/src/dashboard/dashboard.service.ts` — order.aggregate 의존 위치 확인
- `apps/server/src/products/products.service.ts` — order.groupBy 2곳 의존 위치 확인
- `apps/server/src/inventory/inventory.service.ts` — order.groupBy 의존 위치 확인
- `apps/server/src/reviews/reviews.service.ts` — order.groupBy 의존 위치 확인
- `apps/server/src/orders/orders.service.ts` — API passthrough 구조 확인
- `apps/server/src/returns/returns.service.ts` — API passthrough 구조 확인
- `prisma/seed.ts` — seed 패턴, Order 생성 코드, PrismaPg adapter 사용법
- `prisma/config.ts` — Prisma v7 설정 방식
- `package.json` (root) — 스크립트, 워크스페이스 구조
- Node.js 직접 실행 — returnDeliveryId 정밀도 손실 확인

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` — 스키마 설계 패턴
- `.planning/research/PITFALLS.md` — 6개 Critical Pitfall
- `.planning/phases/01-foundation/01-CONTEXT.md` — 유저 결정사항

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 기존 설치된 패키지 직접 확인, 추가 설치 불필요
- Architecture: HIGH — 실제 데이터 파일 구조 직접 분석 완료
- Pitfalls: HIGH — 실제 코드 의존 위치 5개 특정, 데이터 파일 직접 검사

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (데이터 파일/스키마 변경 없으면 안정적)

---

## Critical Corrections to Prior Research

이전 연구 문서(ARCHITECTURE.md, PITFALLS.md, CONTEXT.md D-13, STATE.md)에 기록된 사항 중 직접 검증으로 수정된 내용:

| 항목 | 이전 기록 | 실제 확인 결과 |
|------|-----------|---------------|
| coupang_orders_raw.json 구조 | `{0:..., 1:...}` 객체 형태 → Object.values() 필요 | **정상 JSON Array** — Object.values() 불필요 |
| Order 의존 서비스 | 4개 (dashboard, inventory, products, reviews) | **5개 위치** (products에 2곳: findAll과 classifyAbc) |
| returnDeliveryId 정밀도 손실 | "19자리로 JavaScript 파싱 시 정밀도 손실" | **파일에서 이미 손실** (trailing zeros 패턴) — 추가 손실 없음, String 저장은 여전히 필수 |
| data/ 경로 | 미기록 | **프로젝트 루트**에 위치, `path.join(process.cwd(), 'data', filename)` 패턴 |
| 상품 상세 파일 | coupang_products.json으로 기술 | **실제 파일**: detail_50.json(50건) + detail_150more.json(150건) = 200건 |
