import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The foreign keys into `source_import_runs` that Office 0.1.31 had and KID-365 turned into plain id columns
 * (ADR-0013). The executed v0.1.31 pre-schema migrations (012, 014) still meet them on that Office shape, so their
 * specs restore them here and drop them again after. Generated with `prisma migrate diff` from the post-change to
 * the pre-change schema.
 */
const LEGACY_SOURCE_IMPORT_RUN_FOREIGN_KEYS: readonly string[] = [
  `ALTER TABLE "coupang_keyword_rank_daily_snapshots" ADD CONSTRAINT "coupang_keyword_rank_daily_snapshots_source_import_run_id__fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_keyword_serp_daily_snapshots" ADD CONSTRAINT "coupang_keyword_serp_daily_snapshots_source_import_run_id__fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "coupang_wing_sales_rank_daily_snapshots" ADD CONSTRAINT "coupang_wing_sales_rank_daily_snapshots_source_import_run__fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "sellpia_sales_daily_snapshots" ADD CONSTRAINT "sellpia_sales_daily_snapshots_source_import_run_id_organiz_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "sellpia_product_monthly_sales" ADD CONSTRAINT "sellpia_product_monthly_sales_source_import_run_id_organiz_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
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

const LEGACY_CONSTRAINTS: ReadonlyArray<readonly [table: string, constraint: string]> = [
  ['coupang_keyword_rank_daily_snapshots', 'coupang_keyword_rank_daily_snapshots_source_import_run_id__fkey'],
  ['coupang_keyword_serp_daily_snapshots', 'coupang_keyword_serp_daily_snapshots_source_import_run_id__fkey'],
  ['coupang_wing_sales_rank_daily_snapshots', 'coupang_wing_sales_rank_daily_snapshots_source_import_run__fkey'],
  ['sellpia_sales_daily_snapshots', 'sellpia_sales_daily_snapshots_source_import_run_id_organiz_fkey'],
  ['sellpia_product_monthly_sales', 'sellpia_product_monthly_sales_source_import_run_id_organiz_fkey'],
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

type Db = PrismaClient | Prisma.TransactionClient;

export async function restoreLegacySourceImportRunForeignKeys(db: Db): Promise<void> {
  await dropLegacySourceImportRunForeignKeys(db);
  for (const statement of LEGACY_SOURCE_IMPORT_RUN_FOREIGN_KEYS) await db.$executeRawUnsafe(statement);
}

export async function dropLegacySourceImportRunForeignKeys(db: Db): Promise<void> {
  for (const [table, constraint] of LEGACY_CONSTRAINTS) {
    await db.$executeRawUnsafe(`ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`);
  }
}
