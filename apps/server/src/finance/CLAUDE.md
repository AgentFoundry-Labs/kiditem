# finance — P&L + Sales Analysis (Raw SQL Aggregation)

> **⚠ Plan B2 pending (ADR-0013)**: 이 모듈은 Plan A 3-layer 전환 이후 아직 포팅되지 않음. `ProfitLoss.productId` (profit-loss.service.ts:26,29,109 — Plan A 에서 `listingId` 로 rename 예정), `prisma.product.findMany` (profit-loss.service.ts:73 — Product 모델 drop, MasterProduct/ChannelListing 로 분리) 등 **stale Prisma model refs** 가 남아 있어 full server tsc 실패. 아래 본문은 **현재 코드의 실제 동작** 을 기술 (정확하지만 stale 모델 참조 포함). Plan B2 에서 `ChannelListing` + 새 `ProfitLoss.listingId` 기반으로 포팅 예정.

10 파일. **$queryRaw 기반 cross-table 집계** + period parsing + cross-domain pricing resolver.

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

### 1. $queryRaw — Cross-table 집계

`profitLoss + coupangOrders + coupangOrderItems` 조인이 Prisma 표준 API 로 안 되어 raw SQL 사용 (profit-loss.service.ts:54-60). Parameterized binding 필수 (string concat 절대 금지).

### 2. Period 파싱 — YYYY-MM 형식

profit-loss.service.ts:12-14, sales-analysis.service.ts:16-23:
- 입력: `YYYY-MM` (예: `2026-04`)
- 미입력 시 현재 year/month default
- **날짜 범위 query 미지원** — 월 단위만

### 3. resolvePricing 적용

profit-loss.service.ts:3 — `common/master-product-resolver.ts` 의 `resolvePricing()` 을 row 별로 적용. master product fallback 가격 반영.

### 4. Channel 집계 (sales-analysis)

`profitLoss.groupBy({ by: 'companyId' })` + company name join → 채널별 metrics (revenue, cost, profit, return rate, AOV).

## Rules

- 기간은 `YYYY-MM` 만 (date range 미지원)
- 모든 monetary 값은 integer (소수점 없음, KRW)
- Return rate / profit rate 는 **fetch 후 클라이언트 계산** (서비스가 raw 만 반환)
- Period default: 현재 월
- profit 계산 자체는 DB profitLoss 테이블에 이미 있음 (서비스에서 재계산 금지)

## Prohibits

- ❌ 서비스에서 profit 재계산 (DB 값 사용)
- ❌ Date range query (월 단위 강제)
- ❌ $queryRaw 에 string concat (parameterized 만)

## Cross-domain deps

- **common** — `resolvePricing` helper
- **prisma** — PrismaService

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 새 metric 추가 | `services/profit-loss.service.ts` 또는 `sales-analysis.service.ts` $queryRaw + 응답 타입 + `__tests__/pl-flow.spec.ts` |
| Pricing 로직 변경 | `common/master-product-resolver.ts` (resolvePricing) + 호출자 (`profit-loss.service.ts:3`) |
| Date range 지원 | period 파싱 로직 + DTO + ADR (현재 월 단위 의도) |
| 채널 추가 | `prisma/schema.prisma` (Company), seed, sales-analysis 그룹핑 |
