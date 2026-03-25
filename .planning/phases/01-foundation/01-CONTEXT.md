# Phase 1: Foundation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

DB 스키마를 쿠팡 원본 데이터 구조에 맞게 재설계하고, `data/` JSON 파일을 DB에 임포트한다. 기존 Order 의존 서비스들이 스키마 변경 후에도 정상 동작하도록 수정한다.

Requirements: SCHM-01~05, IMPT-01~05

</domain>

<decisions>
## Implementation Decisions

### 주문 모델 구조
- **D-01:** 기존 `Order` 모델을 삭제하고 새로운 2-tier 구조로 재설계: `CoupangOrder` (배송박스 단위) + `CoupangOrderItem` (아이템 단위)
- **D-02:** 쿠팡 원본 필드명 최대한 유지 (orderer, receiver는 JSON 타입으로 저장, orderItems는 별도 테이블)
- **D-03:** `shipmentBoxId`를 CoupangOrder의 unique key로 사용 (upsert 기준)

### 반품 모델 구조
- **D-04:** `CoupangReturn` + `CoupangReturnItem` 2-tier 구조로 신규 생성
- **D-05:** `receiptId`를 CoupangReturn의 unique key로 사용 (upsert 기준)
- **D-06:** `faultByType` (VENDOR/CUSTOMER), `reasonCode`, `reasonCodeText` 등 사유/귀책 필드를 1급 컬럼으로 저장

### 쿠팡 ID 저장 타입
- **D-07:** 쿠팡 대형 ID (shipmentBoxId, orderId, vendorItemId, returnDeliveryId 등 19자리)는 `String` 타입으로 저장. BigInt 직렬화 에러(`TypeError: Do not know how to serialize a BigInt`) 예방. Prisma에서 `@db.VarChar(30)` 사용.

### 타임스탬프 처리
- **D-08:** 쿠팡 타임스탬프("2026-03-23T13:59:41", timezone offset 없음)는 KST로 간주하고 `+09:00` 붙여 UTC 변환 후 `@db.Timestamptz`로 저장. 헬퍼 함수 `parseKST(str)` 구현.

### 상품 상세 확장
- **D-09:** Product 모델에 `deliveryInfo` (Json), `items` (별도 `ProductItem` 테이블), `images` (Json 배열) 추가
- **D-10:** `ProductItem`은 옵션 단위 (itemName, salePrice, originalPrice, vendorItemId 등). Product:ProductItem = 1:N

### 시드 스크립트
- **D-11:** 기존 `prisma/seed.ts`와 별도로 `prisma/seed-coupang.ts` 생성. 쿠팡 JSON 데이터 임포트 전용.
- **D-12:** `upsert` 패턴으로 멱등성 보장. 쿠팡 원본 ID(shipmentBoxId, receiptId, sellerProductId)를 unique 키로 사용.
- **D-13:** `coupang_orders_raw.json`은 배열이 아닌 객체(`{0:..., 1:...}`) 형태 → `Object.values()` 처리 필수.
- **D-14:** npm script `db:seed-coupang` 추가 (`tsx prisma/seed-coupang.ts`)

### 기존 서비스 호환성
- **D-15:** `dashboard.service.ts`의 `prisma.order.aggregate()` → `prisma.coupangOrder` 기반으로 리팩토링
- **D-16:** `products.service.ts`와 `reviews.service.ts`의 `prisma.order.groupBy()` → `prisma.coupangOrderItem.groupBy()` (productId 기준)
- **D-17:** `prisma/seed.ts` 기존 Order 생성 코드 → CoupangOrder/CoupangOrderItem 구조로 변경
- **D-18:** 기존 orders.service.ts의 쿠팡 API 호출 로직은 유지하되, DB CRUD 메서드 추가

### Claude's Discretion
- Prisma 모델 필드의 정확한 타입/길이 결정
- seed-coupang.ts 내부 배치 처리 전략 (createMany vs loop)
- 에러 핸들링 패턴 (skip vs fail on invalid record)
- Product.deliveryInfo JSON 구조의 정확한 형태

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 스키마 규칙
- `CLAUDE.md` §Prisma 규칙 — UUID PK, camelCase→snake_case 매핑, Native PG enum 금지
- `prisma/schema.prisma` — 현재 전체 스키마 (Order, Product 등 기존 모델 구조)

### 쿠팡 데이터 구조
- `data/coupang_order_sample.json` — 주문 1건 전체 필드 구조 (shipmentBox, orderer, receiver, orderItems)
- `data/coupang_returns_raw.json` — 반품 6건 전체 필드 구조 (receiptId, returnItems, reasonCode)
- `data/coupang_products_detail_50.json` — 상품 상세 50건 (items, images, deliveryCharge 등)
- `data/coupang_products_sample.json` — 상품 목록 필드 구조

### 리서치 결과
- `.planning/research/ARCHITECTURE.md` — 스키마 재설계 상세, BigInt→String 결정, 빌드 순서
- `.planning/research/PITFALLS.md` — 6개 Critical Pitfall (BigInt 직렬화, 서비스 컴파일 에러 등)
- `.planning/research/STACK.md` — 필요 패키지 (date-fns-tz), KST 파싱 패턴

### 기존 서비스 코드 (수정 대상)
- `apps/server/src/dashboard/dashboard.service.ts` — prisma.order.aggregate() 사용 중
- `apps/server/src/products/products.service.ts` — prisma.order.groupBy() 사용 중
- `apps/server/src/reviews/reviews.service.ts` — prisma.order.groupBy() 사용 중
- `apps/server/src/orders/orders.service.ts` — 현재 쿠팡 API 호출 + JSON 폴백 구조
- `apps/server/src/returns/returns.service.ts` — 현재 쿠팡 API 호출 + JSON 폴백 구조

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prisma/seed.ts` — 기존 시드 패턴 (Prisma ORM, Company/Product/Order 생성). 새 seed-coupang.ts의 기반.
- `apps/server/src/prisma/` — PrismaModule (@Global), PrismaService. 모든 서비스에서 DI로 사용.
- `apps/server/src/orders/orders.module.ts` — 기존 모듈 구조. 재사용 가능.

### Established Patterns
- NestJS 도메인 모듈: `{domain}.module.ts` + `{domain}.controller.ts` + `{domain}.service.ts`
- Prisma 컨벤션: `@@map("snake_case")`, `@map("column_name")`, UUID PK, `@db.Timestamptz`
- API prefix: `app.setGlobalPrefix('api')` → 모든 라우트 `/api/*`
- 기존 orders/returns 서비스는 쿠팡 API 호출 + JSON 폴백 구조 (DB 미사용)

### Integration Points
- `apps/server/src/orders/orders.service.ts` — DB CRUD 추가 필요 (현재 API only)
- `apps/server/src/returns/returns.service.ts` — Return 모델 신규 + DB CRUD 추가
- `apps/server/src/dashboard/dashboard.service.ts` — Order aggregate 쿼리 수정
- `apps/server/src/products/products.service.ts` — Order groupBy 쿼리 수정
- `apps/server/src/reviews/reviews.service.ts` — Order groupBy 쿼리 수정
- `prisma/schema.prisma` — 스키마 전면 재설계

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User deferred all decisions to Claude.

</specifics>

<deferred>
## Deferred Ideas

None — Phase 1 is pure infrastructure/schema work, no scope creep risk.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-26*
