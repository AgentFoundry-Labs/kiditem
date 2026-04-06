-- Sync agent_definitions with code-referenced types
-- Run: docker exec kiditem-postgres psql -U kiditem -d kiditem -f - < scripts/sync-agent-definitions.sql

-- 1. Delete stale seed data (no code references)
DELETE FROM agent_definitions WHERE type IN ('ad_manager', 'ceo', 'cs', 'data_collector', 'finance', 'inventory');

-- 2. Register code-referenced agents (ON CONFLICT for idempotency)
INSERT INTO agent_definitions (id, name, type, description, adapter_type, prompt_template, allowed_tools, permission_mode, trust_level, timeout_seconds, is_active)
VALUES
  (gen_random_uuid(), 'Ad Strategy Agent', 'ad_strategy', 'Advertising strategy analysis and action recommendations', 'claude_local', 'agent-config/prompts/agents/ad-strategy.md', 'Bash(psql:*) Read Grep', 'bypassPermissions', 2, 300, true),
  (gen_random_uuid(), 'Rules Evaluation Agent', 'rules_evaluation', 'Product health score evaluation based on business rules', 'claude_local', 'agent-config/prompts/agents/rules-evaluation.md', 'Bash(psql:*) Read Grep', 'bypassPermissions', 2, 300, true),
  (gen_random_uuid(), 'Rules Suggest Agent', 'rules_suggest', 'Threshold recommendation based on data distribution', 'claude_local', 'agent-config/prompts/agents/rules-suggest.md', 'Bash(psql:*) Read Grep', 'bypassPermissions', 2, 300, true)
ON CONFLICT (type) DO NOTHING;

-- 3. Fix manager name (Korean → English consistency)
UPDATE agent_definitions SET name = 'Manager Agent', description = 'Cross-domain analysis orchestrator, delegates to specialist agents' WHERE type = 'manager';
