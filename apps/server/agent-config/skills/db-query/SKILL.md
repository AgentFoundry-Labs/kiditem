---
name: db-query
description: >
  PostgreSQL 쿼리 실행 패턴. psql CLI를 사용하여 KidItem DB에서
  상품, 주문, 광고, 재고 데이터를 조회.
---

# DB Query Skill

## 연결

DB URL은 프롬프트의 `{{db_url}}` 변수로 제공됨.

```bash
psql "{{db_url}}" -t -A -F '|' -c "SELECT ..."
```

## 주요 테이블

| 테이블 | 용도 | 핵심 컬럼 |
|---|---|---|
| products | 상품 마스터 | id, name, abc_grade, ad_tier, status, is_deleted, health_score |
| inventory | 재고 (product 1:1) | product_id, current_stock, daily_sales_avg |
| ads | 광고 실적 (일별) | product_id, date, spend, revenue, impressions, clicks, conversions |
| profit_loss | 월별 손익 | product_id, year, month, revenue, net_profit, profit_rate, ad_cost |
| reviews | 리뷰 | product_id, rating, content |
| thumbnails | 썸네일 CTR | product_id, ctr, measured_at |
| alerts | 알림 | company_id, product_id, type, severity, title |

## 규칙

- `company_id`로 항상 필터링 (멀티 테넌시)
- `is_deleted = false` 조건 필수
- 날짜 범위: `CURRENT_DATE - N` 형식
- 결과가 많을 때 `LIMIT` 사용
- NULL 처리: `COALESCE(값, 0)`
