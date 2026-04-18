# channels — Coupang 통합 + Sync + Dashboard 도메인

13 파일. **외부 마켓플레이스(Coupang) 어댑터 + 데이터 동기화 + 분석 대시보드** 가 결합된 도메인. `adapters/coupang/` 하위가 외부 API 격리 레이어.

> **Plan A.5 (ADR-0015) 완료 (2026-04-18)**: `syncSingleOrder` / `syncSingleReturn` 은 channel-agnostic `Order` / `OrderLineItem` / `OrderReturn` / `OrderReturnLineItem` 으로 재작성됨. 채널 구분은 `platform String` (현재 `'coupang'`), 채널-특수 raw 데이터는 `metadata Json`. `CoupangOrder` / `CoupangOrderItem` / `CoupangReturn` 는 drop. 상세: [ADR-0015](../../../../.claude/docs/decisions/0015-order-schema-unification.md).
>
> **⚠ Plan B2c pending**: `syncProducts` 와 `channel-dashboard.service.ts` 는 ADR-0013 drop 모델 (`Product`, `ProductItem`) 참조 + Plan A.5 drop 모델 (`coupangOrder*`) 참조로 stub 상태. B2c 가 `ChannelListing` + `ChannelListingOption` + `Order` / `OrderLineItem` 기반으로 재작성 예정.

## Directory

```
channels/
├── adapters/coupang/    # 4 files — 외부 API 격리 (HMAC auth, fetch client, products/orders endpoints)
│   ├── coupang-client.ts
│   ├── constants.ts
│   ├── products.ts
│   └── orders.ts
├── controllers/         # 2 files — channel-sync, channel-dashboard
├── services/            # 3 files — channel-sync, channel-dashboard, types
├── dto/                 # 3 files
└── channels.module.ts
```

## 핵심 패턴

### 1. Coupang Adapter (외부 API 격리)

**모든 Coupang API 호출은 `adapters/coupang/` 만 거침**. 서비스 레이어가 직접 fetch 안 함.

`coupang-client.ts`:
- 인증: HmacSHA256 signature (`generateAuthorization()`, line 44)
  - ENV: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, `COUPANG_VENDOR_ID`
  - 누락 시 즉시 throw (line 17) — fail fast
- HTTP: native `fetch` + AbortController 30s timeout (line 67)
- 응답 검증: `response.ok` + content-type JSON 체크 (line 84-95)
- **재시도 로직 없음** — 단일 시도. caller 가 책임.

`constants.ts`:
- `ORDER_STATUSES`: ACCEPT, INSTRUCT, DEPARTURE, DELIVERING, FINAL_DELIVERY, CANCELED
- `RETURN_STATUSES`: UC, RC

`products.ts` / `orders.ts`:
- API 메서드 wrappers (`getSellerProducts`, `confirmOrderSheets`, `uploadInvoice` 등)
- 페이지네이션: `nextToken` + `maxPerPage`

### 2. Status Mapping (Coupang → 내부 enum)

`channel-sync.service.ts:17-24` — `COUPANG_STATUS_MAP`:
```
APPROVED|ON_SALE → 'active'
SUSPEND          → 'paused'
DELETED          → 'deleted'
UNDER_EXAMINATION|REJECTED → 'draft'
```

매핑 안 된 status는 'draft' default (line 325). **새 status 발견 시 이 map 업데이트 필수**.

### 3. Sync 3종 (Products / Orders / Inventory)

`channel-sync.service.ts`:
- `syncProducts()` — Coupang seller products → 내부 ChannelListing/ChannelListingOption (B2c 가 재작성)
- `syncOrders()` → `syncSingleOrder(payload, companyId)` — Coupang order sheets → `Order` + N `OrderLineItem` (`platform='coupang'`, `externalOrderId=shipmentBoxId`, `externalLineId=vendorItemId`). `prisma.$transaction(async (tx) => {...}, { timeout: 15_000 })` 원자.
- `syncReturns()` → `syncSingleReturn(payload, companyId)` — Coupang receipts → `OrderReturn` + N `OrderReturnLineItem` (`type=RETURN|EXCHANGE` first-class). matchedOrder lookup (`tx.order.findFirst`) 도 transaction 내부.
- `syncInventory()` — DB-only 집계. ADR-0014 단일 writer 위배 가능성으로 B2a/B2c 검토 필요.

**Sync 원자 패턴**:
```ts
await this.prisma.$transaction(async (tx) => {
  const order = await tx.order.upsert({
    where: { companyId_platform_externalOrderId: { companyId, platform: 'coupang', externalOrderId: shipmentBoxId } },
    ...
  });
  for (const item of orderItems) {
    if (!item.vendorItemId) {
      throw new BadRequestException(`OrderLineItem missing vendorItemId — cannot upsert (shipmentBoxId=${shipmentBoxId})`);
    }
    const listingOption = await tx.channelListingOption.findUnique({...});
    await tx.orderLineItem.upsert({
      where: { orderId_externalLineId: { orderId: order.id, externalLineId: vendorItemId } },
      ...,
      // optionId / sku denormalized from listingOption
    });
  }
}, { timeout: 15_000 });
```

**vendorItemId 계약**: Coupang 은 항상 채워서 보냄. 누락 시 upsert key 충돌 + 라인 동일성 식별 불가 → `BadRequestException` fail-fast (ADR-0015).

**타입**: `services/types.ts` 의 `CoupangSyncOrderPayload` (= `OrderSheetResponse['data'][number]`) + `CoupangSyncReturnPayload` (interface) — `any` 사용 금지.

**Batch continue-on-error**: orchestrator (`syncOrders` 등) 가 개별 syncSingle* 실패를 catch + `result.errors` 카운트.

### 4. $queryRaw — Dashboard 분석 전용

`channel-dashboard.service.ts:53, 81, 115, 122, 142, 163` — 6개 raw SQL 쿼리 (트렌드, 랭킹, 반품 집계).

**규칙**:
- Parameterized binding 만 사용: `${companyId}::uuid`. **String concat 절대 금지** (SQL injection 위험).
- 결과 typed array로 캐스팅 후 JS 변환.
- channel-sync 에서는 raw SQL **사용 안 함** (Prisma client 만).

### 5. Company Isolation

대시보드 모든 엔드포인트는 `@CurrentCompany()` 데코레이터로 companyId 추출. 서비스의 모든 $queryRaw에 `WHERE company_id = ${companyId}::uuid` 필수.

**Cross-company 조회 금지** — guard + decorator 가 강제하지만 새 raw 쿼리 추가 시 명시적 체크.

### 6. Health Check (Non-fatal)

`checkHealth()` (line 32-58):
- `getSellerProducts(maxPerPage: 1)` 호출로 자격증명 검증
- 에러 catch → `{ connected: false, error }` 반환 (throw 안 함)
- 외부 API 다운 시 시스템 전체 fall-through 방지

## 외부 의존

- **Coupang Open API** (v2/v4) — adapter 로만
- **Prisma** — 내부 DB (ChannelListing, Order/OrderLineItem, Inventory 등). Plan A.5 후 channel-agnostic schema (ADR-0015).
- **auth/** — `@CurrentCompany()` 데코레이터

## 금지 (Hard bans)

- ❌ 서비스에서 `coupangRequest`/`fetch` 직접 호출 (adapter 경유 필수)
- ❌ Status mapping 우회 (raw status 그대로 DB 저장 금지)
- ❌ $queryRaw 에 string concat (parameterized 만)
- ❌ Cross-company raw 쿼리 (companyId WHERE 빠뜨리지 말 것)
- ❌ Adapter 내 retry 로직 추가 — 의도적으로 caller 책임으로 둠 (변경 시 ADR)
- ❌ 환경 변수 fallback 추가 (현재는 throw — 운영 환경 자격증명 누락 즉시 발견 의도)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Coupang API endpoint 추가 | `adapters/coupang/{products,orders}.ts` + `services/channel-sync.service.ts` (호출자) + DTO 추가 |
| Status map 변경 | `services/channel-sync.service.ts:17-24` + `services/channel-sync.service.ts:325` (default fallback) |
| 새 sync 종류 (예: 카테고리) | `adapters/coupang/` 신규 모듈 + `channel-sync.controller.ts` + `services/channel-sync.service.ts` 메서드 추가 |
| Dashboard 쿼리 추가 | `channel-dashboard.service.ts` ($queryRaw + companyId) + `channel-dashboard.controller.ts` + 응답 타입 |
| 재시도/큐 도입 | adapter 설계 결정 ADR 필요 (현재 비재시도가 의도) |
| Multi-vendor 지원 | adapter 의 ENV 의존 → 멀티-credential 테이블로 리팩토링. 큰 변경 → ADR 필수 |
