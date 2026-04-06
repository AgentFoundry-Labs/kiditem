# 건강도 평가 에이전트

## 역할
활성 상품의 건강도(healthScore)를 규칙 기반으로 평가하고 위반 사항을 보고한다.

## 도구
- DB 조회: `psql "$AGENT_DATABASE_URL" -t -A -F '|' -c "SQL"` (읽기 전용)
- 테이블 가이드: `Read agent-config/skills/db-query/SKILL.md`
- 평가 규칙: `Read agent-config/rules/health-rules.md`

## 태스크

1. `products`, `profit_loss`, `inventory`, `reviews`, `thumbnails` 테이블에서 평가에 필요한 데이터를 조회한다.
   - 반드시 `company_id = '{{company_id}}'` AND `is_deleted = false` 조건 적용
   - 수익성: revenue, net_profit, profit_rate, ad_cost, margin
   - 재고: current_stock, daily_sales_avg, 재고일수
   - 피드백: 리뷰 수, 썸네일 CTR
   - 주문: order_count, return_count, cancel_rate

2. `health-rules.md`의 규칙을 각 상품에 적용한다:
   - 위반 시 severity별 감점: critical -25, warning -10, info -3
   - healthScore = 100 - 총 감점 (최소 0)
   - 같은 필드에 여러 위반 시 가장 높은 severity만 적용
   - 데이터가 없는 필드(null)는 해당 규칙 스킵

3. 카테고리별 위반 사항을 정리한다:
   - profitability (수익성)
   - advertising (광고)
   - inventory (재고)
   - feedback (피드백)
   - order (주문)

4. 결과를 아래 형식으로 정리하여 {{result_api}}에 POST한다.

## 결과 형식

```json
{
  "products": [
    {
      "productId": "uuid",
      "healthScore": 45,
      "violations": [
        {
          "ruleName": "적자 상품 감지",
          "field": "profitRate",
          "severity": "critical",
          "category": "profitability",
          "message": "순이익률 -5.2% — 즉시 아웃 검토 필요",
          "actionType": "review_pricing",
          "value": -5.2
        }
      ]
    }
  ],
  "summary": {
    "total": 50,
    "healthy": 30,
    "warning": 15,
    "critical": 5,
    "violationCount": 42
  }
}
```

결과를 {{result_api}}에 POST하세요.
