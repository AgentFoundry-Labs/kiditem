## 추가 출력 요구사항

기존 actions/summary 외에 다음 3개 필드를 **반드시** JSON 출력에 포함하세요.

### recommendations (등급별 규칙 추천)

상품별로 ABC 등급, 우선순위, 구체적 액션을 제안합니다. 각 항목 형식:

```json
{
  "productId": "uuid (optional)",
  "name": "상품명",
  "grade": "A|B|C",
  "rule": "규칙 이름 (예: A-1 매출 확대, C-1 광고 중단)",
  "action": "구체적 액션 설명",
  "priority": "urgent|high|medium|low",
  "roas": 350,
  "spend": 15000
}
```

등급 기준:
- **A등급**: ROAS 480%+ 또는 자연매출 상위. 공격 확장 (예산 증액, 키워드 확장, 1차 승격)
- **B등급**: ROAS 100~480%. 최적화 집중 (입찰가 조정, 소재 테스트, 롱테일 키워드)
- **C등급**: ROAS 100% 미만 또는 전환 0. 손절/재구성 (예산 축소, 캠페인 OFF, 가격 재검토)

### cards (AI 전략 추천 카드)

7가지 카테고리 인사이트 카드. 해당 상품이 있는 카테고리만 포함:

1. **ROAS 폭발** — ROAS 500%+ 상품. 즉시 예산 증액 추천
2. **광고비 낭비** — 지출 있으나 전환 0원. 즉시 중단 추천
3. **자연매출 우수 + 광고 없음** — 14일 매출 2만원+ 광고 미진행. 광고 테스트 추천
4. **재고 0 + 광고 ON** — 재고 없는데 광고비 지출. 즉시 중단
5. **카테고리별 성과** — 카테고리별 상품 수, 매출, 광고비 비교
6. **CTR 높은데 전환 낮음** — CTR 0.5%+ but ROAS 100% 미만. 상세페이지 개선
7. **가격대별 광고 효율** — 가격대별 평균 ROAS, 광고 전략 추천

각 카드 형식:
```json
{
  "title": "카드 제목",
  "icon": "rocket|alert|gem|warning|package|image|coins",
  "color": "from-green-50 to-emerald-50 border-green-300",
  "items": [
    { "text": "설명", "productName": "상품명", "value": "수치", "priority": "urgent|high|medium|low" }
  ]
}
```

### plan (주간 플랜 요약)

전체 광고 상품의 액션 분류 카운트 + 핵심 지표:

```json
{
  "summary": {
    "scaleUp": 5,
    "optimize": 8,
    "reduce": 3,
    "stop": 2,
    "newStart": 1
  },
  "keyMetrics": {
    "totalAdSpend": 1500000,
    "totalAdRevenue": 4500000,
    "overallRoas": 300
  }
}
```
