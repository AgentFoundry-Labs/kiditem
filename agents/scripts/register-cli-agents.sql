-- Register Claude CLI agents that replace Python InventoryAgent and SourcingAgent.
-- Run once: psql "$DATABASE_URL" -f agents/scripts/register-cli-agents.sql
-- ON CONFLICT (type) DO NOTHING prevents duplicate inserts.

-- 1. inventory_check — replaces Python InventoryAgent
INSERT INTO agent_definitions (
  id, name, type, description, adapter_type,
  role, title, skills, allowed_tools, permission_mode, permissions,
  timeout_seconds, requires_approval, is_active, trust_level,
  action_cap, prompt_template
)
VALUES (
  gen_random_uuid(),
  '재고 점검 에이전트',
  'inventory_check',
  '재고 현황 조회 및 알림 생성. 기존 Python InventoryAgent 대체.',
  'claude_local',
  'specialist',
  '재고 관리 전문가',
  ARRAY['db-query', 'result-callback'],
  'Bash(psql:*) Read Grep',
  'bypassPermissions',
  '{}',
  300,
  false,
  true,
  2,
  '{"maxAffectedProducts": 50}',
  'agent-config/prompts/inventory-check.md'
) ON CONFLICT (type) DO NOTHING;


-- 2. sourcing_scraper — replaces Python SourcingAgent
INSERT INTO agent_definitions (
  id, name, type, description, adapter_type,
  role, title, skills, allowed_tools, permission_mode, permissions,
  timeout_seconds, requires_approval, is_active, trust_level,
  action_cap, prompt_template
)
VALUES (
  gen_random_uuid(),
  '소싱 스크래퍼 에이전트',
  'sourcing_scraper',
  '1688/Alibaba 상품 스크래핑 및 매칭. 기존 Python SourcingAgent 대체.',
  'claude_local',
  'specialist',
  '소싱 전문가',
  ARRAY['db-query', 'result-callback'],
  'Bash(psql:*) Read Grep',
  'bypassPermissions',
  '{}',
  600,
  false,
  true,
  2,
  '{"maxProductsPerRun": 20}',
  'agent-config/prompts/sourcing-scraper.md'
) ON CONFLICT (type) DO NOTHING;
