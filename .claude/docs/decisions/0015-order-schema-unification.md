---
id: 0015
title: Order schema channel-agnostic unification
status: Accepted
date: 2026-04-18
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/server/src/orders
  - apps/server/src/channels
  - packages/shared
---

# ADR-0015: Order Schema Channel-Agnostic Unification

**Predecessors**: [ADR-0013](0013-product-schema-3layer.md) (3-layer schema), [ADR-0014](0014-stock-mutation-single-writer.md) (single-writer)

## Context

기존 Order 도메인은 `Order` (denormalized, single-product 가정) + `CoupangOrder` + `CoupangOrderItem` + `CoupangReturn` (Coupang 전용 aggregate) 가 병존했다. Multi-channel (Naver / 11번가 / Auction 등) 확장 시 `NaverOrder` / `NaverOrderItem` / `11stOrder` ... 식 N+1 테이블이 필요해지는 channel-leak 패턴. ChannelListing 이 ADR-0013 으로 channel-agnostic 해진 것과 대칭으로, Order 도메인도 단일 schema 로 통합해야 한다.

## Decision

**채널-agnostic 4 모델 도입**: `Order` (aggregate root) + `OrderLineItem` (per-SKU) + `OrderReturn` + `OrderReturnLineItem`. 채널은 `platform String @db.VarChar(20)` 필드로 구분하며, 채널별 raw payload 는 `metadata Json` 컬럼에 저장한다. `CoupangOrder` / `CoupangOrderItem` / `CoupangReturn` 는 drop.

### 1. 4 모델 구조

| 모델 | 책임 | 키 |
|---|---|---|
| `Order` | 주문 aggregate (수령자 / 배송 / 합계) | `@@unique([companyId, platform, externalOrderId])` |
| `OrderLineItem` | per-SKU 라인 (`listingOption → option` SKU 해상도) | `@@unique([orderId, externalLineId])` |
| `OrderReturn` | 반품 aggregate (`type=RETURN|EXCHANGE` first-class) | `@@unique([companyId, platform, externalReturnId])` |
| `OrderReturnLineItem` | 반품 내 SKU 단위 상세 | (no unique) |

### 2. `Order.status` vs `OrderLineItem.status` 의미 분리

- `Order.status` 는 aggregate-level (사용자/관리 UI 용 — `pending` / `partial_shipped` / `shipped` 등)
- `OrderLineItem.status` 는 라인-level (부분 발송/취소 시 SKU 단위 추적)
- 두 status 는 **독립적으로 유지**. `Order.status` 는 service 가 라인 status 전이 후 명시적으로 갱신 (B2c plan 이 규칙 정의)

### 3. First-class field promotion rule

| 패턴 | 처리 |
|---|---|
| Production query (`WHERE` / `JOIN` / `GROUP BY`) 에서 1개 이상 도메인 service 가 사용 | first-class column 으로 graduate |
| 단순 display 만 사용 (사용자 화면 노출 only) | `metadata Json` 유지 |

**현재 first-class** (Plan A.5 결정): receiver name/phone/addr, dates (orderedAt/paidAt/shippedAt/deliveredAt), totalPrice, shippingPrice, trackingNumber, shippingCompany, return type/reason/faultBy/requesterName/enclosePrice.

**현재 metadata** (promote 후보 발생 시 ADR amend): orderer JSON, parcelPrintMessage, vendorItemId per-line, sellerProductId, instantCouponDiscount, reasonCode, reasonCodeText, returnDeliveryId.

### 4. Sync 원자성

`channel-sync.service.ts` 의 `syncSingleOrder` / `syncSingleReturn` 은 `prisma.$transaction(async (tx) => {...}, { timeout: 15_000 })` interactive transaction 으로 Order + N OrderLineItems (또는 OrderReturn + N OrderReturnLineItems) 를 원자 처리. 부분 실패 시 전체 rollback. matchedOrder lookup (`tx.order.findFirst`) 도 transaction 내부에서 수행 — 동일 sync run 이 Order 를 먼저 만든 직후 Return 을 처리할 때 phantom read 방지.

### 5. vendorItemId 계약

Coupang `OrderLineItem` payload 의 `vendorItemId` 는 항상 채워져 들어옴. null/undefined 면 upsert key (`@@unique([orderId, externalLineId])`) 충돌 위험 + 라인 동일성 식별 불가 → service 가 `BadRequestException` 으로 즉시 throw. 누락된 payload 는 데이터 계약 위반으로 간주.

## Rationale

- **N+1 채널 테이블 폭증 방지** — Naver/11st 추가 시 schema 변경 없이 신 platform 값만 추가
- **Picking/Statistics/Settlements/Inventory hook 등 다운스트림 service 가 channel 코드 없이 OrderLineItem 으로 SKU 처리** — channel-leak 차단
- **Status 분리** — 부분 발송 시나리오 (`OrderLineItem.status='shipped'` 일부 + `Order.status='partial_shipped'`) 정확히 표현. ADR-0011 status canonical lifecycle 와 정합.
- **`OrderLineItem.optionId` denormalize** — SKU 조회 single join (channelListingOption 거치지 않음)

## Consequences

**긍정**:
- 신규 channel 추가 schema 변경 0
- ChannelListing 과 동일한 channel-agnostic 패턴 (ADR-0013) → 도메인 일관성
- vendorItemId 계약 명시 → 데이터 품질 사고 fail-fast

**부정**:
- `metadata Json` 은 query 시 `WHERE metadata->>'field'` 필요 (queryability 저하). promote 결정 단위로 first-class 로 옮겨야 함.
- B2c plan 이 모든 read-side service (statistics / supplier-stats / settlements / sales-plans / dashboard / channel-dashboard / profit-loss) 를 신 schema 로 재작성해야 함 — 잠정적으로 stub 처리 (Task 9)
- `Order.totalPrice` denormalization (sum of lineItems.totalPrice, shipping 제외) drift 위험 — sync 가 항상 재계산 (`syncSingleOrder` 가 매번 `orderItems.reduce` → upsert 의 update/create 양쪽에 동일 totalPrice 주입)

## Enforcement

- 신규 channel-specific 테이블 (e.g., `NaverOrder`) 생성 거부 (PR 리뷰)
- Promotion 결정 (metadata → first-class) 은 ADR amendment 또는 별도 plan 으로 기록
- `grep -r "coupangOrder\|coupang_orders\|coupang_order_items\|coupang_returns" apps/server/src/` — 0 hits 유지 (Plan B2c stub 의 주석 형태 reference 는 예외)
- Sync method 는 항상 `$transaction` 내에서 Order + lineItems 처리. 외부 `prisma.order.create` 직접 호출 시 라인 누락 위험

## Related

- Plan A.5 spec: `docs/superpowers/specs/2026-04-18-plan-a5-order-schema-unification-design.md`
- Plan A.5 plan: `docs/superpowers/plans/2026-04-18-plan-a5-order-schema-unification.md`
- ADR-0013 (3-layer schema, ChannelListing channel-agnostic)
- ADR-0014 (single-writer for Inventory)
- 후속 plan: B2c (read-side service rewrite), B2.picking (OrderLineItem 기반 picking)
