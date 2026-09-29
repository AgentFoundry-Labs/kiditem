import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * What Office 0.1.31 had around `source_import_runs` and KID-365 removed: the foreign keys into it that became plain
 * id columns (ADR-0013), and the old run columns it dropped (`channel_listings`/`channel_listing_options`
 * `last_import_run_id`, the ABC `…sellpia_source_import_run_id` columns). The executed v0.1.31 pre-schema migrations
 * (012, 014) still meet that Office shape, so their specs restore it here and drop it again after. Generated with
 * `prisma migrate diff` from the post-change to the pre-change schema.
 */
const LEGACY_SOURCE_IMPORT_RUN_REFERENCES_DDL: readonly string[] = [
  `ALTER TABLE "channel_listings" ADD COLUMN "last_import_run_id" UUID`,
  `ALTER TABLE "channel_listing_options" ADD COLUMN "last_import_run_id" UUID`,
  `ALTER TABLE "master_product_abc_formula_states" ADD COLUMN "published_sellpia_source_import_run_id" UUID`,
  `ALTER TABLE "master_product_abc_evaluations" ADD COLUMN "sellpia_source_import_run_id" UUID`,
  `ALTER TABLE "master_product_abc_grade_histories" ADD COLUMN "next_sellpia_source_import_run_id" UUID, ADD COLUMN "previous_sellpia_source_import_run_id" UUID`,
  `CREATE INDEX "channel_listings_last_import_run_id_idx" ON "channel_listings"("last_import_run_id")`,
  `CREATE INDEX "channel_listing_options_last_import_run_id_idx" ON "channel_listing_options"("last_import_run_id")`,
  `CREATE INDEX "master_product_abc_formula_states_published_sellpia_source__idx" ON "master_product_abc_formula_states"("published_sellpia_source_import_run_id", "organization_id")`,
  `CREATE INDEX "master_product_abc_evaluations_sellpia_source_import_run_id_idx" ON "master_product_abc_evaluations"("sellpia_source_import_run_id", "organization_id")`,
  `CREATE INDEX "master_product_abc_grade_histories_previous_sellpia_source__idx" ON "master_product_abc_grade_histories"("previous_sellpia_source_import_run_id", "organization_id")`,
  `CREATE INDEX "master_product_abc_grade_histories_next_sellpia_source_impo_idx" ON "master_product_abc_grade_histories"("next_sellpia_source_import_run_id", "organization_id")`,
  `ALTER TABLE "coupang_keyword_rank_daily_snapshots" ADD CONSTRAINT "coupang_keyword_rank_daily_snapshots_source_import_run_id__fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_keyword_serp_daily_snapshots" ADD CONSTRAINT "coupang_keyword_serp_daily_snapshots_source_import_run_id__fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_wing_sales_rank_daily_snapshots" ADD CONSTRAINT "coupang_wing_sales_rank_daily_snapshots_source_import_run__fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "sellpia_sales_daily_snapshots" ADD CONSTRAINT "sellpia_sales_daily_snapshots_source_import_run_id_organiz_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "sellpia_product_monthly_sales" ADD CONSTRAINT "sellpia_product_monthly_sales_source_import_run_id_organiz_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "master_product_abc_formula_states" ADD CONSTRAINT "master_product_abc_formula_states_published_sellpia_source_fkey" FOREIGN KEY ("published_sellpia_source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "master_product_abc_evaluations" ADD CONSTRAINT "master_product_abc_evaluations_sellpia_source_import_run_i_fkey" FOREIGN KEY ("sellpia_source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "master_product_abc_grade_histories" ADD CONSTRAINT "master_product_abc_grade_histories_previous_sellpia_source_fkey" FOREIGN KEY ("previous_sellpia_source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "master_product_abc_grade_histories" ADD CONSTRAINT "master_product_abc_grade_histories_next_sellpia_source_imp_fkey" FOREIGN KEY ("next_sellpia_source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "sellpia_inventory_states" ADD CONSTRAINT "sellpia_inventory_states_last_completed_import_run_id_orga_fkey" FOREIGN KEY ("last_completed_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_direct_transport_receipts" ADD CONSTRAINT "coupang_direct_transport_receipts_effect_source_import_run_fkey" FOREIGN KEY ("effect_source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_direct_transport_consumptions" ADD CONSTRAINT "coupang_direct_transport_consumptions_source_import_run_id_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "orders" ADD CONSTRAINT "orders_source_import_run_id_organization_id_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "reviews" ADD CONSTRAINT "reviews_source_import_run_id_organization_id_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_shipment_date_summaries" ADD CONSTRAINT "coupang_shipment_date_summaries_source_import_run_id_organ_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "rocket_po_catalog_snapshots" ADD CONSTRAINT "rocket_po_catalog_snapshots_source_import_run_id_organizat_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "rocket_purchase_confirmations" ADD CONSTRAINT "rocket_purchase_confirmations_source_import_run_id_organiz_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "rocket_purchase_confirmation_transmissions" ADD CONSTRAINT "rocket_purchase_confirmation_transmissions_source_import_r_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
];

const LEGACY_FOREIGN_KEYS: ReadonlyArray<readonly [table: string, constraint: string]> = [
  ['coupang_keyword_rank_daily_snapshots', 'coupang_keyword_rank_daily_snapshots_source_import_run_id__fkey'],
  ['coupang_keyword_serp_daily_snapshots', 'coupang_keyword_serp_daily_snapshots_source_import_run_id__fkey'],
  ['coupang_wing_sales_rank_daily_snapshots', 'coupang_wing_sales_rank_daily_snapshots_source_import_run__fkey'],
  ['sellpia_sales_daily_snapshots', 'sellpia_sales_daily_snapshots_source_import_run_id_organiz_fkey'],
  ['sellpia_product_monthly_sales', 'sellpia_product_monthly_sales_source_import_run_id_organiz_fkey'],
  ['master_product_abc_formula_states', 'master_product_abc_formula_states_published_sellpia_source_fkey'],
  ['master_product_abc_evaluations', 'master_product_abc_evaluations_sellpia_source_import_run_i_fkey'],
  ['master_product_abc_grade_histories', 'master_product_abc_grade_histories_previous_sellpia_source_fkey'],
  ['master_product_abc_grade_histories', 'master_product_abc_grade_histories_next_sellpia_source_imp_fkey'],
  ['sellpia_inventory_states', 'sellpia_inventory_states_last_completed_import_run_id_orga_fkey'],
  ['coupang_direct_transport_receipts', 'coupang_direct_transport_receipts_effect_source_import_run_fkey'],
  ['coupang_direct_transport_consumptions', 'coupang_direct_transport_consumptions_source_import_run_id_fkey'],
  ['orders', 'orders_source_import_run_id_organization_id_fkey'],
  ['reviews', 'reviews_source_import_run_id_organization_id_fkey'],
  ['coupang_shipment_date_summaries', 'coupang_shipment_date_summaries_source_import_run_id_organ_fkey'],
  ['rocket_po_catalog_snapshots', 'rocket_po_catalog_snapshots_source_import_run_id_organizat_fkey'],
  ['rocket_purchase_confirmations', 'rocket_purchase_confirmations_source_import_run_id_organiz_fkey'],
  ['rocket_purchase_confirmation_transmissions', 'rocket_purchase_confirmation_transmissions_source_import_r_fkey'],
];

const LEGACY_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['channel_listings', 'last_import_run_id'],
  ['channel_listing_options', 'last_import_run_id'],
  ['master_product_abc_formula_states', 'published_sellpia_source_import_run_id'],
  ['master_product_abc_evaluations', 'sellpia_source_import_run_id'],
  ['master_product_abc_grade_histories', 'next_sellpia_source_import_run_id'],
  ['master_product_abc_grade_histories', 'previous_sellpia_source_import_run_id'],
];

type Db = PrismaClient | Prisma.TransactionClient;

export async function restoreLegacySourceImportRunReferences(db: Db): Promise<void> {
  await dropLegacySourceImportRunReferences(db);
  for (const statement of LEGACY_SOURCE_IMPORT_RUN_REFERENCES_DDL) await db.$executeRawUnsafe(statement);
}

export async function dropLegacySourceImportRunReferences(db: Db): Promise<void> {
  for (const [table, constraint] of LEGACY_FOREIGN_KEYS) {
    await db.$executeRawUnsafe(`ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`);
  }
  for (const [table, column] of LEGACY_COLUMNS) {
    await db.$executeRawUnsafe(`ALTER TABLE IF EXISTS "${table}" DROP COLUMN IF EXISTS "${column}"`);
  }
}
