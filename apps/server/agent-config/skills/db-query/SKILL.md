---
name: db-query
description: >
  Deprecated. Direct DB query access is disabled; agents must use server-provided
  context and backend application ports.
---

# DB Query Skill (Deprecated)

Direct PostgreSQL access from agents is disabled. Do not use `psql`,
`AGENT_DATABASE_URL`, `DATABASE_URL`, or raw SQL from an agent process.

Agent data must be supplied by NestJS application services after
organization-scoped authorization has already run. If required data is missing,
return a concise request for the missing backend-provided context.

## 주요 테이블

| 테이블 | 용도 | 핵심 컬럼 |
|---|---|---|
| products | 상품 마스터 | id, name, abc_grade, ad_tier, status, is_deleted, health_score |
| inventory | 재고 (product 1:1) | product_id, current_stock, daily_sales_avg |
| ads | 광고 실적 (일별) | product_id, date, spend, revenue, impressions, clicks, conversions |
| profit_loss | 월별 손익 | product_id, year, month, revenue, net_profit, profit_rate, ad_cost |
| reviews | 리뷰 | product_id, rating, content |
| thumbnails | 썸네일 CTR | product_id, ctr, measured_at |
| alerts | 알림 | organization_id, product_id, type, severity, title |

## 규칙

- `organization_id`로 항상 필터링 (멀티 테넌시)
- `is_deleted = false` 조건 필수
- 날짜 범위: `CURRENT_DATE - N` 형식
- 결과가 많을 때 `LIMIT` 사용
- NULL 처리: `COALESCE(값, 0)`
- 필요한 데이터를 직접 판단하여 쿼리하세요. 하드코딩된 쿼리를 따르지 않아도 됩니다.
