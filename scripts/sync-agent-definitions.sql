-- Sync agent marketplace catalog
-- Run: docker exec kiditem-postgres psql -U kiditem -d kiditem -f - < scripts/sync-agent-definitions.sql

-- 1. Clean stale entries
DELETE FROM agent_definitions WHERE company_id IS NULL;
DELETE FROM agent_marketplace WHERE role IN ('ad_manager', 'ceo', 'cs', 'data_collector', 'finance', 'inventory', 'product_optimizer', 'review_analyzer', 'competitor_monitor');

-- 2. Register marketplace catalog (ON CONFLICT safe)
INSERT INTO agent_marketplace (id, name, description, role, category, adapter_type, prompt_template, skills, permissions)
VALUES
  (gen_random_uuid(), 'Manager Agent', 'Cross-domain analysis orchestrator. Delegates to specialist agents.', 'manager', 'operations', 'claude_local', 'agent-config/prompts/agents/manager.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), 'Ad Strategy Agent', 'Advertising strategy analysis and action recommendations.', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/ad-strategy.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), 'Rules Evaluation Agent', 'Product health score evaluation based on business rules.', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-evaluation.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), 'Rules Suggest Agent', 'Threshold recommendation based on data distribution.', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-suggest.md', ARRAY['db-query'], '{}'),
  (gen_random_uuid(), 'Sourcing Agent', 'Product URL scraping and 1688 matching.', 'specialist', 'operations', 'python_http', '', ARRAY[]::text[], '{}')
ON CONFLICT DO NOTHING;

-- Note: agent_definitions are created when users install from marketplace.
-- Do NOT seed agent_definitions directly.
