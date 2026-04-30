# finance — P&L + Sales Analysis + Finance Capabilities

> **Plan D.1 완료**: `profit-loss.service.ts` 는 live aggregation 으로 재작성됨 (2026-04-20). 현재 finance read paths 는 `ProfitLoss` table 을 source-of-truth 로 읽지 않는다. `ProfitLoss` 모델은 legacy data / future cache 재사용 가능성을 위해 schema 에만 남아 있으며, 새 writer 또는 reader 를 추가하려면 별도 scoped plan 이 필요하다.

> **Wave H1 Lane F 완료 (2026-04-30)**: `manual-ledger`, `processing-costs`, `supplier-payments`, `sales-plans`, `settlements` 5개 finance capability 가 top-level 에서 `apps/server/src/finance/` 아래로 fold. 단일 `FinanceModule` 이 7개 컨트롤러/서비스 등록. 라우트, DTO, Prisma 모델, shared exports, 테넌트 스코프, 서비스 동작 모두 보존. `Settlement` Prisma 모델은 Orders 네임스페이스, `SupplierPayment` Prisma 모델은 Supply 네임스페이스에 그대로 (스키마 변경 없음).

**Prisma ORM 기반 live cross-table 집계** + period parsing + cross-domain pricing resolver + finance capability CRUD (manual ledger, processing costs, supplier payments, sales plans, settlements reconcile).

## Directory

```
finance/
├── controllers/                # profit-loss, sales-analysis (2개)
├── services/                   # profit-loss, sales-analysis
├── dto/                        # 2 query DTO
├── manual-ledger/              # 수기 장부 CRUD (companyId scoped)
├── processing-costs/           # 가공비 CRUD + 월별 집계 + MasterProduct check
├── supplier-payments/          # 거래처 결제 CRUD (Supplier/PurchaseOrder scoped check)
├── sales-plans/                # 판매 계획 CRUD + syncActuals (KST month window)
├── settlements/                # 정산 CRUD + reconcile ($queryRaw + KST window + bigint conversion)
└── finance.module.ts           # 단일 모듈, 7 controllers + 7 services
```

## Routes

| Route | 책임 |
|---|---|
| `GET /api/profit-loss` | 기간별 P&L (회사 집계) |
| `GET /api/sales-analysis` | 채널 단위 revenue/cost/profit breakdown |
| `GET/POST/DELETE /api/manual-ledger` | 수기 장부 — 거래 기록 CRUD |
| `GET/POST/PATCH /api/processing-costs` | 가공비 — `GET monthly` 월별 집계 포함 |
| `GET/POST/PATCH /api/supplier-payments` | 거래처 결제 |
| `GET/POST/PATCH/DELETE /api/sales-plans` + `PATCH /:id/sync` | 판매 계획 + 실적 동기화 |
| `GET/POST/PATCH /api/settlements` + `POST /reconcile` | 정산 + 월별 reconcile |

## 핵심 패턴

### 1. Live Aggregation — profit-loss.service

**ProfitLoss 테이블을 bypass** 한다 — writer 부재로 항상 empty 상태 (dev DB COUNT = 0). 대신 아래 6개 source table 에서 직접 집계:

```
Order (+ shippingPrice)
  └─ OrderLineItem.quantity / totalPrice
       └─ ChannelListingOption → ChannelListing → MasterProduct
  + OrderReturnLineItem (returnCount)
  + ChannelListingDailySnapshot (adSpend per listing, canonical daily spend)
```

**Data flow (3 parallel Promise.all)**:
1. `prisma.order.findMany` — Order + lineItems + listingOption 체인 (I3/I8 패턴 재사용)
2. `prisma.orderReturnLineItem.findMany` — listingId 경유 반품 수 집계
3. `prisma.channelListingDailySnapshot.groupBy({ by: ['listingId'], _sum: { adSpend: true } })` — listing 별 광고비 (daily-fact source-of-truth)

**Shipping 배분**: `Order.shippingPrice` 를 lineItem revenue 비율로 revenue-weighted 분배. 분모 0 guard: 모든 lineItem totalPrice = 0 인 경우 해당 order shipping drop.

**Exit log**: `this.logger.log('profit-loss.findAll', { companyId, year, month, orderCount, listingCount, latencyMs })`.

**Prohibit**: `prisma.profitLoss.*` 호출 금지. `ProductOption.shippingCost` live read 금지 (source-of-truth = `Order.shippingPrice`).

### 2. sales-analysis.service

`getAnalysis(companyId, period?)` — live aggregation via Order + OrderReturnLineItem + ChannelListingDailySnapshot.groupBy. Group key: `ChannelListing.channel` (platform: coupang/naver/wing/...). Return rate uses distinct-order count, INNER JOIN, and 3-hop IDOR guard. Orphan returns (orderId NULL) → `totals.orphanReturnCount` side metric.

`ProfitLoss` table read 제거.

**Exit log**: `this.logger.log('sales-analysis.getAnalysis', { companyId, period, channelCount, totalOrders, totalRevenue, orphanReturnCount, latencyMs })`.

### 3. Period 파싱 — YYYY-MM 형식

profit-loss.service.ts:12-14, sales-analysis.service.ts:16-23:
- 입력: `YYYY-MM` (예: `2026-04`)
- 미입력 시 현재 year/month default
- **날짜 범위 query 미지원** — 월 단위만

### 4. resolvePricing 적용

`common/option-pricing-resolver.ts` 의 `resolvePricing({ option })` 을 listing 별로 적용. `nested-only` 모드 — option data 에서 costPrice/commissionRate/otherCost 추출. master product fallback 가격 반영.

### 5. Channel 집계 (sales-analysis)

`Order.groupBy` (channel via `ChannelListing.channel`) → 채널별 metrics (revenue, cost, profit, return rate, AOV). `profitLoss.groupBy` 제거됨.

## Rules

- 기간은 `YYYY-MM` 만 (date range 미지원)
- 모든 monetary 값은 integer (소수점 없음, KRW)
- Return rate / profit rate 는 **fetch 후 클라이언트 계산** (서비스가 raw 만 반환)
- Period default: 현재 월
- profit 은 **live 집계** 에서 계산. `profitLoss` 테이블 read 금지.

## Prohibits

- ❌ `prisma.profitLoss.*` 호출
- ❌ `ProductOption.shippingCost` live read (source-of-truth = `Order.shippingPrice`)
- ❌ Date range query (월 단위 강제)
- ❌ $queryRaw 에 string concat (parameterized 만)

## Cross-domain deps

- **common/option-pricing-resolver** — `resolvePricing({ option })` (nested-only)
- **common/kst** — `kstMonthStart(year, month)` (KST 월 경계, sales-plans + settlements reconcile)
- **common/per-listing-profit** — `buildPerListingMetrics(...)` (sales-plans `syncActuals`, settlements `reconcile`)
- **prisma** — PrismaService (Order, OrderLineItem, OrderReturnLineItem, ChannelListingDailySnapshot, ManualLedger, ProcessingCost, SupplierPayment, SalesPlan, Settlement, MasterProduct, Supplier, PurchaseOrder)
- `Settlement` Prisma 모델은 **Orders 네임스페이스**, `SupplierPayment` 모델은 **Supply 네임스페이스** — 폴드는 백엔드 모듈 경계만 옮긴 것이며 스키마 namespace 는 그대로

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 새 metric 추가 | `services/profit-loss.service.ts` 또는 `sales-analysis.service.ts` $queryRaw + 응답 타입 + `__tests__/pl-flow.spec.ts` |
| Pricing 로직 변경 | `common/option-pricing-resolver.ts` (resolvePricing) + 호출자 (`profit-loss.service.ts`) |
| Date range 지원 | period 파싱 로직 + DTO + scoped plan/instruction update (현재 월 단위 의도) |
| 채널 추가 | `prisma/schema.prisma` (Company), seed, sales-analysis 그룹핑 |
