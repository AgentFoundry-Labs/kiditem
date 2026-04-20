---
id: 0016
title: profit-loss Live Aggregation (ProfitLoss Table Bypass)
status: Accepted
date: 2026-04-20
supersedes: []
superseded-by: null
affects:
  - apps/server
  - apps/server/src/finance
---

# ADR-0016: profit-loss Live Aggregation (ProfitLoss Table Bypass)

**Predecessors**: [ADR-0013](0013-product-schema-3layer.md) (3-layer schema), [ADR-0015](0015-order-schema-unification.md) (Order schema unification), Plan D.1

## Context

`ProfitLoss` 테이블은 B2c.orders (#32) 에서 listingId-primary schema 로 재정렬되었으나 **production writer 가 존재하지 않음**을 Plan D v3 investigation 에서 확인:

- `prisma.profitLoss.(create|upsert|update)` production grep 0건 (test fixture only)
- `catalog.ts:373` `calculate.profit_loss` node type 선언은 있으나 `builtin.ts` 에 executor 미등록
- `init.sql.gz` INSERT 0건
- dev DB `SELECT COUNT(*) FROM profit_loss` = 0 rows

결과적으로 `/api/profit-loss` 는 빈 배열 리턴. frontend rewire 만으로는 사용자 가치 부재.

## Decision

`/api/profit-loss` = `ProfitLossService.findAll(companyId, year, month)` 를 **live aggregation** 으로 재작성한다. `ProfitLoss` 테이블 read-path 를 제거하고 `Order + OrderLineItem + ChannelListingOption.listing + MasterProduct + OrderReturnLineItem + Ad` 집계로 `PLData[]` 를 생성한다.

### Data flow
- Relation path: `OrderLineItem.listingOption` (→ `ChannelListingOption`) `.listing` (→ `ChannelListing`) `.master` (→ `MasterProduct`)
- Return count: `OrderReturnLineItem` → `orderLineItem.listingOption.listingId` 경유 listing 별 count
- Ad cost: `Ad` 테이블 (canonical, companyId + listingId non-null): `prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true }, where: { companyId, date: { gte, lt } } })`
- 3 query `Promise.all` 병렬 (data dep 없음)

### Aggregation patterns (B2c.orders 재사용)
- I3 canonical: `SUM(OrderLineItem.totalPrice)` per listing
- I8 half-open: `gte: from, lt: to`
- I7 companyId via `@CurrentCompany()` caller
- `kstMonthStart(year, month + 1)` (helper 가 `month === 13` wrap 자체 처리)
- `resolvePricing({ option })` nested-only

### Shipping allocation — **revenue-weighted** (v4)
한 order 에 여러 listing lineItem 이 있을 때, `Order.shippingPrice` 를 **lineItem revenue 비율** 로 listing 에 분배:
```
listing_k.shippingCost += order.shippingPrice × (li.totalPrice / order.totalRevenue)
```
기존 "first-listing heuristic" (전액 첫 listing) 폐기 — per-listing P&L 편향 제거.

### Response shape
- `PLData` schema (packages/shared) 변경 없음 — frontend consumer backward compat.

`ProfitLoss` 테이블 자체는 drop 하지 않는다. legacy data 보존 용도 유지. Plan E 에서 writer 신설 시 cache 로 재활용 가능.

## Consequences

**긍정**
- `/api/profit-loss` 가 실제 데이터를 즉시 반영 (writer 없음 문제 우회).
- Shipping source-of-truth 가 `Order.shippingPrice` 1곳에 고정. profit-calculator (dashboard path) 와 profit-loss (finance path) 가 같은 값을 참조.
- B2c.orders 의 확립 패턴 (I3/I8) 재사용 → 일관성.
- Shipping allocation 편향 제거 (revenue-weighted).

**부정**
- 월 1회 조회 기준 O(orders × lineItems) scan 발생. 월간 orders 수백~수천 가정 → Promise.all 병렬로 수용 가능. T6 1000-order baseline 측정 결과 scale 증가 시 Plan E 에서 cache 도입.
- Historical snapshot 성질 상실 (live read 는 과거 주문 변경 시 값도 변한다). Plan E 에서 writer 복원 시 snapshot 성질도 복원.
- **Other ProfitLoss readers 는 이 ADR 범위 밖** — 아래 § "Scope boundaries" 참조.
- **Current-month ad-cost divergence** (architect C-3): `profit-calculator.ts` (dashboard path) 는 AdSnapshot pro-rating (현재월 부분기간 보정) + Ad 테이블 fallback. `profit-loss.service` (finance path) 는 **Ad 테이블 전용**. 현재월 조회 시 두 path 가 동일 listing 에 대해 다른 adCost 를 보여줄 수 있음. 의도된 차이 — dashboard 는 in-flight 현황, finance 는 완결된 회계. Plan D.x 에서 통일 검토 가능.
- **Zero-revenue shipping edge** (architect C-4): order 의 모든 lineItem 이 `totalPrice === 0` (무료 샘플/증정) 인데 `shippingPrice > 0` 인 경우, revenue-weighted 할당 분모가 0 → 현재 guard `orderTotalRevenue > 0` 로 **해당 order 의 shipping 은 어떤 listing 에도 할당되지 않고 drop**. semantics 상 합리적 (무료 물품에 비용 부담 없음) 이지만 집계 손실은 있음. 드문 경우라 수용.

## Scope boundaries — Other ProfitLoss readers

ProfitLoss 테이블을 read 하는 다른 service **8개** 는 이 ADR 범위 밖 (writer 부재로 empty state 상태, 현재 각 page 에서 빈 데이터 표시 중):

| Service | Path | Reads | Migration plan |
|---|---|---|---|
| statistics (× 5 call) | `statistics/statistics.service.ts:30,60,93,224,258` | aggregate/findMany | D.3 에서 live aggregation 전환 |
| settlements | `settlements/settlements.service.ts:49` | findMany (reconcile) | D.4 에서 결정 |
| sales-plans | `sales-plans/sales-plans.service.ts:84` | aggregate | D.3 에서 전환 |
| sales-analysis | `finance/services/sales-analysis.service.ts:27` | groupBy | D.3 에서 전환 |
| ad-strategy | `advertising/services/ad-strategy.service.ts:410` | findMany | Plan E (workflow 관련) |
| dashboard-inventory | `dashboard/services/dashboard-inventory.service.ts:54` | findMany | D.4 검토 |
| dashboard-trend | `dashboard/services/dashboard-trend.service.ts:17` | aggregate | D.4 검토 |
| action-task (× 2) | `action-task/action-task.service.ts:32,464` | findMany | D.5 검토 |

D.1 merge 후 이 서비스들이 feed 하는 UI page 들은 **여전히 empty data** 표시. 각 phase 가 migrate 하거나 Plan E 에서 writer 복원으로 일괄 해결.

## Alternatives considered

- **A** `calculate.profit_loss` workflow executor 구현 + monthly reconcile cron — Plan D.1 scope 2~3 배. Plan E 로 defer.
- **C** ProfitLoss 테이블 staleness 인정, 사용자 수동 trigger — UX 나쁨. 기각.

## Enforcement

- `profit-loss.service.ts` 는 `prisma.profitLoss.*` 호출 금지. PR 검토 시 grep.
- `shippingCost` source-of-truth 는 `Order.shippingPrice` 로 고정. `ProductOption.shippingCost` 는 live read 경로에서 사용 금지 (legacy code 가 참조하면 rewrite).
- 이 ADR 을 뒤집으려면 새 ADR + Plan E writer 신설. Plan E 는 (1) 8 readers 전부 cache 로 migrate, (2) writer semantics (refresh cadence, current-month partial data 처리), (3) 본 ADR supersede 를 모두 포함해야 함.
