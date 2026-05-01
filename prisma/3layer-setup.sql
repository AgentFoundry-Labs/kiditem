-- Plan A Task 11 — post db:push setup
-- Applies: sequence for Master.code, partial unique index, RLS policies for new tables
-- Idempotent (IF NOT EXISTS, CREATE OR REPLACE 사용).

-- 1. Postgres sequence for Master.code
CREATE SEQUENCE IF NOT EXISTS master_code_seq START 1;

-- 2. Partial unique index — single option (optionName IS NULL) per master
CREATE UNIQUE INDEX IF NOT EXISTS product_options_master_null_option
  ON product_options (master_id)
  WHERE option_name IS NULL;

-- 2b. Partial unique index for master legacyCode — only among non-deleted rows.
-- Replaces Prisma full unique @@unique([organizationId, legacyCode]) so that soft-deleted
-- masters do not block re-use of the same legacyCode (restore → 409 if conflict).
DROP INDEX IF EXISTS master_products_organization_id_legacy_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS master_products_organization_id_legacy_code_key
  ON master_products (organization_id, legacy_code)
  WHERE is_deleted = false AND legacy_code IS NOT NULL;

-- 2c. ProductOption: partial unique indexes (soft-delete + null-aware)
-- Active rows 에서만 unique 보장. 소프트삭제된 row 의 값은 새 row 가 재사용 가능;
-- restore 시 활성 row 와 충돌하면 P2002 → ConflictException.
-- NOTE: Plan A Task 11 이 만든 `product_options_master_null_option` (optionName IS NULL)
-- partial index 는 유지. 아래 `product_options_master_id_option_name_key` 는 optionName IS NOT NULL case 커버.

DROP INDEX IF EXISTS product_options_master_id_option_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_options_master_id_option_name_key
  ON product_options (master_id, option_name)
  WHERE is_deleted = false AND option_name IS NOT NULL;

DROP INDEX IF EXISTS product_options_organization_id_barcode_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_options_organization_id_barcode_key
  ON product_options (organization_id, barcode)
  WHERE is_deleted = false AND barcode IS NOT NULL;

DROP INDEX IF EXISTS product_options_organization_id_legacy_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_options_organization_id_legacy_code_key
  ON product_options (organization_id, legacy_code)
  WHERE is_deleted = false AND legacy_code IS NOT NULL;

-- 2d. ChannelListing: active-row uniqueness on (organization_id, channel, external_id) — ADR-0020.
-- Prisma @@unique([organizationId, channel, externalId]) creates the full constraint; this partial
-- index supersedes it so that soft-deleted listings don't block re-registration of the same
-- external_id for an active listing.
ALTER TABLE channel_listings
  DROP CONSTRAINT IF EXISTS channel_listings_channel_external_id_key;
ALTER TABLE channel_listings
  DROP CONSTRAINT IF EXISTS channel_listings_organization_id_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_organization_id_channel_external_id_key;

CREATE UNIQUE INDEX channel_listings_organization_id_channel_external_id_key
  ON channel_listings(organization_id, channel, external_id)
  WHERE is_deleted = false;

-- 2e. Agent trace lookup — AgentTask → AgentWakeupRequest legacy marker.
-- Prisma cannot express this JSONB expression index. Keep it here rather than
-- as a parked backfill so fresh/test DBs get the same lookup behavior.
CREATE INDEX IF NOT EXISTS idx_agent_wakeup_requests_task_marker
  ON agent_wakeup_requests ((payload ->> '_legacy_task_id'));

-- 3. ActionTask target_type CHECK
ALTER TABLE action_tasks
  DROP CONSTRAINT IF EXISTS action_task_target_type;
ALTER TABLE action_tasks
  ADD CONSTRAINT action_task_target_type
    CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));

-- 5. Alert target_type CHECK (nullable)
ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alert_target_type;
ALTER TABLE alerts
  ADD CONSTRAINT alert_target_type
    CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));

-- 6. RLS — chatbot_readonly user sees only matching organization_id rows

-- master_products
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_products_chatbot_filter ON master_products;
CREATE POLICY master_products_chatbot_filter ON master_products
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- product_options
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_options_chatbot_filter ON product_options;
CREATE POLICY product_options_chatbot_filter ON product_options
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- channel_listings
ALTER TABLE channel_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listings_chatbot_filter ON channel_listings;
CREATE POLICY channel_listings_chatbot_filter ON channel_listings
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- channel_listing_options
ALTER TABLE channel_listing_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listing_options_chatbot_filter ON channel_listing_options;
CREATE POLICY channel_listing_options_chatbot_filter ON channel_listing_options
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- bundle_components
ALTER TABLE bundle_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bundle_components_chatbot_filter ON bundle_components;
CREATE POLICY bundle_components_chatbot_filter ON bundle_components
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- inventory (denormalized organization_id, 기존에 없었거나 재적용)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_chatbot_filter ON inventory;
CREATE POLICY inventory_chatbot_filter ON inventory
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- 7. Channels — market-data snapshots (Wave C0)
-- 4 new organization-scoped tables: channel_scrape_runs, channel_scrape_snapshots,
-- channel_listing_daily_snapshots, channel_listing_option_daily_snapshots.
-- Same pattern as section 6: chatbot_readonly only sees rows whose organization_id
-- matches the session var `app.organization_id`. NestJS server stays table-owner
-- and bypasses RLS (its writes/reads use kiditem role with explicit
-- organizationId WHERE clauses per apps/server/AGENTS.md).

ALTER TABLE channel_scrape_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_scrape_runs_chatbot_filter ON channel_scrape_runs;
CREATE POLICY channel_scrape_runs_chatbot_filter ON channel_scrape_runs
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE channel_scrape_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_scrape_snapshots_chatbot_filter ON channel_scrape_snapshots;
CREATE POLICY channel_scrape_snapshots_chatbot_filter ON channel_scrape_snapshots
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE channel_listing_daily_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listing_daily_snapshots_chatbot_filter ON channel_listing_daily_snapshots;
CREATE POLICY channel_listing_daily_snapshots_chatbot_filter ON channel_listing_daily_snapshots
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE channel_listing_option_daily_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listing_option_daily_snapshots_chatbot_filter ON channel_listing_option_daily_snapshots;
CREATE POLICY channel_listing_option_daily_snapshots_chatbot_filter ON channel_listing_option_daily_snapshots
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- 8. Channels — daily fact extensions (Hard rewrite H1)
-- 2 new organization-scoped tables: channel_ad_target_daily_snapshots,
-- channel_account_daily_kpi_snapshots. Same chatbot_readonly RLS pattern as
-- section 7. NestJS server (kiditem owner) bypasses RLS via explicit
-- organizationId WHERE filters (apps/server/AGENTS.md).

ALTER TABLE channel_ad_target_daily_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_ad_target_daily_snapshots_chatbot_filter ON channel_ad_target_daily_snapshots;
CREATE POLICY channel_ad_target_daily_snapshots_chatbot_filter ON channel_ad_target_daily_snapshots
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE channel_account_daily_kpi_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_account_daily_kpi_snapshots_chatbot_filter ON channel_account_daily_kpi_snapshots;
CREATE POLICY channel_account_daily_kpi_snapshots_chatbot_filter ON channel_account_daily_kpi_snapshots
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

-- migration_checkpoints — no RLS (internal tooling)

-- 9. Product/AI image tables — organization-scoped gallery + thumbnail generation
-- artifacts. DB stores only object-storage references and metadata; NestJS
-- still applies explicit organizationId filters while chatbot_readonly relies on RLS.

ALTER TABLE master_product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_product_images_chatbot_filter ON master_product_images;
CREATE POLICY master_product_images_chatbot_filter ON master_product_images
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE thumbnail_generation_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thumbnail_generation_candidates_chatbot_filter ON thumbnail_generation_candidates;
CREATE POLICY thumbnail_generation_candidates_chatbot_filter ON thumbnail_generation_candidates
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE thumbnail_generation_input_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thumbnail_generation_input_images_chatbot_filter ON thumbnail_generation_input_images;
CREATE POLICY thumbnail_generation_input_images_chatbot_filter ON thumbnail_generation_input_images
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE thumbnail_registration_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thumbnail_registration_attempts_chatbot_filter ON thumbnail_registration_attempts;
CREATE POLICY thumbnail_registration_attempts_chatbot_filter ON thumbnail_registration_attempts
  FOR SELECT TO chatbot_readonly
  USING (organization_id = current_setting('app.organization_id', true)::uuid);
