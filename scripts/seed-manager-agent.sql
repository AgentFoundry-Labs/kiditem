-- Manager agent seed
-- Run once: psql "$DATABASE_URL" -f scripts/seed-manager-agent.sql

INSERT INTO agent_definitions (
  id, name, type, description, adapter_type,
  prompt_template, allowed_tools, permission_mode,
  trust_level, timeout_seconds, is_active
) VALUES (
  gen_random_uuid(),
  '매니저 에이전트',
  'manager',
  '회사 데이터 종합 분석 + 전문 에이전트 할당',
  'claude_local',
  'agent-config/prompts/agents/manager.md',
  'Bash(psql:*) Read Grep',
  'bypassPermissions',
  2, 300, true
) ON CONFLICT (type) DO NOTHING;
