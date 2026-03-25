# Pitfalls Research

**Domain:** 쿠팡 운영 데이터 통합 — NestJS+Prisma+Next.js 기존 앱에 추가
**Researched:** 2026-03-25
**Confidence:** HIGH (실제 코드와 실제 데이터 파일 직접 검사)

---

## Critical Pitfalls

### Pitfall 1: BigInt 직렬화 에러 — NestJS API 응답이 500으로 터진다

**What goes wrong:**

Prisma 스키마에서 `shipmentBoxId`, `orderId`를 `BigInt` 타입으로 선언하면, NestJS가 해당 필드를 JSON으로 직렬화할 때 런타임에 터진다.

```
TypeError: Do not know how to serialize a BigInt
```

현재 `coupang_orders_raw.json`의 `shipmentBoxId`는 최대 668,271,992,684,618 — `Number.MAX_SAFE_INTEGER`(9,007,199,254,740,991)보다 작아서 `number`로 처리해도 정밀도 손실은 없다. 하지만 `returnDeliveryId`는 1,038,436,513,567,752,200으로 19자리 숫자 — JavaScript `float64`의 안전한 정수 범위를 **초과한다.** Prisma가 이를 `BigInt`로 반환하면 `JSON.stringify`가 즉시 실패한다.

**Why it happens:**

Prisma 스키마에 `BigInt` 타입을 쓰면 올바른 것처럼 보이지만, Node.js/V8의 `JSON.stringify`는 `BigInt`를 기본 지원하지 않는다. NestJS의 기본 직렬화 파이프라인이 이를 처리하지 못한다.

**How to avoid:**

전략을 두 계층으로 나눈다.

1. `orderId`, `shipmentBoxId` — 실제 데이터가 MAX_SAFE_INT 미만이므로 Prisma 스키마에서 `Int` 또는 `Decimal` 대신 **`String`으로 저장.** 이렇게 하면 API 직렬화 문제가 없고 프론트에서도 문자열로 안전하게 다룰 수 있다.

2. `returnDeliveryId` — 19자리 숫자라 `String` 저장이 필수다. 시드 스크립트에서 `BigInt(id).toString()`으로 변환하여 문자열로 저장한다.

NestJS의 `@Transform`이나 전역 BigInt replacer를 사용하는 방법도 있지만, 스키마에서 `String`으로 박는 것이 더 명확하고 유지보수가 쉽다.

```prisma
model Order {
  shipmentBoxId String @map("shipment_box_id")  // BigInt 아님
  orderId       String @map("order_id")          // BigInt 아님
}

model Return {
  returnDeliveryId String? @map("return_delivery_id")  // 19자리 보존
}
```

**Warning signs:**

- NestJS 서버 로그에 `Do not know how to serialize a BigInt` 에러
- API 호출이 500 반환하는데 DB 쿼리는 성공하는 경우
- `prisma.order.findMany()` 결과가 있는데 `res.json()`이 실패

**Phase to address:** 스키마 재설계 Phase (Phase 1) — 스키마 정의 시점에 타입을 확정해야 이후 모든 레이어가 일관된다.

---

### Pitfall 2: 기존 Order 모델 의존 코드가 4곳에서 컴파일 에러로 터진다

**What goes wrong:**

현재 `Order` 모델은 `productId`, `quantity`, `totalPrice`, `unitPrice`, `orderedAt` 같은 단순 플랫 필드를 가진다. 이를 쿠팡 원본 구조(`orderItems[]` 배열이 있는 1:N 구조)로 바꾸면 아래 4개 서비스가 즉시 컴파일 에러 또는 런타임 에러를 낸다.

| 파일 | 깨지는 코드 |
|------|------------|
| `dashboard/dashboard.service.ts` | `prisma.order.aggregate({ _sum: { totalPrice, quantity } })` — 새 모델에 이 필드들이 없다 |
| `inventory/inventory.service.ts` | `prisma.order.groupBy({ by: ['productId'] })` — 새 모델에 `productId`가 없다 |
| `products/products.service.ts` | `prisma.order.groupBy({ by: ['productId'], _count })` — 동일 |
| `reviews/reviews.service.ts` | `prisma.order.groupBy({ by: ['productId'] })` — 동일 |

스키마만 바꾸고 서비스 코드를 업데이트하지 않으면 `npx prisma generate` 후 TypeScript 빌드가 실패한다.

**Why it happens:**

스키마 변경 범위를 Prisma 파일에 한정해서 생각하기 때문이다. 실제로는 Prisma Client 타입이 바뀌면 그 타입을 참조하는 모든 TypeScript 코드가 깨진다.

**How to avoid:**

스키마 재설계 Phase에서 반드시 다음 순서를 따른다.

1. `npm run db:push` 전에 `npx tsc --noEmit`으로 현재 컴파일 상태 확인
2. 스키마 변경 후 `npx prisma generate`
3. `npx tsc --noEmit`으로 에러 목록 확인
4. 위 4개 파일을 새 모델 구조에 맞게 수정:
   - `dashboard`: `prisma.order.aggregate`를 `prisma.orderItem.aggregate`로 교체하거나 실제 집계 컬럼명 수정
   - `inventory/products/reviews`: `groupBy(['productId'])`를 `orderItem` 테이블에서 수행하도록 교체

**Warning signs:**

- `npx tsc --noEmit` 또는 Docker 빌드 시 `Property 'productId' does not exist on type 'Order'` 에러
- 서버가 시작은 되지만 `/api/dashboard` 호출 시 500 에러
- `npm run dev:server` 시 NestJS 초기화 실패

**Phase to address:** Phase 1 (스키마 재설계) — 스키마 변경 직후, 시드 스크립트 작성 전에 서비스 코드 수정까지 완료해야 한다. 스키마만 먼저 PR하면 CI/빌드가 깨진다.

---

### Pitfall 3: `db:push`가 기존 테이블을 DROP하고 데이터를 날린다

**What goes wrong:**

`Order` 모델을 재설계하면 기존 `orders` 테이블과 새 구조가 호환되지 않는다. `npm run db:push`는 기본적으로 "파괴적 변경"이 있으면 확인을 묻거나(인터랙티브), 또는 **비인터랙티브 환경에서는 테이블을 DROP하고 재생성한다.**

현재 DB에 908개 주문 시드 데이터가 있다. 이 데이터는 스키마 재설계 후 버릴 것이지만, 이 과정에서 **다른 테이블의 FK 제약이 걸린 데이터(Product, Company 등)도 CASCADE로 지워질 수 있다.**

**Why it happens:**

`db:push`는 `--accept-data-loss` 없이 컬럼 삭제/타입 변경이 포함된 경우 인터랙티브 프롬프트를 띄운다. Docker 컨테이너 내부에서 실행하거나 CI에서 `--force-reset`을 사용하면 데이터가 경고 없이 날아간다.

**How to avoid:**

1. 스키마 재설계 전에 **의도적으로 기존 Order 데이터 삭제 결정을 명시적으로** 기록한다 (PROJECT.md에 이미 기록됨 — "기존 Order 데이터 버리고 재설계").
2. 안전한 순서:
   ```bash
   # 1. 기존 orders 테이블 데이터를 명시적으로 비운다
   npx prisma db execute --stdin <<< "DELETE FROM orders;"
   # 2. 그 후 스키마 변경 push
   npm run db:push
   ```
3. Product, Company 같은 다른 모델의 데이터는 보존해야 하므로 `--force-reset`(전체 DB 리셋)은 사용 금지.

**Warning signs:**

- `db:push` 시 `The following migration will be applied: DROP TABLE "orders"` 경고
- `npm run db:push`가 인터랙티브 프롬프트 없이 즉시 완료 → 데이터가 날아간 신호

**Phase to address:** Phase 1 (스키마 재설계) 시작 시점.

---

### Pitfall 4: 나이브 KST 날짜시간을 UTC로 저장하면 8시간 오차가 생긴다

**What goes wrong:**

쿠팡 API는 날짜시간을 timezone offset 없이 반환한다.

```json
"orderedAt": "2026-03-23T13:59:41"
```

이것은 KST(UTC+9)다. 이를 그대로 `new Date()`에 넘기면 JavaScript는 **로컬 시스템 시간대에 따라 파싱**한다. 서버가 UTC로 설정된 환경(Docker 컨테이너, AWS, 대부분의 Linux 서버)이라면 이 시간이 UTC로 해석되어 **실제 시간보다 9시간 빠른 값으로 저장된다.**

결과: 주문 시간이 오전 1시로 표시되어야 하는데 전날 오후 4시로 표시됨.

**Why it happens:**

쿠팡 WING API는 KST 기준 naive datetime을 반환하는데, 시드 스크립트 개발자가 로컬 Mac에서 테스트하면 Mac의 로컬 시간대(보통 KST)로 파싱되어 정상처럼 보인다. 하지만 Docker 컨테이너(UTC)에서 실행하면 9시간 오차가 생긴다.

**How to avoid:**

시드 스크립트에서 날짜를 파싱할 때 명시적으로 KST(UTC+9)를 붙인다:

```typescript
// 잘못된 방법
const orderedAt = new Date("2026-03-23T13:59:41"); // 시스템 TZ 의존

// 올바른 방법
const orderedAt = new Date("2026-03-23T13:59:41+09:00"); // KST 명시
```

또는 helper 함수:

```typescript
function parseKST(naive: string): Date {
  if (!naive || naive === "") return null;
  // KST = UTC+9, naive string에 +09:00 추가
  return new Date(naive + "+09:00");
}
```

빈 문자열(`""`)로 오는 날짜 필드(`inTrasitDateTime`, `deliveredDate`)도 있으므로 null 처리 필수.

**Warning signs:**

- 대시보드의 "오늘 주문" 카운트가 오전 9시 이전에 0으로 표시됨
- 주문 시간이 항상 9시간 빠르게 표시됨
- 로컬(Mac)에서 테스트 통과했는데 Docker에서는 타임존 관련 테스트 실패

**Phase to address:** Phase 1 (시드 스크립트 작성) — 파싱 helper를 먼저 만들고 그것으로 모든 날짜 필드를 처리한다.

---

### Pitfall 5: 1,131개 상품 시드에서 개별 INSERT N번으로 타임아웃

**What goes wrong:**

현재 `seed.ts`는 상품마다 개별 `prisma.product.create()` 루프를 돌린다. 이 패턴으로 1,131개 상품 + 최대 1,077개 주문(orders_all_months.json) + 20개 반품을 시드하면:

- 각 레코드당 DB 왕복 1회 → 1,131 + α 번의 왕복
- Prisma 기본 연결 타임아웃(5초)에 걸릴 수 있음
- 트랜잭션 없으면 중간에 실패 시 일부만 삽입된 더러운 상태

**Why it happens:**

소량 시드 스크립트(10개)를 대량 데이터로 그대로 확장하기 때문이다.

**How to avoid:**

배치 삽입과 트랜잭션 사용:

```typescript
// 올바른 방법: createMany로 배치 삽입
await prisma.product.createMany({ data: productsData, skipDuplicates: true });

// 전체를 트랜잭션으로 감싸기
await prisma.$transaction(async (tx) => {
  await tx.product.createMany({ data: products, skipDuplicates: true });
  await tx.order.createMany({ data: orders, skipDuplicates: true });
});
```

단, Prisma의 `createMany`는 중첩 relations 생성을 지원하지 않는다. `Order`가 `OrderItem[]`을 중첩 생성해야 한다면:
- 먼저 `order.createMany()`로 주문 헤더 배치 삽입
- 그다음 `orderItem.createMany()`로 주문 아이템 배치 삽입

`skipDuplicates: true`를 붙이면 이미 존재하는 레코드(예: `shipmentBoxId` unique) 충돌을 무시하고 나머지를 삽입한다 — 멱등성 시드에 필수.

**Warning signs:**

- `npm run db:seed`가 2분 이상 실행
- `PrismaClientKnownRequestError: Transaction already closed` 에러
- 시드 후 product 수가 기대값보다 적음

**Phase to address:** Phase 1 (시드 스크립트 작성).

---

### Pitfall 6: `ActivityEvent.objectId`가 UUID 타입인데 Order PK를 UUID로 바꾸면 충돌

**What goes wrong:**

현재 `ActivityEvent.objectId`는 `String @map("object_id") @db.Uuid` — UUID만 허용한다. 새 Order 모델이 UUID PK를 쓴다면 문제없지만, 만약 `shipmentBoxId`(숫자)를 PK로 쓰려 하면 ActivityEvent와 연동이 불가능하다.

워크플로우 엔진의 AI 분석 결과가 ActivityEvent에 기록되는데, 이 기록의 `objectId`에 숫자형 주문 ID를 넣으려 하면 UUID 포맷 검증에서 실패한다.

**Why it happens:**

기존 ActivityEvent 설계는 모든 오브젝트가 UUID PK를 사용한다고 가정했다. 쿠팡 원본 데이터는 숫자 ID를 사용하므로 이 가정이 깨진다.

**How to avoid:**

새 Order 모델은 **내부 UUID PK**를 별도로 가지고, `shipmentBoxId`는 외부 ID로 취급한다:

```prisma
model Order {
  id            String @id @default(uuid()) @db.Uuid  // 내부 UUID PK
  shipmentBoxId String @unique @map("shipment_box_id") // 쿠팡 외부 ID
  orderId       String @map("order_id")                // 쿠팡 주문번호
  ...
}
```

ActivityEvent의 `objectId`에는 내부 UUID(`id`)를 사용한다. API 응답에서 클라이언트가 상세 조회 시 `shipmentBoxId`를 사용하더라도, 내부 식별자는 UUID로 일관성을 유지한다.

**Warning signs:**

- `ActivityEvent` 생성 시 `Invalid UUID` 에러
- 워크플로우 실행 후 ActivityEvent 조회 시 해당 주문의 이력이 안 보임

**Phase to address:** Phase 1 (스키마 재설계).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 기존 `orders` 모듈 파일 재활용 (새 구조로 덮어쓰기) | 빠른 개발 | `OrdersService`가 Coupang API 직접 호출 로직과 DB 로직을 섞게 됨 | 절대 안 됨 — 새 모듈로 깔끔하게 분리 |
| `inTrasitDateTime`, `deliveredDate` 빈 문자열을 null 대신 `""` 저장 | 간단한 코드 | 프론트에서 `new Date("")`가 Invalid Date 반환하여 표시 버그 | 절대 안 됨 — 빈 문자열은 `null`로 변환 |
| 주문 아이템을 `orderItems: Json` 컬럼에 JSONB로 저장 | 스키마 단순화 | 주문 아이템 기준 필터/집계 불가 (특정 상품의 주문 조회 등) | 프로토타입 확인용으로만, 생산 전 정규화 필수 |
| `coupang_orders_raw.json` 객체({0: ..., 1: ...})를 `Array.isArray` 없이 처리 | 코드 1줄 | 파일 구조 변경 시 조용히 실패 | MVP 한정, 나중에 `Object.values()` wrapping 추가 |
| 모든 날짜 필드 `@db.Timestamptz` 사용 + 나이브 KST 입력 | 빠른 스키마 작성 | KST/UTC 혼재로 표시 버그 | 절대 안 됨 — 입력 시 `+09:00` 강제 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| 쿠팡 JSON 파일 로드 | `JSON.parse(raw)` 후 배열로 가정 | `coupang_orders_raw.json`은 object `{0: ..., 1: ...}` → `Object.values()` 필요 |
| 쿠팡 JSON 파일 로드 | `returnDeliveryId`를 Number로 저장 | 19자리 숫자로 float64 초과 가능 → `String`으로 저장 |
| 기존 Orders 서비스 재사용 | 파일 기반 오프라인 + Prisma DB를 같은 service에서 처리 | 새 DB 기반 서비스를 별도 모듈로 분리, 기존 오프라인 로직은 제거 또는 분리 |
| 쿠팡 Product-Order 연결 | `orderItems[].sellerProductId`를 Product.coupangProductId와 매칭 시도 | 쿠팡의 `productId`(상품 ID)와 `sellerProductId`(판매자 상품 ID)는 다름 — 매칭 전 확인 필수 |
| NestJS JSON 응답 | Prisma BigInt 필드를 그냥 반환 | `JSON.stringify` 실패 — String 타입으로 저장하거나 replacer 사용 |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 1,131개 상품 개별 INSERT | 시드 스크립트가 5분+ 실행 | `createMany()` 배치 삽입 | 100개 초과 |
| N+1: 주문 목록에서 각 주문별 orderItems 개별 조회 | 주문 목록 API가 느림 | Prisma `include: { orderItems: true }` 한 번에 | 주문 50개 초과 |
| 프론트 주문 목록에서 전체 선택 `Set<number>` | 대량 선택 시 리렌더링 느림 | 현재 구조는 298건으로 괜찮음 | 1,000건 초과 |
| 반품 사유 통계를 매번 full scan | 반품 대시보드 API 느림 | 반품 테이블에 `reasonCode` 인덱스 추가 | 반품 500건 초과 |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 금액을 raw 숫자로 표시 (`1590`) | 셀러가 단위를 인식 못함 | `formatKRW()` 유틸 이미 존재 — 일관되게 사용 |
| 반품 사유를 영문 코드로 표시 (`WRONGDELIVERY`) | 한국 셀러가 이해 불가 | `reasonCodeText` 필드 있음 — 이것을 표시 |
| 반품 책임 구분 `VENDOR`/`CUSTOMER` 영문 표시 | 혼란 | "셀러 책임" / "고객 책임"으로 한글 변환 |
| 주문 시간을 UTC로 표시 | 셀러 입장에서 시간이 맞지 않음 | `toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })` 사용 |
| 상품명이 truncate되어 어떤 상품인지 모름 | 셀러가 주문 내용 파악 불가 | hover 시 전체 상품명 tooltip, 또는 `sellerProductName` 병기 |

---

## "Looks Done But Isn't" Checklist

- [ ] **BigInt 직렬화:** NestJS API가 `{ id: BigInt }` 형태를 반환하지 않는지 — `JSON.stringify(response)` 테스트로 확인
- [ ] **KST 타임존:** 시드 후 DB에서 `SELECT ordered_at` 조회 시 한국 시간 기준으로 올바른지 — 오전 9시 이전 주문이 전날로 표시되면 버그
- [ ] **빈 문자열 날짜 처리:** `inTrasitDateTime: ""`, `deliveredDate: ""`가 DB에 `null`로 들어갔는지 — `SELECT COUNT(*) FROM orders WHERE in_trasit_date_time = ''` 결과가 0이어야 함
- [ ] **기존 서비스 컴파일:** 스키마 변경 후 `npx tsc --noEmit`에서 에러 0개인지
- [ ] **대시보드 todayOrders:** 새 Order 모델로 교체 후 `/api/dashboard`가 500 없이 응답하는지
- [ ] **inventory groupBy:** 새 Order 모델에 `productId` 없으면 `inventory.service.ts`의 재고 자동계산 로직이 NaN 반환
- [ ] **Object.values() 로드:** `coupang_orders_raw.json` 시드 시 `Object.values(data)` 사용했는지 (파일이 배열이 아님)
- [ ] **시드 멱등성:** `db:seed` 두 번 실행해도 중복 데이터 없는지 — `createMany({ skipDuplicates: true })` 확인
- [ ] **returnDeliveryId 보존:** DB에 저장된 값이 원본 JSON의 19자리 숫자와 일치하는지

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| BigInt 직렬화 에러 발생 후 발견 | LOW | 스키마에서 `BigInt` → `String` 변경, `db:push`, 시드 재실행 |
| 서비스 컴파일 에러 (4개 파일) | MEDIUM | `tsc --noEmit`으로 에러 목록 확인 후 각 서비스 수정, 대부분 `orderItem` 테이블 참조로 교체 |
| KST 9시간 오차 데이터가 이미 저장된 경우 | MEDIUM | SQL UPDATE로 모든 datetime 컬럼에 9시간 더하기: `UPDATE orders SET ordered_at = ordered_at + INTERVAL '9 hours'` |
| 시드 중간 실패로 더러운 DB 상태 | LOW | `TRUNCATE orders, order_items, returns CASCADE;` 후 시드 재실행 |
| `db:push`로 다른 테이블 데이터 날린 경우 | HIGH | Docker volume 백업이 없으면 전체 재시드 필요 — 시드 전 `pg_dump` 권장 |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| BigInt 직렬화 | Phase 1: 스키마 재설계 | `curl /api/orders` 응답 파싱 성공 확인 |
| 기존 서비스 컴파일 에러 | Phase 1: 스키마 재설계 | `npx tsc --noEmit` 에러 0개 |
| `db:push` 데이터 손실 | Phase 1: 스키마 재설계 시작 시점 | 기존 데이터 명시적 삭제 후 push |
| KST 시간대 오차 | Phase 1: 시드 스크립트 작성 | DB에서 `ordered_at` 샘플 조회로 시간 검증 |
| N+1 삽입 타임아웃 | Phase 1: 시드 스크립트 작성 | `db:seed` 30초 이내 완료 |
| ActivityEvent UUID 충돌 | Phase 1: 스키마 재설계 | 새 Order 모델이 UUID PK를 별도 보유 |
| 빈 문자열 날짜 | Phase 1: 시드 스크립트 작성 | null 체크 쿼리로 검증 |
| 반품 사유 영문 코드 표시 | Phase 3: 반품 대시보드 | 셀러가 읽을 수 있는 한글 사유로 표시 |
| 금액/시간 포맷 불일치 | Phase 2: 주문 대시보드 | KRW 포맷 + KST 시간 표시 검증 |

---

## Sources

- 직접 검사: `prisma/schema.prisma` — 현재 Order 모델 구조 및 의존 관계
- 직접 검사: `data/coupang_orders_raw.json`, `data/coupang_returns_all.json` — 실제 쿠팡 데이터 구조
- 직접 검사: `apps/server/src/dashboard/dashboard.service.ts` — `prisma.order.aggregate` 사용
- 직접 검사: `apps/server/src/inventory/inventory.service.ts`, `products/products.service.ts`, `reviews/reviews.service.ts` — `prisma.order.groupBy({ by: ['productId'] })` 사용
- 직접 검사: Node.js 런타임 — `JSON.stringify({ id: BigInt('1038436513567752200') })` 에러 재현
- 직접 검사: `returnDeliveryId` 19자리 숫자 검증 (1,038,436,513,567,752,200 > MAX_SAFE_INTEGER)
- 직접 검사: `coupang_orders_raw.json`이 Array가 아닌 `{0: ..., 1: ...}` 객체임
- Prisma 공식 문서: `createMany` skipDuplicates, BigInt handling (HIGH confidence)
- PostgreSQL 문서: `@db.Timestamptz` naive datetime 처리 (HIGH confidence)

---
*Pitfalls research for: 쿠팡 운영 데이터 통합 — NestJS+Prisma+Next.js*
*Researched: 2026-03-25*
