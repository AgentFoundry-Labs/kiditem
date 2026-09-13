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
-- 상품별 현재 ABC/기여이익과 물리 재고
SELECT mp.id, mp.name, mp.abc_grade,
       ev.weighted_contribution_profit,
       sis.current_stock AS available_stock
FROM master_products mp
LEFT JOIN master_product_abc_evaluations ev
  ON ev.master_product_id = mp.id
 AND ev.organization_id = mp.organization_id
LEFT JOIN sellpia_inventory_skus sis
  ON sis.master_product_id = mp.id
 AND sis.organization_id = mp.organization_id
WHERE mp.organization_id = '{{organization_id}}'
  AND mp.is_active = true
ORDER BY ev.weighted_contribution_profit DESC NULLS LAST
```

전체 회사 손익은 저장 테이블이 아니라 `GET /api/profit-loss`의 실시간 집계를
사용한다. 리뷰와 광고 지표도 해당 organization-scoped API/read model 결과를
결합하며, 없는 물리 테이블을 가정하지 않는다.

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
