-- Sync agent marketplace catalog
-- Run: docker exec kiditem-postgres psql -U kiditem -d kiditem -f - < scripts/sync-agent-definitions.sql

-- 1. Clean stale entries
DELETE FROM agent_definitions WHERE company_id IS NULL;
DELETE FROM agent_marketplace WHERE role IN ('ad_manager', 'ceo', 'cs', 'data_collector', 'finance', 'inventory', 'product_optimizer', 'review_analyzer', 'competitor_monitor');

-- 2. Register marketplace catalog (ON CONFLICT safe)
INSERT INTO agent_marketplace (id, name, description, role, category, adapter_type, prompt_template, skills, permissions)
VALUES
  (gen_random_uuid(), '매니저 에이전트', '전사 데이터 종합 분석. 전문 에이전트를 판단하여 할당합니다.

- 회사 전체 데이터 자동 조회 및 분석
- 필요한 전문 에이전트 판단 및 할당
- 분석 결과 종합 리포트 생성', 'manager', 'operations', 'claude_local', 'agent-config/prompts/agents/manager.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '광고 전략 에이전트', '광고 성과 분석 및 액션 추천.

- 광고 실적 데이터 자동 조회
- ABC 등급별 예산 배분 추천
- 저성과 캠페인 중단 제안
- ROAS/CTR 기반 최적화', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/ad-strategy.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '건강도 평가 에이전트', '비즈니스 규칙 기반 상품 건강 점수 평가.

- 상품별 건강도 자동 평가
- 규칙 위반 상품 감지 및 알림
- 심각도별 우선순위 분류', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-evaluation.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '규칙 추천 에이전트', '데이터 분포 기반 규칙 임계값 추천.

- 현재 데이터 분포 분석
- 최적 임계값 자동 제안
- 기존 규칙 대비 개선 효과 예측', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-suggest.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '소싱 에이전트', '1688/알리바바 상품 URL 스크래핑 및 매칭.

- 상품 URL에서 데이터 자동 추출
- 이미지, 가격, 설명 정보 수집
- 1688 매칭 후보 탐색', 'specialist', 'operations', 'python_http', '', ARRAY[]::text[], '{}')
ON CONFLICT DO NOTHING;

-- Note: agent_definitions are created when users install from marketplace.
-- Do NOT seed agent_definitions directly.
