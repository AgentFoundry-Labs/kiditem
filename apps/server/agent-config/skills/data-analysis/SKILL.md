---
name: data-analysis
description: >
  이커머스 데이터 분석 패턴. 매출, 광고, 재고, 리뷰 데이터를 조합하여
  상품 성과를 진단하고 액션을 추천.
---

# Data Analysis Skill

## 분석 프레임워크

### 1. 상품 성과 진단

```sql
-- 상품별 종합 성과 (매출 + 광고 + 재고 + 리뷰)
SELECT p.id, p.name, p.abc_grade, p.health_score,
       pl.revenue, pl.net_profit, pl.profit_rate,
       pl.ad_cost,
       CASE WHEN pl.revenue > 0 THEN ROUND(pl.ad_cost::decimal / pl.revenue * 100, 1) ELSE 0 END as ad_rate,
       i.current_stock, i.daily_sales_avg,
       CASE WHEN i.daily_sales_avg > 0 THEN ROUND(i.current_stock / i.daily_sales_avg) ELSE 999 END as days_of_stock,
       (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count,
       (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id) as avg_rating
FROM products p
LEFT JOIN profit_loss pl ON pl.product_id = p.id
  AND pl.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND pl.month = EXTRACT(MONTH FROM CURRENT_DATE)::int
LEFT JOIN inventory i ON i.product_id = p.id
WHERE p.company_id = '{{company_id}}' AND p.is_deleted = false
ORDER BY pl.revenue DESC NULLS LAST
```

### 2. 핵심 지표 해석

| 지표 | 좋음 | 경고 | 위험 |
|------|------|------|------|
| 이익률 (profit_rate) | > 30% | 10~30% | < 10% |
| 광고비율 (ad_rate) | < 10% | 10~20% | > 20% |
| 재고일수 (days_of_stock) | 14~60일 | 7~14일 또는 60~90일 | < 7일 또는 > 90일 |
| ROAS | > 2.0 | 1.0~2.0 | < 1.0 |
| 리뷰 평점 | > 4.0 | 3.5~4.0 | < 3.5 |

### 3. 원인-결과 분석 패턴

- **매출 하락** → 주문수 확인 → 광고 노출/클릭 확인 → 재고 확인 → 가격 경쟁력 확인
- **이익률 하락** → 원가 변동 확인 → 광고비 증가 확인 → 할인 이벤트 확인
- **재고 부족** → 일평균 판매량 확인 → 입고 예정 확인 → 긴급 발주 필요 여부

### 4. 추천 액션 우선순위

| 우선순위 | 조건 | 액션 |
|----------|------|------|
| P0 (즉시) | 재고 0 + 판매 중 | 판매 중지 또는 긴급 발주 |
| P0 (즉시) | 적자 + 광고 집행 | 광고 즉시 중단 |
| P1 (이번 주) | ROAS < 0.8 지속 | 광고 전략 재검토 |
| P2 (이번 달) | 이익률 < 10% | 가격/원가 구조 개선 |
| P3 (모니터링) | 리뷰 평점 하락 | 품질/CS 개선 |
