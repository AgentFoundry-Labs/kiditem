import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The `channel_scrape_*` tables and the `raw_snapshot_id` columns that pointed at
 * them, as the Office 0.1.31 schema had them. KID-365 dropped them from the
 * Prisma schema; the executed v0.1.31 data migrations (012-014) still run on
 * that Office shape, so their specs restore it here and drop it again after.
 * Generated with `prisma migrate diff` from the post-drop to the pre-drop schema.
 */
const LEGACY_CHANNEL_SCRAPE_DDL: readonly string[] = [
  `ALTER TABLE "channel_listing_daily_snapshots" ADD COLUMN "raw_snapshot_id" UUID`,
  `ALTER TABLE "channel_listing_option_daily_snapshots" ADD COLUMN "raw_snapshot_id" UUID`,
  `CREATE TABLE "channel_scrape_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel_account_id" UUID NOT NULL,
    "client_run_key" UUID,
    "source_import_run_id" UUID,
    "channel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "page_type" TEXT NOT NULL,
    "business_date" DATE,
    "period_start" DATE,
    "period_end" DATE,
    "status" TEXT NOT NULL DEFAULT 'running',
    "target_url" TEXT,
    "period" TEXT,
    "parser_version" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta_json" JSONB,
    "error_json" JSONB,

    CONSTRAINT "channel_scrape_runs_pkey" PRIMARY KEY ("id")
)`,
  `CREATE TABLE "channel_scrape_chunks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scrape_run_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "item_count" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ,
    "publication_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_scrape_chunks_pkey" PRIMARY KEY ("id")
)`,
  `CREATE TABLE "channel_scrape_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scrape_run_id" UUID,
    "source_import_run_id" UUID,
    "channel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "page_type" TEXT NOT NULL,
    "business_date" DATE,
    "observed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "external_id" TEXT,
    "external_option_id" TEXT,
    "listing_id" UUID,
    "listing_option_id" UUID,
    "match_status" TEXT NOT NULL DEFAULT 'unmatched',
    "match_reason" TEXT,
    "row_hash" TEXT,
    "raw_json" JSONB NOT NULL,
    "normalized_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_scrape_snapshots_pkey" PRIMARY KEY ("id")
)`,
  `CREATE INDEX "channel_scrape_runs_organization_id_channel_source_business_idx" ON "channel_scrape_runs"("organization_id", "channel", "source", "business_date")`,
  `CREATE INDEX "channel_scrape_runs_organization_id_status_started_at_idx" ON "channel_scrape_runs"("organization_id", "status", "started_at")`,
  `CREATE INDEX "channel_scrape_runs_started_at_idx" ON "channel_scrape_runs"("started_at")`,
  `CREATE INDEX "channel_scrape_runs_channel_account_id_idx" ON "channel_scrape_runs"("channel_account_id")`,
  `CREATE INDEX "channel_scrape_runs_source_import_run_id_idx" ON "channel_scrape_runs"("source_import_run_id")`,
  `CREATE UNIQUE INDEX "channel_scrape_runs_id_org_key" ON "channel_scrape_runs"("id", "organization_id")`,
  `CREATE UNIQUE INDEX "channel_scrape_runs_org_account_source_client_key" ON "channel_scrape_runs"("organization_id", "channel_account_id", "source", "client_run_key") WHERE (client_run_key IS NOT NULL)`,
  `CREATE INDEX "channel_scrape_chunks_organization_id_scrape_run_id_idx" ON "channel_scrape_chunks"("organization_id", "scrape_run_id")`,
  `CREATE INDEX "channel_scrape_chunks_scrape_run_id_kind_idx" ON "channel_scrape_chunks"("scrape_run_id", "kind")`,
  `CREATE UNIQUE INDEX "channel_scrape_chunks_run_kind_sequence_key" ON "channel_scrape_chunks"("scrape_run_id", "kind", "sequence")`,
  `CREATE INDEX "channel_scrape_snapshots_source_import_run_id_organization__idx" ON "channel_scrape_snapshots"("source_import_run_id", "organization_id")`,
  `CREATE INDEX "channel_scrape_snapshots_organization_id_channel_source_bus_idx" ON "channel_scrape_snapshots"("organization_id", "channel", "source", "business_date")`,
  `CREATE INDEX "channel_scrape_snapshots_organization_id_channel_page_type__idx" ON "channel_scrape_snapshots"("organization_id", "channel", "page_type", "business_date")`,
  `CREATE INDEX "channel_scrape_snapshots_scrape_run_id_idx" ON "channel_scrape_snapshots"("scrape_run_id")`,
  `CREATE INDEX "channel_scrape_snapshots_listing_id_business_date_idx" ON "channel_scrape_snapshots"("listing_id", "business_date")`,
  `CREATE INDEX "channel_scrape_snapshots_listing_option_id_business_date_idx" ON "channel_scrape_snapshots"("listing_option_id", "business_date")`,
  `CREATE INDEX "channel_scrape_snapshots_organization_id_channel_external_i_idx" ON "channel_scrape_snapshots"("organization_id", "channel", "external_id")`,
  `CREATE INDEX "channel_scrape_snapshots_organization_id_channel_external_o_idx" ON "channel_scrape_snapshots"("organization_id", "channel", "external_option_id")`,
  `CREATE INDEX "channel_scrape_snapshots_organization_id_match_status_idx" ON "channel_scrape_snapshots"("organization_id", "match_status")`,
  `CREATE INDEX "channel_scrape_snapshots_observed_at_idx" ON "channel_scrape_snapshots"("observed_at")`,
  `CREATE UNIQUE INDEX "channel_scrape_snapshots_id_org_key" ON "channel_scrape_snapshots"("id", "organization_id")`,
  `CREATE UNIQUE INDEX "channel_scrape_snapshots_serp_capture_key" ON "channel_scrape_snapshots"("source_import_run_id", "organization_id") WHERE (source_import_run_id IS NOT NULL AND source = ANY (ARRAY['coupang_keyword_serp'::text, 'coupang_wing_rank'::text]))`,
  `CREATE INDEX "channel_listing_daily_snapshots_raw_snapshot_id_idx" ON "channel_listing_daily_snapshots"("raw_snapshot_id")`,
  `CREATE INDEX "channel_listing_option_daily_snapshots_raw_snapshot_id_idx" ON "channel_listing_option_daily_snapshots"("raw_snapshot_id")`,
  `ALTER TABLE "channel_scrape_runs" ADD CONSTRAINT "channel_scrape_runs_channel_account_id_organization_id_fkey" FOREIGN KEY ("channel_account_id", "organization_id") REFERENCES "channel_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "channel_scrape_chunks" ADD CONSTRAINT "channel_scrape_chunks_scrape_run_id_organization_id_fkey" FOREIGN KEY ("scrape_run_id", "organization_id") REFERENCES "channel_scrape_runs"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "channel_scrape_snapshots" ADD CONSTRAINT "channel_scrape_snapshots_scrape_run_id_organization_id_fkey" FOREIGN KEY ("scrape_run_id", "organization_id") REFERENCES "channel_scrape_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "channel_scrape_snapshots" ADD CONSTRAINT "channel_scrape_snapshots_listing_id_organization_id_fkey" FOREIGN KEY ("listing_id", "organization_id") REFERENCES "channel_listings"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "channel_scrape_snapshots" ADD CONSTRAINT "channel_scrape_snapshots_listing_option_id_organization_id_fkey" FOREIGN KEY ("listing_option_id", "organization_id") REFERENCES "channel_listing_options"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "channel_listing_daily_snapshots" ADD CONSTRAINT "channel_listing_daily_snapshots_raw_snapshot_id_organizati_fkey" FOREIGN KEY ("raw_snapshot_id", "organization_id") REFERENCES "channel_scrape_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "channel_listing_option_daily_snapshots" ADD CONSTRAINT "channel_listing_option_daily_snapshots_raw_snapshot_id_org_fkey" FOREIGN KEY ("raw_snapshot_id", "organization_id") REFERENCES "channel_scrape_snapshots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
];

type Db = PrismaClient | Prisma.TransactionClient;

export async function restoreLegacyChannelScrapeTables(db: Db): Promise<void> {
  await dropLegacyChannelScrapeTables(db);
  for (const statement of LEGACY_CHANNEL_SCRAPE_DDL) await db.$executeRawUnsafe(statement);
}

export async function dropLegacyChannelScrapeTables(db: Db): Promise<void> {
  await db.$executeRawUnsafe('ALTER TABLE channel_listing_daily_snapshots DROP COLUMN IF EXISTS raw_snapshot_id');
  await db.$executeRawUnsafe('ALTER TABLE channel_listing_option_daily_snapshots DROP COLUMN IF EXISTS raw_snapshot_id');
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS channel_scrape_snapshots, channel_scrape_chunks, channel_scrape_runs');
}
