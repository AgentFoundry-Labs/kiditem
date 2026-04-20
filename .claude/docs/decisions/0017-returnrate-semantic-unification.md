---
id: 0017
title: returnRate Semantic Unification + Orphan Return Policy
status: Accepted
date: 2026-04-20
supersedes: []
superseded-by: null
affects:
  - apps/server/src/channels
---

# ADR-0017: returnRate Semantic Unification + Orphan Return Policy

**Related**: [ADR-0015](0015-order-schema-unification.md) (Order schema unification), [ADR-0016](0016-profit-loss-live-aggregation.md) (profit-loss live aggregation), Plan D.2

## Context

`channel-dashboard.getReturnSummary` 는 현재:

```
returnRate = count(OrderReturn WHERE requestedAt ∈ [from, to])
           / count(Order WHERE orderedAt ∈ [from, to])
```

**문제**: 분자·분모가 서로 다른 집합. Past-period 에 주문된 건이 current period 에 반품되면 current 분자 포함, 해당 order 는 current 분모 없음 → `returnRate > 100%` 가능. 기존 PG integration test (`channel-dashboard.pg.integration.spec.ts:447`) 는 이 버그를 `returnRate≈1.5` 로 정답처럼 잠가놓은 상태.

또한 `OrderReturn.orderId` 는 `String?` (nullable) — 원본 order 를 알 수 없는 고아 return 이 존재 가능. Nullable 원인: `@onDelete: SetNull` on `Order` 삭제, 또는 과거 sync 시점 미매칭 data.

## Decision

### Semantic 재정의

`returnRate` = **"이 기간 내 주문된 건 중 반품된 비율"** (denominator = orders in period, numerator = returns whose underlying order is in period).

### Implementation — Prisma relation filter (Option A)

```ts
const [orderCount, returnCount, orphanReturnCount] = await Promise.all([
  prisma.order.count({ where: { companyId, orderedAt: { gte: from, lt: to } } }),
  prisma.orderReturn.count({
    where: {
      companyId,
      order: { companyId, orderedAt: { gte: from, lt: to } },  // ← 2-hop IDOR safety
    },
  }),
  prisma.orderReturn.count({
    where: {
      companyId,
      orderId: null,
      requestedAt: { gte: from, lt: to },
    },
  }),
]);
```

**IDOR 2-hop**: `orderReturn.companyId === orderReturn.order.companyId` 는 schema level 제약 없음. `order: { companyId, orderedAt }` 둘 다 명시하여 cross-tenant JOIN 차단.

### Orphan return policy — (c) side metric

`OrderReturn.orderId IS NULL` 인 row 는 **메인 returnRate 집계에 포함하지 않는다**. 대신 별도 필드:

```ts
interface ReturnSummary {
  orderCount: number;            // orders in period
  returnCount: number;           // returns whose order.orderedAt ∈ period
  returnRate: number;            // returnCount / orderCount (0~1)
  orphanReturnCount: number;     // NEW — orphans (orderId NULL) whose requestedAt ∈ period
}
```

**Temporal basis mix** (의도적): 메인은 `orderedAt` 기준, orphan 은 `requestedAt` 기준 (원본 order 가 없으니 requestedAt 외 선택지 없음). Frontend 가 orphan 노출 시 이 차이를 tooltip 으로 설명.

### 대안 옵션 (기각)

- **(a) Drop silently** — orphan 이 보이지 않아 데이터 무결성 조사 경로 상실
- **(b) Group orphans by requestedAt for main** — 기준 혼합, 해석 어려움

### Scope — sales-analysis.service 수렴은 D.3 로 defer

`sales-analysis.service.ts:70` 는 현재 `prisma.profitLoss.groupBy` 를 읽어 returnRate 를 계산하지만, ProfitLoss 테이블은 writer 부재로 항상 0 반환 (ADR-0016 § Scope boundaries). 즉:

- **오늘**: sales-analysis.returnRate = 0 (데이터 부재로 의미 없는 값)
- **ADR-0017 시행 후**: channel-dashboard.returnRate 는 live 실측, sales-analysis.returnRate 여전히 0

**결정**: ADR-0017 은 channel-dashboard 단일 source 로 **정의만** 확립한다. sales-analysis 는 D.3 에서 live aggregation 으로 전환되며 같은 semantic 을 적용한다. D.3 plan 에서 본 ADR 을 명시 참조 의무.

## Consequences

**긍정**
- returnRate 100% 초과 불가능 (INNER JOIN 보장)
- "이 기간 주문 얼마나 반품되나" 비즈니스 질문에 정확히 대응
- Orphan 투명성 확보 (숨기지 않음)
- 2-hop IDOR 필터로 cross-tenant JOIN 방지 (ADR-0006 준수)

**부정**
- **Semantic 전환 혼란**: 기존 대시보드 수치와 달라짐 → release note 필수 (Plan D.2 T4 산출물)
- **Historical comparability 일시 상실**: 과거 캡처와 비교 어려움. MoM/YoY 기준일 주의
- **Late return (live read)**: 수개월 뒤 반품 발생 시 과거 period returnRate 도 retrospectively 변함. Snapshot 성질 상실 — Plan E 에서 writer/cache 검토 영역
- **Orphan 규모 불확정**: 운영 환경 orphan 건수에 따라 side metric UX 영향 — 실행 전 dev/stg DB 쿼리 권장
- **sales-analysis 일시 divergence**: D.3 전까지 channel-dashboard.returnRate (live) 와 sales-analysis.returnRate (0 from empty table) 값이 다름. 의도된 차이 — 두 지표가 같은 UI 에 함께 뜨는 곳 없음. D.3 에서 수렴

## Enforcement

- `channel-dashboard.service.getReturnSummary` 는 본 ADR 의 쿼리 형태를 따른다 (Prisma relation filter + 2-hop companyId)
- Orphan count 는 `requestedAt` 기준으로만 계산 — 메인 returnRate 계산에서 사용 금지
- **D.3**: `sales-analysis.service:70` 를 live aggregation 으로 전환 시 본 ADR semantic 적용 + 본 ADR 참조 필수
- 본 ADR 을 뒤집으려면 새 ADR + channel-dashboard 동시 변경 + frontend 소비 adjust
- PR 검토 시 `grep -n "returnRate" apps/server/src/` 로 3번째 구현 추가 없는지 확인

## Migration

`ReturnSummary` 에 `orphanReturnCount: number` 추가 (non-breaking — consumer 미사용 OK). `@kiditem/shared` 에 `ReturnSummarySchema` Zod 신설 (Plan D.2 T2).
