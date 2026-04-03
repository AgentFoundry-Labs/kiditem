-- 광고 전략 에이전트 프롬프트 업데이트
-- ad_strategy 에이전트가 recommendations, cards, plan 필드를 출력하도록 지시 추가
-- 실행: psql $DATABASE_URL -f prisma/update-ad-strategy-prompt.sql

UPDATE agent_definitions
SET prompt_template = prompt_template || E'

## 추가 출력 요구사항

기존 actions/summary 외에 다음 3개 필드를 반드시 JSON 출력에 포함하세요.

### recommendations (등급별 규칙 추천)
상품별로 ABC 등급, 우선순위, 구체적 액션을 제안합니다.
각 항목: { productId?, name, grade (A|B|C), rule, action, priority (urgent|high|medium|low), roas?, spend? }

등급 기준:
- A등급: ROAS 480%+ 또는 자연매출 상위. 공격 확장 (예산 증액, 키워드 확장)
- B등급: ROAS 100~480%. 최적화 집중 (입찰가 조정, 소재 테스트)
- C등급: ROAS 100% 미만 또는 전환 0. 손절/재구성 (예산 축소, 캠페인 OFF)

### cards (AI 전략 추천 카드)
7가지 카테고리 인사이트: ROAS 폭발, 광고비 낭비, 자연매출 우수+광고 없음, 재고0+광고ON, 카테고리별 성과, CTR높은데 전환낮음, 가격대별 효율.
각 카드: { title, icon (rocket|alert|gem|warning|package|image|coins), color, items: [{ text, productName?, value?, priority }] }

### plan (주간 플랜 요약)
summary: { scaleUp, optimize, reduce, stop, newStart } 카운트.
keyMetrics: { totalAdSpend, totalAdRevenue, overallRoas } 집계.'
WHERE type = 'ad_strategy';
