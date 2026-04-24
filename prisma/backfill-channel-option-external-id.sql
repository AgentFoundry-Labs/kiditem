-- Rename Coupang-specific channel option column to channel-neutral naming.
-- Safe to run once before prisma db push. Re-running after the rename is a no-op.
-- Also safe on a fresh DB where the canonical tables do not yet exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'channel_listing_options'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'channel_listing_options'
        AND column_name = 'vendor_item_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'channel_listing_options'
        AND column_name = 'external_option_id'
    ) THEN
      ALTER TABLE channel_listing_options
        RENAME COLUMN vendor_item_id TO external_option_id;
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
