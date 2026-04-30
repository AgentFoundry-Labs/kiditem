# channels — Coupang 통합 + Sync + Dashboard 도메인

**외부 마켓플레이스(Coupang) 어댑터 + 데이터 동기화 + 분석 대시보드** 가 결합된 도메인. `adapter/out/coupang/` 하위가 외부 API 격리 레이어.

> **Plan A.5 완료 (2026-04-18)**: `syncSingleOrder` / `syncSingleReturn` 은 channel-agnostic `Order` / `OrderLineItem` / `OrderReturn` / `OrderReturnLineItem` 으로 재작성됨. 채널 구분은 `platform String` (현재 `'coupang'`), 채널-특수 raw 데이터는 `metadata Json`. `CoupangOrder` / `CoupangOrderItem` / `CoupangReturn` 는 drop. 신규 채널 추가 시 별도 channel-specific 테이블 만들지 말고 `platform` 값만 추가 ([apps/server/src/orders/AGENTS.md](../orders/AGENTS.md) 참고).
>
> **Wave C1 완료 (2026-04-27)**: `syncProducts` 를 `ChannelListing` / `ChannelListingOption` 기반으로 재작성. `syncInventory` 는 stub — 별도 wave 가 InventoryService single-writer 경계를 정한 후 작성.
>
> **Market-data hard rewrite 완료 (2026-04-27)**: `ChannelScrapeRun` / `ChannelScrapeSnapshot` / `ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot` / `ChannelAdTargetDailySnapshot` / `ChannelAccountDailyKpiSnapshot` 은 channels namespace 의 모델이지만 scrape ingestion writer 는 각 ingest 진입 도메인이 담당한다. `/api/ads/extension/sync` 는 advertising 도메인의 `ChannelScrapePersistenceService` 가 raw + daily facts 를 write 하고, `/api/traffic/upload` 는 traffic 도메인이 raw CSV/XLSX row 를 먼저 보존한 뒤 listing daily traffic fact 를 normalize 한다. channels 도메인은 Coupang product/order sync 와 dashboard read consumer 로만 접근한다.
>
> **Wave H2 Lane C 완료 (2026-04-30)**: Hexagonal 레이아웃 도입. HTTP 레이어를 `adapter/in/http/` 로, Coupang 어댑터를 `adapter/out/coupang/` 으로, 서비스를 `application/service/` 로 이동. Coupang 외부 API 는 `application/port/out/coupang-provider.port.ts` 의 `CoupangProviderPort` 인터페이스 뒤에 격리되었고, `CoupangProviderAdapter` 가 이를 구현한다. `adapters/coupang/orders.ts` 는 orders 모듈의 기존 import 경로를 유지하기 위한 compat shim 으로만 남는다 (Wave H2 Lane C).

## Directory

```
channels/
├── channels.module.ts                                      ← port↔adapter binding (CoupangProviderPort → CoupangProviderAdapter)
├── AGENTS.md
├── adapter/
│   ├── in/
│   │   └── http/
│   │       ├── channel-sync.controller.ts                  (@Controller('coupang-sync'))
│   │       ├── channel-dashboard.controller.ts             (@Controller('coupang-dashboard'))
│   │       └── dto/
│   │           ├── coupang-date-range.dto.ts
│   │           ├── sync-orders.dto.ts
│   │           └── index.ts
│   └── out/
│       └── coupang/
│           ├── coupang-client.ts                           (HMAC auth, fetch wrapper, getVendorId)
│           ├── products.ts                                 (getSellerProducts, getSellerProduct)
│           ├── orders.ts                                   (getOrderSheets, confirmOrderSheets, uploadInvoice, approveReturn, DELIVERY_COMPANIES)
│           └── coupang-provider.adapter.ts                 (@Injectable class implementing CoupangProviderPort)
├── application/
│   ├── port/
│   │   └── out/
│   │       └── coupang-provider.port.ts                    (COUPANG_PROVIDER_PORT token + CoupangProviderPort interface + Coupang external response types)
│   └── service/
│       ├── channel-sync.service.ts                         (syncProducts/syncOrders/syncInventory; uses @Inject(COUPANG_PROVIDER_PORT))
│       ├── channel-dashboard.service.ts                    (6 dashboard aggregation methods; PrismaService direct — transitional)
│       └── types.ts                                        (SyncResult, HealthResult, CoupangSyncOrderPayload, CoupangSyncReturnPayload)
└── adapters/coupang/
    └── orders.ts                                            ← COMPAT SHIM ONLY — re-exports from adapter/out/coupang/orders.ts
```

서비스 테스트는 `application/service/__tests__/` 하위, 채널 수준 통합 테스트는 `__tests__/` 하위에 유지.

## 핵심 패턴

### 1. Coupang Adapter (외부 API 격리)

**모든 Coupang API 호출은 `adapter/out/coupang/` 만 거침**. 서비스 레이어가 직접 fetch 안 함.
서비스는 `CoupangProviderPort` 인터페이스에만 의존한다 (`@Inject(COUPANG_PROVIDER_PORT)`).

`coupang-client.ts`:
- 인증: HmacSHA256 signature (`generateAuthorization()`)
  - ENV: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, `COUPANG_VENDOR_ID`
  - 누락 시 즉시 throw — fail fast
- HTTP: native `fetch` + AbortController 30s timeout
- 응답 검증: `response.ok` + content-type JSON 체크
- **재시도 로직 없음** — 단일 시도. caller 가 책임.

상태 매핑은 별도 constants 모듈을 두지 않고 `application/service/channel-sync.service.ts` 의
`normalizeCoupangProductStatus` / `normalizeCoupangOrderStatus` 가 소유한다.

### 2. Status Mapping (Coupang → 내부 enum)

`normalizeCoupangProductStatus(raw)` — `ChannelListing.status` 정규화 (Wave C1):
```
APPROVED|ON_SALE             → 'active'
SUSPEND                      → 'paused'
DELETED                      → 'deleted'
UNDER_EXAMINATION|REJECTED   → 'draft'
기타                         → raw.toLowerCase()  // fallback (raw 보존)
```

`normalizeCoupangOrderStatus(raw)` — Order pipeline 5-stage. 현재 `NONE_TRACKING → DEPARTURE` 만 매핑.

**새 status 발견 시**: 매핑 추가 + 단위 테스트 + 본 문서 갱신.

### 3. Sync 3종 (Products / Orders / Inventory)

`application/service/channel-sync.service.ts`:
- `syncProducts(companyId)` — Coupang seller-products → `ChannelListing` / `ChannelListingOption` 동기화 (Wave C1).
  - `this.coupang.getSellerProducts({nextToken, maxPerPage})` 로 페이지 순회 (`MAX_PAGES=200` 안전 한도).
  - 각 listing 은 별도 `prisma.$transaction({timeout: 15_000})` — batch 중 실패가 다른 listing 동기화를 막지 않음 (continue-on-error, `result.errors` 카운트).
  - **Refresh-only**: `ChannelListing.masterId` 가 required 이므로, 기존 listing 이 없는 `sellerProductId` 는 skip + report. master 자동 생성 금지 (제품 import / admin UI 가 담당). 같은 `(companyId, channel='coupang', externalId=sellerProductId)` 는 매번 update — 재실행 idempotent.
  - **Option upsert**: `ChannelListingOption` 은 `(listingId, externalOptionId=String(vendorItemId))` 로 upsert. `vendorItemId` 누락 시 `BadRequestException` (전체 listing transaction rollback). 내부 `optionId` 매칭은 별도 단계 (nullable 유지).
  - **Status mapping**: `normalizeCoupangProductStatus(statusName)` 로 `APPROVED|ON_SALE → active`, `SUSPEND → paused`, `DELETED → deleted`, `UNDER_EXAMINATION|REJECTED → draft`. 기타는 lowercase fallback.
- `syncOrders()` → `syncSingleOrder(payload, companyId)` — Coupang order sheets → `Order` + N `OrderLineItem` (`platform='coupang'`, `externalOrderId=shipmentBoxId`, `externalLineId=vendorItemId`). `prisma.$transaction(async (tx) => {...}, { timeout: 15_000 })` 원자.
- `syncReturns()` → `syncSingleReturn(payload, companyId)` — Coupang receipts → `OrderReturn` + N `OrderReturnLineItem` (`type=RETURN|EXCHANGE` first-class). matchedOrder lookup (`tx.order.findFirst`) 도 transaction 내부.
- `syncInventory()` — stub. 별도 wave (InventoryService single-writer 경계 결정 후) 가 작성.

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
    const listingOption = await tx.channelListingOption.findFirst({
      where: { companyId, externalOptionId: vendorItemId, isActive: true,
               listing: { channel: 'coupang', isDeleted: false, ... } },
      ...,
    });
    await tx.orderLineItem.upsert({
      where: { orderId_externalLineId: { orderId: order.id, externalLineId: vendorItemId } },
      ...,
      // optionId / sku denormalized from listingOption
    });
  }
}, { timeout: 15_000 });
```

**vendorItemId 계약**: Coupang 은 항상 채워서 보냄. 누락 시 upsert key 충돌 + 라인 동일성 식별 불가 → `BadRequestException` fail-fast.

**타입**: `application/service/types.ts` 의 `CoupangSyncOrderPayload` (= `OrderSheetResponse['data'][number]`) + `CoupangSyncReturnPayload` (interface) — `any` 사용 금지.

**Batch continue-on-error**: orchestrator (`syncOrders` 등) 가 개별 syncSingle* 실패를 catch + `result.errors` 카운트.

### 4. $queryRaw — Dashboard 분석 전용

`application/service/channel-dashboard.service.ts` — 트렌드 / 랭킹 / 반품 집계용 `$queryRaw` 쿼리 다수.

**PrismaService 직접 주입 (transitional 결정)**: `channel-dashboard.service.ts` 는 `PrismaService` 를 직접 inject 한다. 대시보드 쿼리 메서드들은 read-only 집계이며 포트 추상화 비용 대비 이득이 작다. 이 결정은 Wave H2 Lane C 에서 의도적으로 내린 selective hex 선택이다 (전용 dashboard repository port 를 추가하지 않음).

**규칙**:
- Parameterized binding 만 사용: `${companyId}::uuid`. **String concat 절대 금지** (SQL injection 위험).
- 결과 typed array로 캐스팅 후 JS 변환.
- channel-sync 에서는 raw SQL **사용 안 함** (Prisma client 만).
- **2-hop tenant predicate (필수)**: 단일 `o.company_id` 필터에 의존하지 말고 join 된 모든 tenant-owned 테이블(`orders`, `order_line_items`, `channel_listings`, `master_products`) 에 `... .company_id = ${companyId}::uuid` 을 명시한다. `Order.listing_id` / `ChannelListing.master_id` 는 schema-level cross-FK companyId enforcement 가 없어, 잘못된 backfill / 미래 cross-domain bug 가 들어왔을 때 1-hop 필터만으로는 다른 tenant 의 row 가 leak 될 수 있음. `getRevenueTrend`/`getProductRanking` 가 이 패턴을 사용한다. This is the preserved R1/R2/R3 risk rule: listing/master joins do not have schema-level cross-company enforcement.

#### getReturnSummary

`GET /api/coupang-dashboard/return-summary` — 반품율 집계 엔드포인트. **returnRate semantic contract** 에 따라 다음 정책 적용:

- **INNER JOIN on Order.orderedAt** — `OrderReturn` 을 matched `Order` 에 join, `Order.orderedAt` 기준으로 시간 필터. 반품이 접수된 시점(`returnedAt`)이 아니라 주문 발생 시점 기준 분모/분자 정합.
- **반환 4 필드**: `orderCount`, `returnCount`, `returnRate` (= returnCount / orderCount, `[0,1]`), `orphanReturnCount` (= `order_id = NULL` 인 반품 건 수 — 보조 지표).
- **orphanReturnCount 해석**: 사이드 메트릭으로만 표시. `returnRate` 분모/분자에서 **제외** (매칭 안 된 반품은 비율 계산 불가). 운영팀이 데이터 정합성 점검에 활용.
- Finance `sales-analysis.service.ts` follows the same live aggregation / orphan-return side metric contract; keep both surfaces aligned if return-rate semantics change.
- **응답 타입**: `@kiditem/shared` 의 `ReturnSummarySchema` (Zod). 서비스가 `satisfies` 로 드리프트 방지.

### 5. Company Isolation

대시보드 모든 엔드포인트는 `@CurrentCompany()` 데코레이터로 companyId 추출. 서비스의 모든 $queryRaw에 `WHERE company_id = ${companyId}::uuid` 필수. JOIN 으로 다른 tenant-owned 테이블을 끌어오는 경우 §4 의 2-hop tenant predicate 규칙도 함께 적용한다.

**Cross-company 조회 금지** — guard + decorator 가 강제하지만 새 raw 쿼리 추가 시 명시적 체크.

### 6. Health Check (Non-fatal)

`checkHealth()`:
- `this.coupang.getSellerProducts(maxPerPage: 1)` 호출로 자격증명 검증
- 에러 catch → `{ connected: false, error }` 반환 (throw 안 함)
- 외부 API 다운 시 시스템 전체 fall-through 방지

## 외부 의존

- **Coupang Open API** (v2/v4) — `adapter/out/coupang/` 으로만
- **Prisma** — 내부 DB (ChannelListing, Order/OrderLineItem, Inventory 등). Plan A.5 후 channel-agnostic schema.
- **auth/** — `@CurrentCompany()` 데코레이터

## 금지 (Hard bans)

- ❌ 서비스에서 `coupangRequest`/`fetch` 직접 호출 (adapter 경유 필수)
- ❌ 서비스에서 `adapter/out/coupang/` 함수 직접 import — `CoupangProviderPort` 경유만
- ❌ Status mapping 우회 (raw status 그대로 DB 저장 금지)
- ❌ $queryRaw 에 string concat (parameterized 만)
- ❌ Cross-company raw 쿼리 (companyId WHERE 빠뜨리지 말 것)
- ❌ Adapter 내 retry 로직 추가 — 의도적으로 caller 책임으로 둠 (변경 시 scoped plan + instruction update)
- ❌ 환경 변수 fallback 추가 (현재는 throw — 운영 환경 자격증명 누락 즉시 발견 의도)
- ❌ `adapters/coupang/` 하위에 shim 이외의 파일 추가 (compat shim 은 `orders.ts` 1개뿐)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Coupang API endpoint 추가 | `adapter/out/coupang/{products,orders}.ts` + `application/port/out/coupang-provider.port.ts` (인터페이스 확장) + `adapter/out/coupang/coupang-provider.adapter.ts` + `application/service/channel-sync.service.ts` (호출자) + DTO 추가 |
| Status map 변경 | `normalizeCoupangProductStatus` / `normalizeCoupangOrderStatus` in `application/service/channel-sync.service.ts` + 본 문서 §2 표 업데이트 |
| 새 sync 종류 (예: 카테고리) | `adapter/out/coupang/` 신규 모듈 + `adapter/in/http/channel-sync.controller.ts` + `application/service/channel-sync.service.ts` 메서드 추가 |
| Dashboard 쿼리 추가 | `application/service/channel-dashboard.service.ts` ($queryRaw + companyId) + `adapter/in/http/channel-dashboard.controller.ts` + 응답 타입 |
| 재시도/큐 도입 | adapter 설계 변경 scoped plan 필요 (현재 비재시도가 의도) |
| Multi-vendor 지원 | adapter 의 ENV 의존 → 멀티-credential 테이블로 리팩토링. 큰 변경 → scoped plan + instruction update 필수 |
