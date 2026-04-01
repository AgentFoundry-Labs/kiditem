# 상품 건강도 평가 규칙

이 문서는 상품 건강도(healthScore) 평가의 규칙 정의. 규칙 추가/수정 = 이 문서 수정.

## 평가 방법

1. 모든 활성 상품에 대해 아래 규칙을 적용
2. 위반 시 severity에 따라 감점:
   - **critical**: -25점
   - **warning**: -10점
   - **info**: -3점
3. `healthScore = 100 - 총 감점` (최소 0)
4. 같은 필드에 여러 규칙 위반 시 가장 높은 severity만 적용 (중복 제거)
5. 데이터가 없는 필드(null)는 해당 규칙 스킵

## 건강도 등급

| 등급 | 점수 범위 | 의미 |
|------|-----------|------|
| 정상 | 70~100 | 관리 양호 |
| 주의 | 40~69 | 개선 필요 |
| 위험 | 0~39 | 즉시 조치 필요 |

---

## 수익성 (profitability)

| 규칙명 | 조건 | severity | 메시지 | 액션 |
|--------|------|----------|--------|------|
| 적자 상품 감지 | profitRate < 0% | critical | 순이익률 {값}% — 즉시 아웃 검토 필요 | review_pricing |
| 저이익 상품 감지 | profitRate ≤ 3% | warning | 순이익률 {값}% — 개선 또는 정리 판단 필요 | review_pricing |
| 마진율 부족 | margin < 30% | warning | 마진율 {값}% — 30% 미만 | review_pricing |
| 원가율 과다 | costRate ≥ 70% | warning | 원가율 {값}% — 소싱처 변경 검토 | review_pricing |
| 매출 없음 | revenue ≤ 0 | warning | 매출 없음 — 노출/광고 상태 확인 필요 | check_listing |
| 순손실 과다 | netProfit < -50,000원 | critical | 순손실 {값}원 — 긴급 검토 필요 | stop_sales |
| 원가 > 판매가 | margin < 0% | critical | 원가가 판매가보다 높음 — 즉시 가격 조정 필요 | review_pricing |
| 손익분기 위험 | profitRate ≤ 1% | info | 순이익률 {값}% — 손익분기점 근접 | — |

## 광고 (advertising)

| 규칙명 | 조건 | severity | 메시지 | 액션 |
|--------|------|----------|--------|------|
| 광고비율 초과 | adRate > 15% | warning | 광고비율 {값}% — 15% 초과 | reduce_ad_bid |
| 광고비율 위험 | adRate > 25% | critical | 광고비율 {값}% — 즉시 광고 중단 검토 | stop_ads |
| A등급 광고 미배정 | abcGrade = 'A' AND adCostRate ≤ 0 | info | A등급이지만 광고 미배정 — 광고 배정 검토 | assign_ad |
| C등급 광고 과다 | abcGrade = 'C' AND adRate > 5% | warning | C등급 상품에 광고비 {값}% — 광고 축소 검토 | reduce_ad_bid |
| 적자+광고 집행 | profitRate < 0 AND adCostRate > 0 | critical | 적자 상품에 광고비 {값}% 집행 중 — 즉시 중단 | stop_ads |
| 광고비만 소진 | adRate > 100% | warning | 광고비만 소진, 매출 없음 — 광고 효율 점검 | stop_ads |
| ROAS 저조 | adRate > 20% | warning | 광고비율 {값}% — ROAS 저조, 키워드/입찰가 조정 | reduce_ad_bid |
| B등급 광고 미배정 | abcGrade = 'B' AND adCostRate ≤ 0 | info | B등급 광고 미배정 — 2차 광고 배정 검토 | assign_ad |
| 광고 예산 초과 | adRate > 30% | critical | 광고비 {값}% — 예산 한도 초과, 즉시 조정 | stop_ads |
| 광고 효율 점검 | adRate > 10% | info | 광고비율 {값}% — 효율 모니터링 필요 | — |

## 재고 (inventory)

| 규칙명 | 조건 | severity | 메시지 | 액션 |
|--------|------|----------|--------|------|
| 품절 | currentStock ≤ 0 | critical | 재고 0 — 품절 상태. 긴급 발주 필요 | create_purchase_order |
| 재고 부족 | currentStock ≤ 10 | warning | 재고 {값}개 — 발주점 이하, 발주 추천 | create_purchase_order |
| 7일 내 품절 예상 | daysOfStock < 7 | critical | {값}일 후 품절 예상 — 긴급 발주 필요 | create_purchase_order |
| 14일 내 품절 예상 | daysOfStock < 14 | warning | {값}일 후 품절 예상 — 발주 계획 수립 | create_purchase_order |
| 과재고 (90일+) | daysOfStock > 90 | info | 재고 {값}일분 — 과재고, 프로모션 검토 | create_promotion |
| 장기 과재고 (180일+) | daysOfStock > 180 | warning | 재고 {값}일분 — 장기 과재고, 할인/번들 판매 검토 | create_promotion |
| 재고 있으나 판매 없음 | avgDailySales ≤ 0 (재고 있을 때) | warning | 재고 보유 중이나 판매 없음 — 리스팅 확인 | check_listing |
| 안전재고 미달 | currentStock ≤ 5 | warning | 재고 {값}개 — 안전재고 미달 | create_purchase_order |

## 피드백 (feedback)

| 규칙명 | 조건 | severity | 메시지 | 액션 |
|--------|------|----------|--------|------|
| 리뷰 없음 | reviewCount ≤ 0 | info | 리뷰 없음 — 리뷰 확보 캠페인 필요 | request_review |
| A등급 리뷰 부족 | abcGrade = 'A' AND reviewCount < 10 | warning | A등급이지만 리뷰 {값}개 — 리뷰 확보 시급 | request_review |
| 리뷰 부족 | reviewCount < 5 | info | 리뷰 {값}개 — 5개 미만, 확보 검토 | request_review |
| 클릭률 저조 | thumbnailCTR < 1.5% | warning | CTR {값}% — 1.5% 미만, 썸네일 교체 검토 | change_thumbnail |
| 클릭률 위험 | thumbnailCTR < 0.5% | critical | CTR {값}% — 0.5% 미만, 즉시 썸네일 교체 | change_thumbnail |
| 고CTR 상품 기회 | thumbnailCTR > 5% | info | CTR {값}% — 높은 클릭률, 전환 최적화 기회 | — |
| 리뷰 성장 필요 | reviewCount < 20 | info | 리뷰 {값}개 — 매출 대비 리뷰 부족 | request_review |
| CTR 모니터링 | thumbnailCTR < 2.5% | info | CTR {값}% — 개선 여지 있음 | — |

## 주문 (order)

| 규칙명 | 조건 | severity | 메시지 | 액션 |
|--------|------|----------|--------|------|
| 대량 주문 상품 | orderCount ≥ 50 | info | 주문 {값}건 — 핵심 상품 관리 강화 필요 | upgrade_grade |
| 주문 없음 | orderCount ≤ 0 | warning | 주문 없음 — 노출/가격 경쟁력 점검 | check_listing |
| 주문 저조 | orderCount < 5 | info | 주문 {값}건 — 판매 활성화 필요 | create_promotion |
| 취소율 과다 | cancelRate ≥ 10% | warning | 취소율 {값}% — 품질/배송 점검 필요 | review_quality |
| 취소율 위험 | cancelRate ≥ 20% | critical | 취소율 {값}% — 즉시 원인 분석 필요 | review_quality |
| 반품율 경고 | returnRate ≥ 5% | warning | 반품율 {값}% — 상품 설명/품질 점검 | review_quality |
| 핵심상품 후보 | orderCount ≥ 100 | info | 주문 {값}건 — A등급 승격 + 재고 확보 검토 | upgrade_grade |
| 주문 급증 | orderCount ≥ 200 | warning | 주문 {값}건 급증 — 재고/품질 관리 강화 | create_purchase_order |
| 휴면 상품 | orderCount ≤ 0 (재고 있을 때) | info | 주문 없음 + 재고 보유 — 정리 또는 프로모션 검토 | create_promotion |

---

## DB 조회 쿼리 참조

상품별 평가에 필요한 데이터 필드:

```sql
SELECT
  p.id, p.name, p.abc_grade, p.ad_tier,
  p.cost_price, p.sell_price,
  -- 손익
  pl.revenue, pl.net_profit,
  ROUND(pl.profit_rate * 100, 1) as profit_rate_pct,
  pl.ad_cost, pl.order_count, pl.return_count,
  CASE WHEN pl.revenue > 0 THEN ROUND(pl.ad_cost::decimal / pl.revenue * 100, 1) ELSE 0 END as ad_rate,
  -- 재고
  COALESCE(i.current_stock, 0) as current_stock,
  COALESCE(i.daily_sales_avg, 0) as avg_daily_sales,
  CASE
    WHEN COALESCE(i.current_stock, 0) = 0 THEN 0
    WHEN COALESCE(i.daily_sales_avg, 0) > 0 THEN ROUND(i.current_stock / i.daily_sales_avg)
    ELSE 999
  END as days_of_stock,
  -- 리뷰
  (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count,
  -- 썸네일 CTR
  (SELECT ROUND(t.ctr * 100, 2) FROM thumbnails t WHERE t.product_id = p.id ORDER BY t.measured_at DESC LIMIT 1) as thumbnail_ctr
FROM products p
LEFT JOIN profit_loss pl ON pl.product_id = p.id
  AND pl.year = EXTRACT(YEAR FROM CURRENT_DATE)
  AND pl.month = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN inventory i ON i.product_id = p.id
WHERE p.company_id = '{companyId}' AND p.is_deleted = false
ORDER BY p.name
```
