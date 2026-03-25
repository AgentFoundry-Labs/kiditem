# Architecture Patterns

**Domain:** 쿠팡 운영 데이터 통합 — 기존 NestJS/Next.js 모노레포에 주문·반품·상품 상세 도메인 추가
**Researched:** 2026-03-25
**Confidence:** HIGH (기존 코드베이스 직접 분석 + Coupang Open API 공식 문서 구조 교차 검증)

---

## 현재 상태 요약 (기존 코드베이스 분석)

현재 `orders` / `returns` 도메인은 NestJS 모듈로 존재하나, **Prisma DB를 전혀 사용하지 않는다.** 두 서비스 모두 쿠팡 WING API에 직접 호출하고 API 실패 시 `data/` 폴더의 JSON 파일을 fallback으로 읽는 구조다. Prisma `Order` 모델은 1행 1주문(단순) 구조이며 쿠팡 원본의 `shipmentBox → orderItems` 계층을 반영하지 않는다.

이번 마일스톤의 핵심 작업은 이 "API passthrough" 구조를 "DB-native" 구조로 교체하는 것이다.

---

## 통합 아키텍처 개요

```
[Next.js] /orders, /returns, /products/[id]
    │ fetch (camelCase JSON)
    ▼
[NestJS] OrdersModule / ReturnsModule / ProductsModule
    │ PrismaService (shared global)
    ▼
[PostgreSQL]
    ├── orders (shipment box 단위)
    ├── order_items (주문 품목)
    ├── returns (반품 요청)
    ├── return_items (반품 품목)
    ├── categories
    ├── product_options
    └── product_images

[Import Script]
    data/coupang_orders_raw.json
    data/coupang_returns_all.json
    data/coupang_products.json (상품 목록)
        │ tsx prisma/seed-coupang.ts
        ▼
    [PostgreSQL] (위 테이블들에 INSERT)
```

---

## Prisma 스키마 재설계

### 변경 대상 모델

| 모델 | 변경 유형 | 이유 |
|------|-----------|------|
| `Order` | **전면 재설계** | 쿠팡 원본은 shipmentBox 단위. 현재 모델은 단순 1행. |
| `Return` | **신규 추가** | 현재 DB에 없음. |
| `ReturnItem` | **신규 추가** | 반품 품목 단위 데이터 필요. |
| `Category` | **신규 추가** | 상품 카테고리 속성 관리. |
| `ProductOption` | **신규 추가** | 쿠팡 vendorItem 단위 옵션. |
| `ProductImage` | **신규 추가** | 상품 이미지 (다중). |
| `Product` | **필드 추가** | deliveryChargeType, outboundShippingTimeDay, 등. |

현재 `Order` 모델에 의존하는 `ProductsService`의 `orderCounts` groupBy 쿼리가 있으나 — 이는 `OrderItem`으로 집계 방식을 바꿔야 한다 (아래 통합 포인트 참조).

---

### 권장 Prisma 스키마 (신규/변경 모델만)

```prisma
// ─── Orders (전면 재설계) ─────────────────────────────────────────────────────
// 쿠팡 API: shipmentBox 단위. 1 shipmentBox = 1 배송 박스 = 여러 orderItems.
// orderId 하나에 여러 shipmentBox가 붙을 수 있다 (분리배송).

model Order {
  id              String   @id @default(uuid()) @db.Uuid
  companyId       String   @map("company_id") @db.Uuid

  // 쿠팡 원본 식별자
  shipmentBoxId   BigInt   @unique @map("shipment_box_id")   // 쿠팡 shipmentBoxId (기본 조회 단위)
  orderId         BigInt   @map("order_id")                  // 쿠팡 orderId (묶음 주문 그룹)

  // 주문자 / 수취인
  ordererName     String   @default("") @map("orderer_name")
  receiverName    String   @default("") @map("receiver_name")
  receiverAddr1   String   @default("") @map("receiver_addr1")
  receiverAddr2   String   @default("") @map("receiver_addr2")
  receiverPostCode String  @default("") @map("receiver_post_code")
  receiverSafeNumber String? @map("receiver_safe_number")    // 안심번호

  // 상태 / 배송
  status          String   @default("ACCEPT")                // ACCEPT|INSTRUCT|DEPARTURE|DELIVERING|FINAL_DELIVERY
  deliveryCompanyCode String? @map("delivery_company_code")
  deliveryCompanyName String? @map("delivery_company_name")
  invoiceNumber   String?  @map("invoice_number")
  parcelPrintMessage String? @map("parcel_print_message")    // 배송 메모

  // 금액 요약 (편의 집계 — order_items 합산값)
  totalPrice      Int      @default(0) @map("total_price")    // KRW

  orderedAt       DateTime @map("ordered_at") @db.Timestamptz
  paidAt          DateTime? @map("paid_at") @db.Timestamptz
  shippedAt       DateTime? @map("shipped_at") @db.Timestamptz
  deliveredAt     DateTime? @map("delivered_at") @db.Timestamptz
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  orderItems      OrderItem[]

  @@index([companyId])
  @@index([orderId])
  @@index([status])
  @@index([orderedAt])
  @@map("orders")
}

// ─── OrderItems ───────────────────────────────────────────────────────────────
// 쿠팡 orderItems 배열 각 항목. vendorItem 단위.

model OrderItem {
  id              String   @id @default(uuid()) @db.Uuid
  orderId         String   @map("order_id") @db.Uuid          // FK → orders.id (UUID)
  productId       String?  @map("product_id") @db.Uuid        // FK → products.id (nullable — 매칭 실패 허용)

  // 쿠팡 원본 식별자
  vendorItemId        BigInt  @map("vendor_item_id")
  vendorItemName      String  @default("") @map("vendor_item_name")
  sellerProductId     BigInt? @map("seller_product_id")
  sellerProductName   String  @default("") @map("seller_product_name")
  vendorItemPackageId BigInt? @map("vendor_item_package_id")
  vendorItemPackageName String? @map("vendor_item_package_name")

  // 수량 / 금액
  shippingCount   Int      @default(1) @map("shipping_count")
  salesPrice      Int      @default(0) @map("sales_price")    // 개당 판매가 KRW
  orderPrice      Int      @default(0) @map("order_price")    // 결제금액 (할인 적용 후) KRW
  instantCouponDiscount Int @default(0) @map("instant_coupon_discount")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  order           Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product         Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([orderId])
  @@index([productId])
  @@index([vendorItemId])
  @@map("order_items")
}

// ─── Returns ──────────────────────────────────────────────────────────────────
// 쿠팡 returnRequests. receiptId 단위.

model Return {
  id              String   @id @default(uuid()) @db.Uuid
  companyId       String   @map("company_id") @db.Uuid

  // 쿠팡 원본 식별자
  receiptId       BigInt   @unique @map("receipt_id")
  orderId         BigInt   @map("order_id")                   // 쿠팡 orderId (참조용)

  // 요청자
  requesterName   String   @default("") @map("requester_name")

  // 사유 / 책임 구분
  cancelReason    String   @default("") @map("cancel_reason")
  cancelReasonCategory1 String? @map("cancel_reason_category1")  // 대분류
  cancelReasonCategory2 String? @map("cancel_reason_category2")  // 소분류
  faultByType     String   @default("CUSTOMER") @map("fault_by_type")  // CUSTOMER|SELLER

  // 상태
  receiptStatus   String   @default("UC") @map("receipt_status")  // UC|RC|CC
  // UC = 미확인(Unchecked), RC = 수거완료(Return Completed), CC = 완료(Closed)

  // 환불
  enclosePrice    Int?     @map("enclose_price")             // 환불 금액 KRW
  refundStatus    String?  @map("refund_status")

  requestedAt     DateTime @map("requested_at") @db.Timestamptz
  completedAt     DateTime? @map("completed_at") @db.Timestamptz
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company         Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  returnItems     ReturnItem[]

  @@index([companyId])
  @@index([orderId])
  @@index([receiptStatus])
  @@index([faultByType])
  @@index([requestedAt])
  @@map("returns")
}

// ─── ReturnItems ──────────────────────────────────────────────────────────────

model ReturnItem {
  id              String   @id @default(uuid()) @db.Uuid
  returnId        String   @map("return_id") @db.Uuid
  productId       String?  @map("product_id") @db.Uuid

  vendorItemId    BigInt?  @map("vendor_item_id")
  vendorItemName  String   @default("") @map("vendor_item_name")
  quantity        Int      @default(1)
  returnPrice     Int      @default(0) @map("return_price")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  return          Return   @relation(fields: [returnId], references: [id], onDelete: Cascade)
  product         Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([returnId])
  @@index([productId])
  @@map("return_items")
}

// ─── Categories ───────────────────────────────────────────────────────────────
// 쿠팡 카테고리 코드 + 속성(attributes) 정의.

model Category {
  id              String   @id @default(uuid()) @db.Uuid
  coupangCode     String   @unique @map("coupang_code")       // 쿠팡 카테고리 코드 (숫자 문자열)
  name            String
  displayName     String   @default("") @map("display_name")
  parentCode      String?  @map("parent_code")                // 부모 카테고리 코드
  depth           Int      @default(1)
  attributeSchema Json?    @map("attribute_schema")           // [{name, required, values: []}]

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  products        Product[]

  @@index([parentCode])
  @@map("categories")
}

// ─── ProductOptions ───────────────────────────────────────────────────────────
// 쿠팡 vendorItem 단위 옵션 (색상, 사이즈 등).

model ProductOption {
  id              String   @id @default(uuid()) @db.Uuid
  productId       String   @map("product_id") @db.Uuid

  vendorItemId    BigInt?  @unique @map("vendor_item_id")     // 쿠팡 vendorItemId
  optionName      String   @default("") @map("option_name")   // 옵션명 (예: "색상/사이즈")
  optionValue     String   @default("") @map("option_value")  // 옵션값 (예: "블루/M")
  price           Int      @default(0)
  stock           Int      @default(0)
  isActive        Boolean  @default(true) @map("is_active")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@map("product_options")
}

// ─── ProductImages ────────────────────────────────────────────────────────────

model ProductImage {
  id              String   @id @default(uuid()) @db.Uuid
  productId       String   @map("product_id") @db.Uuid

  imageUrl        String   @map("image_url")
  imageType       String   @default("MAIN") @map("image_type")   // MAIN|DETAIL|ADDITIONAL
  sortOrder       Int      @default(0) @map("sort_order")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@map("product_images")
}
```

### Product 모델 추가 필드 (기존 모델 확장)

기존 `Product` 모델에 아래 필드를 추가한다. 배송정책, 카테고리 FK, relation 추가.

```prisma
// Product 모델에 추가할 필드
categoryId              String?  @map("category_id") @db.Uuid
deliveryChargeType      String?  @map("delivery_charge_type")   // FREE|CHARGE 등
outboundShippingTimeDay Int?     @map("outbound_shipping_time_day")
returnShippingCharge    Int?     @map("return_shipping_charge")
pccNeeded               Boolean  @default(false) @map("pcc_needed")

// Product 모델에 추가할 relations
category        Category?       @relation(fields: [categoryId], references: [id])
options         ProductOption[]
images          ProductImage[]
orderItems      OrderItem[]
returnItems     ReturnItem[]
```

---

## 컴포넌트 경계

| 컴포넌트 | 책임 | 통신 방향 |
|----------|------|-----------|
| `prisma/schema.prisma` | 전체 DB 스키마 source of truth | — |
| `prisma/seed-coupang.ts` | JSON → DB INSERT (일회성 임포트) | reads `data/`, writes DB |
| `apps/server/src/orders/` | Order + OrderItem CRUD API | reads DB via PrismaService |
| `apps/server/src/returns/` | Return + ReturnItem CRUD API | reads DB via PrismaService |
| `apps/server/src/products/` | Product + options/images/category | reads DB via PrismaService |
| `apps/web/src/app/orders/` | 주문 대시보드 (목록 + 상세) | fetches `/api/orders` |
| `apps/web/src/app/returns/` | 반품 대시보드 (목록 + 통계) | fetches `/api/returns` |
| `apps/web/src/app/products/[id]/` | 상품 상세 강화 | fetches `/api/products/:id` |

---

## 데이터 플로우

### JSON 임포트 플로우

```
data/coupang_orders_raw.json
    │ tsx prisma/seed-coupang.ts
    ├─→ orders 테이블 (shipmentBox 단위 upsert, shipment_box_id unique)
    └─→ order_items 테이블 (각 orderItems 배열 항목)

data/coupang_returns_all.json
    │ tsx prisma/seed-coupang.ts
    ├─→ returns 테이블 (receiptId unique upsert)
    └─→ return_items 테이블

data/coupang_products.json (또는 기존 products API dump)
    │ tsx prisma/seed-coupang.ts
    ├─→ categories 테이블 (upsert by coupang_code)
    ├─→ products 테이블 (upsert by coupang_product_id)
    ├─→ product_options 테이블
    └─→ product_images 테이블
```

### 런타임 API 플로우

```
GET /api/orders?status=ACCEPT&from=...&to=...
    OrdersService.findAll()
        prisma.order.findMany({
          where: { status, orderedAt: { gte, lte } },
          include: { orderItems: true }
        })
    → { orders: [...], count }

GET /api/orders/:id
    OrdersService.findOne(id)
        prisma.order.findUnique({
          where: { id },
          include: { orderItems: { include: { product: true } } }
        })
    → { order: { ...shipmentBox, orderItems: [...] } }

GET /api/returns?status=UC
    ReturnsService.findAll()
        prisma.return.findMany({
          where: { receiptStatus },
          include: { returnItems: true }
        })
    → { data: [...], count, stats: { byFaultType, byReason } }

GET /api/products/:id
    ProductsService.findOne(id)
        prisma.product.findUnique({
          include: { options: true, images: true, category: true, ... }
        })
    → { product: { ...existing fields, options, images, category } }
```

---

## 통합 포인트 (기존 코드 변경)

### 변경이 필요한 기존 파일

| 파일 | 변경 내용 | 영향도 |
|------|-----------|--------|
| `prisma/schema.prisma` | Order 재설계 + 신규 모델 6개 추가 + Product 필드/relation 추가 | 전체 재생성 필요 |
| `apps/server/src/orders/orders.service.ts` | API passthrough → Prisma DB 쿼리로 교체 | 전면 재작성 |
| `apps/server/src/orders/orders.controller.ts` | `GET /:id` 라우트 추가 | 소규모 변경 |
| `apps/server/src/returns/returns.service.ts` | API passthrough → Prisma DB 쿼리로 교체 | 전면 재작성 |
| `apps/server/src/products/products.service.ts` | `orderCounts` groupBy → `orderItem` 기반으로 변경. `findOne` 확장 | 중간 변경 |
| `apps/web/src/app/orders/page.tsx` | DB 기반 API 응답 구조 맞게 타입 수정 | 소규모 변경 |
| `apps/web/src/app/returns/page.tsx` | DB 기반 API 응답 구조 맞게 타입 수정 | 소규모 변경 |

### 신규 파일

| 파일 | 용도 |
|------|------|
| `prisma/seed-coupang.ts` | JSON → DB 임포트 스크립트 (기존 seed.ts와 분리) |
| `apps/web/src/app/orders/[id]/page.tsx` | 주문 상세 페이지 (주문자/수취인/아이템 상세) |

---

## JSON 임포트 스크립트 구조

`prisma/seed-coupang.ts` — 기존 `seed.ts`와 별도 파일. `npm run db:seed-coupang` 명령으로 실행.

```typescript
// 권장 구조
async function importOrders(prisma: PrismaClient, companyId: string) {
  const raw = JSON.parse(await readFile('data/coupang_orders_raw.json', 'utf-8'));
  // raw는 쿠팡 API 응답 배열: Array<{ shipmentBoxId, orderId, orderedAt, orderer, receiver, orderItems, status, ... }>

  for (const box of raw) {
    // 1. Order upsert (shipment_box_id unique)
    const order = await prisma.order.upsert({
      where: { shipmentBoxId: BigInt(box.shipmentBoxId) },
      update: { status: box.status },
      create: {
        companyId,
        shipmentBoxId: BigInt(box.shipmentBoxId),
        orderId: BigInt(box.orderId),
        ordererName: box.orderer?.name ?? '',
        receiverName: box.receiver?.name ?? '',
        receiverAddr1: box.receiver?.addr1 ?? '',
        receiverAddr2: box.receiver?.addr2 ?? '',
        receiverPostCode: box.receiver?.postCode ?? '',
        receiverSafeNumber: box.receiver?.safeNumber,
        status: box.status,
        totalPrice: (box.orderItems ?? []).reduce((s, i) => s + (i.orderPrice ?? 0), 0),
        orderedAt: new Date(box.orderedAt),
        paidAt: box.paidAt ? new Date(box.paidAt) : null,
        parcelPrintMessage: box.parcelPrintMessage,
      },
    });

    // 2. OrderItems (deleteMany + createMany — 단순하게)
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.createMany({
      data: (box.orderItems ?? []).map((item) => ({
        orderId: order.id,
        vendorItemId: BigInt(item.vendorItemId),
        vendorItemName: item.vendorItemName ?? '',
        sellerProductId: item.sellerProductId ? BigInt(item.sellerProductId) : null,
        sellerProductName: item.sellerProductName ?? '',
        shippingCount: item.shippingCount ?? 1,
        salesPrice: item.salesPrice ?? 0,
        orderPrice: item.orderPrice ?? 0,
        instantCouponDiscount: item.instantCouponDiscount ?? 0,
      })),
    });
  }
}

async function importReturns(prisma: PrismaClient, companyId: string) {
  const raw = JSON.parse(await readFile('data/coupang_returns_all.json', 'utf-8'));
  // raw: Array<{ receiptId, orderId, receiptStatus, requesterName, cancelReason, faultByType, ... }>

  for (const ret of raw) {
    await prisma.return.upsert({
      where: { receiptId: BigInt(ret.receiptId) },
      update: { receiptStatus: ret.receiptStatus },
      create: {
        companyId,
        receiptId: BigInt(ret.receiptId),
        orderId: BigInt(ret.orderId),
        requesterName: ret.requesterName ?? '',
        cancelReason: ret.cancelReason ?? '',
        cancelReasonCategory1: ret.cancelReasonCategory1,
        cancelReasonCategory2: ret.cancelReasonCategory2,
        faultByType: ret.faultByType ?? 'CUSTOMER',
        receiptStatus: ret.receiptStatus ?? 'UC',
        enclosePrice: ret.enclosePrice ?? null,
        requestedAt: new Date(ret.createdAt),
      },
    });
  }
}
```

**핵심 패턴:**
- `upsert`를 쿠팡 원본 ID(`shipmentBoxId`, `receiptId`)의 unique 제약으로 수행 — 중복 임포트 안전
- `BigInt()` 래핑 필수 — 쿠팡 ID는 JavaScript `number`를 초과하는 경우 있음
- `data/` 파일이 없으면 콘솔 경고 후 건너뜀 — 스크립트가 파일 부재로 실패하지 않도록
- Company는 `slug: 'geoyoung'`로 조회 (seed.ts에서 이미 생성)

---

## 빌드 순서 (Phase 의존성)

```
Phase 1: 스키마 재설계
  prisma/schema.prisma 수정
    → npm run db:push
    → npx prisma generate
  [의존: 없음. 가장 먼저]

Phase 2: JSON 임포트 스크립트
  prisma/seed-coupang.ts 작성
    → tsx prisma/seed-coupang.ts
  [의존: Phase 1 완료 후. data/ 파일 존재 전제]

Phase 3: NestJS 백엔드 재작성
  orders.service.ts: DB 쿼리로 교체
  returns.service.ts: DB 쿼리로 교체
  products.service.ts: findOne 확장, orderCounts 수정
  [의존: Phase 1 완료. Phase 2 없어도 빈 DB로 테스트 가능]

Phase 4: 프론트엔드 대시보드
  /orders/page.tsx: 새 응답 구조 맞게 타입 수정
  /orders/[id]/page.tsx: 신규 상세 페이지
  /returns/page.tsx: DB 응답 기반 타입 수정, 통계 카드 추가
  /products/[id]/page.tsx: options/images/category 섹션 추가
  [의존: Phase 3 완료]
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: API Passthrough 유지
**What:** 기존처럼 쿠팡 API를 직접 호출하고 JSON 파일을 fallback으로 유지
**Why bad:** API 키 없음. 모든 조회가 `offline: true` 상태. 데이터가 DB에 없어 다른 기능(워크플로우, ActivityEvent)과 연동 불가.
**Instead:** DB에 한 번 임포트하고 이후는 DB에서만 읽는다.

### Anti-Pattern 2: Order 모델에 product FK 직접 연결
**What:** `OrderItem.productId`를 None-nullable로 설계하고 임포트 시 무조건 매칭
**Why bad:** 쿠팡 vendorItemId와 내부 Product UUID 매핑이 항상 1:1이 아님. 매칭 실패 시 임포트 중단.
**Instead:** `productId String? @db.Uuid` — nullable. 임포트 후 별도 매칭 작업 가능.

### Anti-Pattern 3: Int로 쿠팡 ID 저장
**What:** `shipmentBoxId Int` / `orderId Int`
**Why bad:** 쿠팡 ID는 실제로 수십억 단위. JavaScript Number 및 32-bit Int 초과.
**Instead:** `BigInt` 타입 사용. Prisma는 `@db.BigInt` 없이도 `BigInt` 필드를 bigint로 저장.

### Anti-Pattern 4: 기존 seed.ts에 쿠팡 임포트 로직 추가
**What:** 기존 `prisma/seed.ts`에 JSON 임포트 코드를 합침
**Why bad:** seed.ts는 개발 초기화용. 쿠팡 임포트는 실 데이터 적재용. 목적이 다름.
**Instead:** `prisma/seed-coupang.ts` 별도 파일 + `package.json`에 `db:seed-coupang` 스크립트 추가.

### Anti-Pattern 5: 반품 통계를 프론트에서 계산
**What:** 프론트에서 `returns` 배열을 받아서 faultByType 집계
**Why bad:** 데이터 증가 시 대용량 배열 전송. 응답 크기 낭비.
**Instead:** `ReturnsService`가 집계 결과를 응답에 포함 (Prisma groupBy 사용).

---

## 확장성 고려

| 관심사 | 현재 규모 (20건 반품 / 298건 주문) | 향후 (API 실시간 연동 시) |
|--------|-----------------------------------|--------------------------|
| 쿠팡 ID 타입 | BigInt (미리 올바르게) | 변경 없음 |
| 임포트 방식 | 정적 JSON 파일 | API polling → DB upsert 동일 패턴 |
| 쿼리 성능 | 인덱스로 충분 | orderedAt + status 복합 인덱스 추가 검토 |
| Product 매핑 | nullable productId | vendorItemId → productId 매칭 서비스 추가 |

---

## Sources

- 기존 코드베이스 직접 분석 (`prisma/schema.prisma`, `orders/orders.service.ts`, `returns/returns.service.ts`)
- 기존 프론트엔드 코드 분석 (`OrderSheet` 인터페이스 in `orders/page.tsx`) — 쿠팡 API 응답 필드 역추적
- [Coupang Open API — PO list query](https://developers.coupangcorp.com/hc/en-us/articles/360033919573-PO-list-query-paging-by-day) (Confidence: MEDIUM — 403 blocked, 필드명은 기존 코드에서 교차 검증)
- [Coupang Open API — Return/Cancellation Request List Query](https://developers.coupangcorp.com/hc/en-us/articles/360033919613-Return-Cancellation-Request-List-Query) (Confidence: MEDIUM — 403 blocked, faultByType 필드명은 검색 결과에서 확인)
- [Coupang Open API — Query one return request](https://developers.coupangcorp.com/hc/en-us/articles/360034562353-Query-one-return-request)
