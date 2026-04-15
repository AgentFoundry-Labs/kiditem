# orders — Order / Return / CS 통합 도메인

15 파일. **3개 무관한 도메인(orders / returns / cs)이 한 NestJS 모듈에 묶임**. Coupang 채널 어댑터 위임이 핵심.

## Directory

```
orders/
├── controllers/  # orders, returns, cs (3개)
├── services/     # orders, returns, cs (3개)
├── dto/          # 6 DTO
└── orders.module.ts
```

## Routes

| Route | 책임 |
|---|---|
| `POST /api/orders` (action enum) | confirm | invoice 액션 (Coupang adapter 위임) |
| `GET /api/orders` | 날짜 범위 + status 필터 |
| `GET /api/orders/stats` | today/week revenue + status breakdown |
| `GET /api/orders/:id` | 단일 주문 detail |
| `POST/GET /api/returns` | 반품 lifecycle |
| `POST/GET /api/cs` | CS 티켓 CRUD + pagination |

## 핵심 패턴

### 1. Multi-controller 모듈
하나의 `OrdersModule` 이 3 무관 controller (orders/returns/cs) 등록. Cross-service 의존 없음 (orders.module.ts:10). 향후 분리 가능하나 현재 묶여있음.

### 2. 외부 채널 어댑터 위임
주문 confirmation, invoice upload는 DB 갱신이 아니라 **`channels.adapters.coupang`** 호출 (orders.service.ts:8-9). 서비스에서 `coupangRequest` 직접 호출 절대 금지.

### 3. Status 기반 필터링
predefined enum (`ACCEPT, INSTRUCT, DEPARTURE, DELIVERING, FINAL_DELIVERY, CANCELED`) — query-time 필터 (orders.service.ts:16-34). channels/constants.ts 와 동일 enum.

## Rules

- 모든 주문 mutation은 `POST /api/orders` 단일 endpoint + action enum (별도 endpoint 만들지 말 것)
- Returns/CS 는 pagination 필수 (limit/page params)
- DateTime 범위 필터는 ISO string + hour boundary normalization
- Service-to-service 호출은 `channels` 어댑터 만 (다른 도메인 service 직접 호출 금지)

## Prohibits

- ❌ 서비스 레이어에서 Coupang API 직접 호출 (반드시 adapter 경유)
- ❌ DTO 변환 단계에서 집계 로직 (서비스 안에서만)

## Cross-domain deps

- **channels** — `coupangAdapter.confirmOrderSheets`, `uploadInvoice`

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Status enum 변경 | `services/orders.service.ts:16-34` + `channels/adapters/coupang/constants.ts` (sync) |
| Action 종류 추가 | `dto/order-action.dto.ts` + `services/orders.service.ts` action handler + channels adapter 신규 메서드 |
| Returns 워크플로 변경 | `services/returns.service.ts` + `channels/adapters/coupang/orders.ts:approveReturn` |
| CS 페이지네이션 변경 | `services/cs.service.ts` + `common/pagination.ts` (paginationParams) |
