# orders — Order / Return / CS / Return-Transfer 통합 도메인

Order/return-adjacent 표면이 한 NestJS 모듈(`OrdersModule`)에 묶여있다 (orders / returns / cs / reviews / return-transfers). Plan A.5 (ADR-0015) 가 schema 를 channel-agnostic 으로 통합. `return-transfers` 는 Wave H1 Lane O 에서 top-level `src/return-transfers/` 에서 owner 도메인 안으로 fold 됐다 (route + 동작 호환). Prisma 모델 `ReturnTransfer` 는 토폴로지 fold 동안 여전히 Inventory namespace 에 머문다 — 스키마 이동은 별도 PR.

## Schema — channel-agnostic 통합 (Plan A.5)

`Order` (aggregate root) + `OrderLineItem` (per-SKU) + `OrderReturn` + `OrderReturnLineItem`. 채널은 `platform String` 필드, 채널별 raw payload 는 `metadata Json`. `CoupangOrder` / `CoupangOrderItem` / `CoupangReturn` 는 drop. 신규 채널 추가 시 별도 channel-specific 테이블 만들지 말고 `platform` 값만 추가.

### 핵심 키 / unique

- `Order` — `@@unique([companyId, platform, externalOrderId])` (Coupang 의 경우 `externalOrderId = shipmentBoxId`, `externalNumber = orderId`)
- `OrderLineItem` — `@@unique([orderId, externalLineId])` (Coupang 의 경우 `externalLineId` 는 Coupang `vendorItemId` 값이 들어가며, 캐노니컬 매핑은 `ChannelListingOption.externalOptionId` 경유 — ADR-0020)
- `OrderReturn` — `@@unique([companyId, platform, externalReturnId])`
- `OrderLineItem.optionId` denormalized — SKU 조회 single join

### Status 의미 (ADR-0011 + ADR-0015)

- `Order.status` 는 aggregate-level (UI 표시용). canonical lifecycle 따름.
- `OrderLineItem.status` 는 per-SKU 라인-level (부분 발송/취소). 라인별 독립 전이.
- 두 status 는 독립. service 가 라인 status 변경 후 `Order.status` 명시적 갱신 (B2c 가 규칙 정의).

## Directory

```
orders/
├── controllers/        # orders, returns, cs, reviews
├── services/           # orders, returns, cs, reviews
├── dto/                # order/return/cs/review DTO
├── return-transfers/   # Wave H1 fold — controller + service + dto
└── orders.module.ts    # 위 모든 controller/service 단일 모듈
```

`return-transfers/` 는 `OrdersModule` 이 `ReturnTransfersController` + `ReturnTransfersService` 를 직접 등록하는 형태. 별도 sub-module 파일은 두지 않는다 (CS / reviews / returns 와 같은 패턴). Prisma 모델은 여전히 `inventory.prisma` 에 namespace=Inventory 로 남아있다.

## Routes

| Route | 책임 |
|---|---|
| `POST /api/orders` (action enum) | confirm | invoice 액션 (Coupang adapter 위임) |
| `GET /api/orders` | 날짜 범위 + status 필터 |
| `GET /api/orders/stats` | today/week revenue + status breakdown |
| `GET /api/orders/:id` | 단일 주문 detail |
| `POST/GET /api/returns` | 반품 lifecycle |
| `POST/GET /api/cs` | CS 티켓 CRUD + pagination |
| `GET /api/return-transfers` | 반품 transfer 목록 (status 필터) |
| `POST /api/return-transfers` | 반품 transfer 생성 (record-only, stock 미변경) |
| `PATCH /api/return-transfers/:id` | 반품 transfer 상태/수량 업데이트 |

## 핵심 패턴

### 1. Multi-controller 모듈
하나의 `OrdersModule` 이 5 controller (orders/returns/cs/reviews/return-transfers) 등록. Cross-service 의존 없음. `return-transfers` 는 Wave H1 fold 로 합류했지만 여전히 stock 미변경 record-only 동작이며, stock movement invariant 는 `inventory/CLAUDE.md` 의 record-only 규칙 + integration spec `#8` 가 lock-in.

### 2. 외부 채널 어댑터 위임
주문 confirmation, invoice upload는 DB 갱신이 아니라 **`channels.adapters.coupang`** 호출 (orders.service.ts). 서비스에서 `coupangRequest` 직접 호출 절대 금지.

### 3. IDOR 방어 — companyId 조합 필수

단일 리소스 GET / PATCH / DELETE 는 `findUnique({ id })` 절대 금지. 항상 `findFirst({ where: { id, companyId } })` 사용 (`apps/server/CLAUDE.md` 멀티테넌트 격리 규칙 + B2a 패턴). `OrderLineItem` / `OrderReturnLineItem` 의 `companyId` denormalize 도 같은 목적 — line 레벨 접근에서도 companyId 검증 가능.

### 4. CS DTO — `listingId` vs `productId` backward compat alias (Plan B2c.orders T2)

ADR-0013 3-layer schema 로 Product 계층이 drop 되면서 `CSRecord.listingId` (nullable) 로 재배선. 프런트 일괄 rewire (Plan D) 이전까지 legacy 호출자 호환을 위해 `CreateCsBodyDto` 는 두 필드를 모두 받는다.

- **새 필드**: `listingId?: string` — canonical. 프런트 재배선 후 유일.
- **Deprecated alias**: `productId?: string` — `@Transform` 으로 수신 시 `listingId` 없을 때만 복사. `CsService.create` 는 `data.listingId ?? data.productId ?? null` 로 resolve.
- **우선순위**: 두 값이 동시에 제공되면 `listingId` 가 이긴다 (Transform 이 `!obj.listingId` 가드).
- **유지 기간**: Plan D 프런트 재배선 완료 + 모니터링 safe window 이후 follow-up PR 에서 `productId` 제거. 그 전까지 `@deprecated` JSDoc 유지 + 로깅 금지 (정상 alias 경로).

확인 포인트: DTO 에 `productId` 필드 추가/변경 시 service resolver 의 우선순위 가드도 같이 점검. B2c.orders 전까지 `productId` 는 legacy 이고 앞으로는 쓰지 말 것.

## Rules

- 모든 주문 mutation은 `POST /api/orders` 단일 endpoint + action enum (별도 endpoint 만들지 말 것)
- Returns/CS 는 pagination 필수 (limit/page params)
- DateTime 범위 필터는 ISO string + hour boundary normalization
- Service-to-service 호출은 `channels` 어댑터 만 (다른 도메인 service 직접 호출 금지)

## Prohibits

- ❌ 서비스 레이어에서 Coupang API 직접 호출 (반드시 adapter 경유)
- ❌ DTO 변환 단계에서 집계 로직 (서비스 안에서만)
- ❌ 신규 channel-specific 테이블 (`NaverOrder` 등) 추가 — ADR-0015 위반. `platform` 값 추가로 해결.
- ❌ `findUnique({ id })` 로 리소스 GET — IDOR. 항상 `findFirst({ id, companyId })`.
- ❌ `Order.status` 와 `OrderLineItem.status` 의미 혼용 — 독립 유지.

## Cross-domain deps

- **channels** — `coupangAdapter.confirmOrderSheets`, `uploadInvoice`. Order/OrderLineItem upsert 는 channel-sync.service.ts 가 담당 (orders 모듈은 read + action 만).

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Order/OrderLineItem schema 변경 | `prisma/models/orders.prisma` + `apps/server/src/channels/application/service/channel-sync.service.ts` (upsert) + `packages/shared/src/schemas/orders.ts` |
| Status enum 변경 | `services/orders.service.ts` + `channels/application/service/channel-sync.service.ts` 의 Coupang status normalizer |
| Action 종류 추가 | `dto/order-action.dto.ts` + `services/orders.service.ts` action handler + channels adapter 신규 메서드 |
| Returns 워크플로 변경 | `services/returns.service.ts` + `channels/adapters/coupang/orders.ts:approveReturn` |
| CS 페이지네이션 변경 | `services/cs.service.ts` + `common/pagination.ts` (paginationParams) |
| 신규 platform 추가 (e.g., Naver) | `channels/application/service/channel-sync.service.ts` 신 sync method + `platform: 'naver'` 사용 (테이블 추가 금지) |
