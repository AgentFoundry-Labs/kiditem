# 재고 알림 규칙

inventory_alert specialist 에이전트가 참조하는 재고 관리 규칙.

## 판단 기준

### P0 — 긴급
- 재고 0 + 판매 중 → 즉시 판매 중지 또는 긴급 발주
- 재고 0 + 광고 집행 중 → 광고 즉시 중단 + 발주

### P1 — 발주 필요
- 재고일수 < 7일 (current_stock / daily_sales_avg < 7) → 발주 권고
- 안전재고 이하 → 발주 권고
- 일평균 판매 급증 (전주 대비 50% 이상) + 재고일수 < 14일 → 선제 발주

### P2 — 과잉 재고
- 재고일수 > 90일 → 과잉 재고 경고
- 재고일수 > 180일 → 할인/번들 판매 추천
- 계절 상품 + 시즌 종료 임박 + 재고 잔여 → 할인 처분 추천

### P3 — 모니터링
- 재고일수 14~60일 → 정상 범위
- 신규 입고 예정 + 재고 부족 → 입고일까지 판매 속도 조절

## 발주 추천 계산
- 목표 재고일수: 30일
- 추천 발주 수량 = daily_sales_avg × 30 - current_stock
- 리드타임 고려: 중국 소싱 기준 14일

## 데이터 소스
- inventory: current_stock, daily_sales_avg
- products: status, ad_tier, is_deleted
- ads: 진행 중인 광고 여부
- purchase_orders: 입고 예정 발주
