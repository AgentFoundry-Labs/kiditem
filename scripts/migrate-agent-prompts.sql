-- 에이전트 프롬프트 템플릿을 파일 경로로 마이그레이션
-- 실행: psql "$DATABASE_URL" -f scripts/migrate-agent-prompts.sql
-- agent_definitions.prompt_template → agent-config/prompts/agents/{type}.md 경로

UPDATE agent_definitions SET prompt_template = 'agent-config/prompts/agents/ad-strategy.md' WHERE type = 'ad_strategy';
UPDATE agent_definitions SET prompt_template = 'agent-config/prompts/agents/rules-evaluation.md' WHERE type = 'rules_evaluation';
UPDATE agent_definitions SET prompt_template = 'agent-config/prompts/agents/rules-suggest.md' WHERE type = 'rules_suggest';
UPDATE agent_definitions SET prompt_template = 'agent-config/prompts/agents/manager.md' WHERE type = 'manager';
UPDATE agent_definitions SET prompt_template = 'agent-config/prompts/agents/chat.md' WHERE type = 'chat';

-- allowedTools 표준화: Bash(curl:*) 제거
UPDATE agent_definitions SET allowed_tools = 'Bash(psql:*) Read Grep' WHERE allowed_tools LIKE '%Bash(curl:*)%';
