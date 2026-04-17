-- Plan A Task 11 — post db:push setup
-- Applies: sequence for Master.code, partial unique index, RLS policies for new tables
-- Idempotent (IF NOT EXISTS, CREATE OR REPLACE 사용).

-- 1. Postgres sequence for Master.code
CREATE SEQUENCE IF NOT EXISTS master_code_seq START 1;

-- 2. Partial unique index — single option (optionName IS NULL) per master
CREATE UNIQUE INDEX IF NOT EXISTS product_options_master_null_option
  ON product_options (master_id)
  WHERE option_name IS NULL;

-- 3. ActionTask target_type CHECK
ALTER TABLE action_tasks
  DROP CONSTRAINT IF EXISTS action_task_target_type;
ALTER TABLE action_tasks
  ADD CONSTRAINT action_task_target_type
    CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));

-- 4. ProductMemo target_type CHECK
ALTER TABLE product_memos
  DROP CONSTRAINT IF EXISTS product_memo_target_type;
ALTER TABLE product_memos
  ADD CONSTRAINT product_memo_target_type
    CHECK (target_type IN ('master','option','listing'));

-- 5. Alert target_type CHECK (nullable)
ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alert_target_type;
ALTER TABLE alerts
  ADD CONSTRAINT alert_target_type
    CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));

-- 6. RLS — chatbot_readonly user sees only matching company_id rows

-- master_products
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_products_chatbot_filter ON master_products;
CREATE POLICY master_products_chatbot_filter ON master_products
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- product_options
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_options_chatbot_filter ON product_options;
CREATE POLICY product_options_chatbot_filter ON product_options
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- channel_listings
ALTER TABLE channel_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listings_chatbot_filter ON channel_listings;
CREATE POLICY channel_listings_chatbot_filter ON channel_listings
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- channel_listing_options
ALTER TABLE channel_listing_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listing_options_chatbot_filter ON channel_listing_options;
CREATE POLICY channel_listing_options_chatbot_filter ON channel_listing_options
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- bundle_components
ALTER TABLE bundle_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bundle_components_chatbot_filter ON bundle_components;
CREATE POLICY bundle_components_chatbot_filter ON bundle_components
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- inventory (denormalized company_id, 기존에 없었거나 재적용)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_chatbot_filter ON inventory;
CREATE POLICY inventory_chatbot_filter ON inventory
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- product_memos
ALTER TABLE product_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_memos_chatbot_filter ON product_memos;
CREATE POLICY product_memos_chatbot_filter ON product_memos
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- migration_checkpoints — no RLS (internal tooling)
