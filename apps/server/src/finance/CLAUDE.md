# finance — P&L + Sales Analysis (Live Aggregation)

> **Plan D.1 완료 (ADR-0016)**: `profit-loss.service.ts` 가 live aggregation 으로 재작성됨 (2026-04-20). `ProfitLoss` 테이블 read-path 는 제거. `ProfitLoss` 테이블 자체는 drop 하지 않음 (legacy data 보존, Plan E 에서 writer 신설 시 cache 재활용 가능). **8개 other readers** (statistics × 5, settlements, sales-plans, sales-analysis, ad-strategy, dashboard-inventory, dashboard-trend, action-task × 2) 는 ADR-0016 scope 밖 — 각 D.3/D.4/D.5/Plan E phase 에서 migration.

10 파일. **Prisma ORM 기반 live cross-table 집계** + period parsing + cross-domain pricing resolver.

## Directory

```
finance/
├── controllers/   # profit-loss, sales-analysis (2개)
├── services/      # profit-loss, sales-analysis, types
├── dto/           # 2 query DTO
├── __tests__/     # pl-flow.spec.ts
└── finance.module.ts
```

## Routes

| Route | 책임 |
|---|---|
| `GET /api/profit-loss` | 기간별 P&L (회사 집계) |
| `GET /api/sales-analysis` | 채널 단위 revenue/cost/profit breakdown |

## 핵심 패턴

### 1. Live Aggregation — profit-loss.service (ADR-0016, Plan D.1 T5)

**ProfitLoss 테이블을 bypass** 한다 — writer 부재로 항상 empty 상태 (dev DB COUNT = 0). 대신 아래 6개 source table 에서 직접 집계:

```
Order (+ shippingPrice)
  └─ OrderLineItem.quantity / totalPrice
       └─ ChannelListingOption → ChannelListing → MasterProduct
  + OrderReturnLineItem (returnCount)
  + Ad (adCost per listing, canonical daily spend)
```

**Data flow (3 parallel Promise.all)**:
1. `prisma.order.findMany` — Order + lineItems + listingOption 체인 (I3/I8 패턴 재사용)
2. `prisma.orderReturnLineItem.findMany` — listingId 경유 반품 수 집계
3. `prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true } })` — listing 별 광고비

**Shipping 배분**: `Order.shippingPrice` 를 lineItem revenue 비율로 revenue-weighted 분배. 분모 0 guard: 모든 lineItem totalPrice = 0 인 경우 해당 order shipping drop (ADR-0016 §zero-revenue edge).

**Exit log**: `this.logger.log('profit-loss.findAll', { companyId, year, month, orderCount, listingCount, latencyMs })`.

**Prohibit (ADR-0016 Enforcement)**: `prisma.profitLoss.*` 호출 금지. `ProductOption.shippingCost` live read 금지 (source-of-truth = `Order.shippingPrice`).

> sales-analysis.service.ts 는 여전히 `prisma.profitLoss.groupBy` (D.3 migration 예정). 건드리지 말 것.

### 2. Period 파싱 — YYYY-MM 형식

profit-loss.service.ts:12-14, sales-analysis.service.ts:16-23:
- 입력: `YYYY-MM` (예: `2026-04`)
- 미입력 시 현재 year/month default
- **날짜 범위 query 미지원** — 월 단위만

### 3. resolvePricing 적용

`common/option-pricing-resolver.ts` 의 `resolvePricing({ option })` 을 listing 별로 적용. `nested-only` 모드 — option data 에서 costPrice/commissionRate/otherCost 추출. master product fallback 가격 반영.

### 4. Channel 집계 (sales-analysis)

`profitLoss.groupBy({ by: 'companyId' })` + company name join → 채널별 metrics (revenue, cost, profit, return rate, AOV).

## Rules

- 기간은 `YYYY-MM` 만 (date range 미지원)
- 모든 monetary 값은 integer (소수점 없음, KRW)
- Return rate / profit rate 는 **fetch 후 클라이언트 계산** (서비스가 raw 만 반환)
- Period default: 현재 월
- profit 은 **live 집계** 에서 계산 (ADR-0016). `profitLoss` 테이블 read 금지.

## Prohibits

- ❌ `prisma.profitLoss.*` 호출 (ADR-0016 enforcement)
- ❌ `ProductOption.shippingCost` live read (source-of-truth = `Order.shippingPrice`)
- ❌ Date range query (월 단위 강제)
- ❌ $queryRaw 에 string concat (parameterized 만)

## Cross-domain deps

- **common/option-pricing-resolver** — `resolvePricing({ option })` (nested-only)
- **common/kst** — `kstMonthStart(year, month)` (KST 월 경계)
- **prisma** — PrismaService (Order, OrderLineItem, OrderReturnLineItem, Ad)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 새 metric 추가 | `services/profit-loss.service.ts` 또는 `sales-analysis.service.ts` $queryRaw + 응답 타입 + `__tests__/pl-flow.spec.ts` |
| Pricing 로직 변경 | `common/option-pricing-resolver.ts` (resolvePricing) + 호출자 (`profit-loss.service.ts`) |
| Date range 지원 | period 파싱 로직 + DTO + ADR (현재 월 단위 의도) |
| 채널 추가 | `prisma/schema.prisma` (Company), seed, sales-analysis 그룹핑 |
