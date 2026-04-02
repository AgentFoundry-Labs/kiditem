---
name: db-query
description: >
  PostgreSQL 쿼리 실행 패턴. psql CLI를 사용하여 KidItem DB에서
  상품, 주문, 광고, 재고 데이터를 조회.
---

# DB Query Skill

## 연결 방법

DB URL은 환경변수 `DATABASE_URL`에서 가져옴.

```bash
psql "$DATABASE_URL" -t -A -F '|' -c "SELECT ..."
```

- `-t`: 튜플만 (헤더 제외)
- `-A`: 정렬 없음 (unaligned)
- `-F '|'`: 구분자

## 주요 테이블

| 테이블 | 용도 | 주요 컬럼 |
|--------|------|-----------|
| `products` | 상품 마스터 | id, name, abc_grade, ad_tier, status, sell_price, cost_price, health_score |
| `inventory` | 재고 (product_id 1:1) | product_id, current_stock, daily_sales_avg |
| `ads` | 광고 실적 (일별) | product_id, date, spend, revenue, roas, impressions, clicks, conversions |
| `profit_loss` | 월별 손익 | product_id, year, month, revenue, net_profit, profit_rate, ad_cost, order_count |
| `reviews` | 리뷰 | product_id, rating, content, created_at |
| `orders` | 주문 | product_id, order_date, quantity, amount |
| `alerts` | 알림 | company_id, product_id, type, severity, title |
| `activity_events` | 활동 로그 | company_id, type, title, metadata |

## 필수 조건

모든 쿼리에 다음 조건 포함:
- `company_id = '{{company_id}}'` (멀티테넌트)
- `p.is_deleted = false` (소프트 삭제)

## 조인 패턴

```sql
-- 상품 + 재고 + 광고 (14일)
SELECT p.id, p.name, p.abc_grade,
       COALESCE(i.current_stock, 0) as stock,
       COALESCE(SUM(a.spend), 0) as spend_14d
FROM products p
LEFT JOIN inventory i ON i.product_id = p.id
LEFT JOIN ads a ON a.product_id = p.id AND a.date >= CURRENT_DATE - 14
WHERE p.company_id = '{{company_id}}' AND p.is_deleted = false
GROUP BY p.id, p.name, p.abc_grade, i.current_stock

-- 상품 + 월별 손익
SELECT p.id, p.name,
       pl.revenue, pl.net_profit, pl.profit_rate
FROM products p
LEFT JOIN profit_loss pl ON pl.product_id = p.id
  AND pl.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND pl.month = EXTRACT(MONTH FROM CURRENT_DATE)::int
WHERE p.company_id = '{{company_id}}' AND p.is_deleted = false
```

## 주의사항

- NULL 값은 COALESCE로 기본값 처리
- 금액 단위: KRW (원)
- profit_rate는 0~1 범위 (퍼센트 변환: * 100)
- 재고 소진일 = current_stock / daily_sales_avg (daily_sales_avg가 0이면 999)
