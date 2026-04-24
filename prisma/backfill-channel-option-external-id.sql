-- Rename Coupang-specific channel option column to channel-neutral naming.
-- Safe to run once before prisma db push. Re-running after the rename is a no-op.
-- Also safe on a fresh DB where the canonical tables do not yet exist.
-- ADR-0020: no implicit coexistence. If both old and new columns exist
-- (partial/manual migration state), drop the legacy column unconditionally.
-- ChannelListingOption rows come from re-playable sources (Coupang extension
-- scrape + Excel baseline importer), so data preservation across the rename
-- is not required.
DO $$
DECLARE
  has_vendor_item_id boolean;
  has_external_option_id boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'channel_listing_options'
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channel_listing_options'
        AND column_name = 'vendor_item_id'
    ) INTO has_vendor_item_id;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channel_listing_options'
        AND column_name = 'external_option_id'
    ) INTO has_external_option_id;

    IF has_vendor_item_id AND has_external_option_id THEN
      -- Partial/manual migration state: canonical column already exists alongside
      -- the legacy one. Drop legacy — the data is re-playable, so the rename
      -- direction is deterministic (canonical wins).
      ALTER TABLE channel_listing_options
        DROP COLUMN vendor_item_id;
    ELSIF has_vendor_item_id THEN
      ALTER TABLE channel_listing_options
        RENAME COLUMN vendor_item_id TO external_option_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channel_listing_options'
        AND column_name = 'external_option_id'
    ) THEN
      RAISE EXCEPTION
        'channel_listing_options.external_option_id is missing after backfill. Refusing to continue.';
    END IF;

    ALTER TABLE channel_listing_options
      DROP CONSTRAINT IF EXISTS channel_listing_options_company_id_vendor_item_id_key;
    ALTER TABLE channel_listing_options
      DROP CONSTRAINT IF EXISTS channel_listing_options_listing_id_vendor_item_id_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'channel_listings'
  ) THEN
    ALTER TABLE channel_listings
      DROP CONSTRAINT IF EXISTS channel_listings_channel_external_id_key;
    ALTER TABLE channel_listings
      DROP CONSTRAINT IF EXISTS channel_listings_company_id_channel_external_id_key;
  END IF;
END $$;

DROP INDEX IF EXISTS channel_listing_options_company_id_vendor_item_id_key;
DROP INDEX IF EXISTS channel_listing_options_listing_id_vendor_item_id_key;
DROP INDEX IF EXISTS channel_listing_options_vendor_item_id_idx;
DROP INDEX IF EXISTS channel_listings_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_company_id_channel_external_id_key;
