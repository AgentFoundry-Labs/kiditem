-- Sync agent marketplace catalog
-- Run: docker exec kiditem-postgres psql -U kiditem -d kiditem -f - < scripts/sync-agent-definitions.sql

-- 1. Clean stale entries
DELETE FROM agent_definitions WHERE company_id IS NULL;
DELETE FROM agent_marketplace WHERE role IN ('ad_manager', 'ceo', 'cs', 'data_collector', 'finance', 'inventory', 'product_optimizer', 'review_analyzer', 'competitor_monitor');

-- 2. Register marketplace catalog (ON CONFLICT safe)
INSERT INTO agent_marketplace (id, name, description, role, category, adapter_type, prompt_template, skills, permissions)
VALUES
  (gen_random_uuid(), '매니저 에이전트', '전사 데이터 종합 분석. 전문 에이전트를 판단하여 할당합니다.', 'manager', 'operations', 'claude_local', 'agent-config/prompts/agents/manager.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '광고 전략 에이전트', '광고 성과 분석 및 액션 추천. ROAS/CTR/예산 최적화.', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/ad-strategy.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '건강도 평가 에이전트', '비즈니스 규칙 기반 상품 건강 점수 평가.', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-evaluation.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '규칙 추천 에이전트', '데이터 분포 기반 규칙 임계값 추천.', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-suggest.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), '소싱 에이전트', '1688/알리바바 상품 URL 스크래핑 및 매칭.', 'specialist', 'operations', 'python_http', '', ARRAY[]::text[], '{}')
ON CONFLICT DO NOTHING;

-- Note: agent_definitions are created when users install from marketplace.
-- Do NOT seed agent_definitions directly.
