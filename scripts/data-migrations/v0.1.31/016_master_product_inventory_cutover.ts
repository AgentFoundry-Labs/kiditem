import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import {
  assertMasterProductInventoryCutoverPlan,
  planMasterProductInventoryMappings,
  type ExistingMasterProductRow,
  type InventoryCutoverIssue,
  type LegacySellpiaSkuRow,
  type SourceAccountRow,
} from '../helpers/master-product-inventory-cutover';
import {
  assertKidItemCodeSequenceDefinition,
  KID_ITEM_CODE_SEQUENCE,
  KID_ITEM_CODE_MAX,
  kidItemCodeSequenceStep,
} from '../ensure/kid-item-code-sequence';
import type { DataMigration, DataMigrationContext, MigrationResult } from '../types';

type LegacySkuRecord = LegacySellpiaSkuRow & {
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
};

type MasterProductRecord = ExistingMasterProductRow;

type ShapeRow = {
  legacy_table_exists: boolean;
  legacy_component_column_exists: boolean;
  origin_channel_listing_id_exists: boolean;
  image_urls_exists: boolean;
};

type ImportRunIssueRow = {
  sku_id: string;
  organization_id: string;
  last_import_run_id: string;
  run_organization_id: string | null;
};

type ReferenceStatus = {
  table: string;
  historical: boolean;
  unresolved: number;
  crossOrganization: number;
  existingMasterConflict: number;
  existingMasterMissing: number;
};

type ReferenceSpec = {
  table: string;
  historical: boolean;
  required: boolean;
};

type UnlinkedMasterProductCandidate = {
  id: string;
  organizationId: string;
};

type MasterProductReferenceSpec = {
  table: string;
  column: string;
};

type MasterProductReferenceCountRow = {
  master_product_id: string;
  reference_count: bigint | number | string;
};

type LegacySkuForeignKeyRow = {
  schema_name: string;
  table_name: string;
  constraint_name: string;
};

const LEGACY_REFERENCE_SPECS: readonly ReferenceSpec[] = [
  {
    table: 'channel_listing_option_inventory_components',
    historical: false,
    required: true,
  },
  { table: 'supplier_products', historical: false, required: true },
  { table: 'sellpia_manual_match_aliases', historical: true, required: false },
  { table: 'stock_transfers', historical: true, required: false },
  { table: 'return_transfers', historical: true, required: false },
  { table: 'purchase_order_items', historical: true, required: false },
  { table: 'rocket_purchase_confirmation_allocations', historical: true, required: false },
  { table: 'sellpia_product_monthly_sales', historical: true, required: false },
];

const MASTER_PRODUCT_REFERENCE_SPECS: readonly MasterProductReferenceSpec[] = [
  { table: 'master_product_abc_evaluations', column: 'master_product_id' },
  { table: 'master_product_abc_grade_histories', column: 'master_product_id' },
  { table: 'channel_listings', column: 'master_product_id' },
  { table: 'channel_ad_listing_product_monthly_facts', column: 'master_product_id' },
  { table: 'sellpia_product_monthly_sales', column: 'master_product_id' },
  { table: 'channel_listing_option_inventory_components', column: 'master_product_id' },
  { table: 'supplier_products', column: 'master_product_id' },
  { table: 'stock_transfers', column: 'master_product_id' },
  { table: 'return_transfers', column: 'master_product_id' },
  { table: 'purchase_order_items', column: 'master_product_id' },
  { table: 'rocket_purchase_confirmation_allocations', column: 'master_product_id' },
  { table: 'sellpia_manual_match_aliases', column: 'master_product_id' },
  { table: 'sourcing_candidates', column: 'provenance_master_product_id' },
];

const PRE_SCHEMA_COLUMNS: readonly string[] = [
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS source_account_key text',
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS source_product_code text',
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS source_option_code text',
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS option_name text',
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS barcode text',
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS current_stock integer NOT NULL DEFAULT 0',
  'ALTER TABLE master_products ADD COLUMN IF NOT EXISTS purchase_price integer',
  'ALTER TABLE channel_listing_options ADD COLUMN IF NOT EXISTS kid_item_code varchar(11)',
  'ALTER TABLE channel_listing_options DROP CONSTRAINT IF EXISTS channel_listing_options_kid_item_code_key',
  'DROP INDEX IF EXISTS channel_listing_options_kid_item_code_key',
  'ALTER TABLE channel_listing_option_inventory_components ADD COLUMN IF NOT EXISTS master_product_id uuid',
  'ALTER TABLE sellpia_manual_match_aliases ADD COLUMN IF NOT EXISTS master_product_id uuid',
  'ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS master_product_id uuid',
  'ALTER TABLE return_transfers ADD COLUMN IF NOT EXISTS master_product_id uuid',
  'ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS master_product_id uuid',
  'ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS master_product_id uuid',
  'ALTER TABLE rocket_purchase_confirmation_allocations ADD COLUMN IF NOT EXISTS master_product_id uuid',
];

/**
 * KID-275/277/284 expand/contract cutover.
 *
 * The legacy row's existing master_product_id is the sole live identity
 * mapping. This migration never creates a MasterProduct or guesses from a
 * name, barcode, or code. Current recipe/supplier references must resolve; the
 * record-only tables retain their old physical SKU id and may remain
 * unresolved after the old table is removed.
 */
export async function migrateMasterProductInventoryCutover(
  tx: PrismaTypes.TransactionClient,
  context: DataMigrationContext = { target: 'local' },
): Promise<MigrationResult> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: serialize the one global inventory cutover.
    SELECT pg_advisory_xact_lock(hashtextextended('kiditem.master-product-inventory-cutover', 0))::text AS "lock"
  `;

  for (const statement of PRE_SCHEMA_COLUMNS) {
    await tx.$executeRaw(Prisma.raw(statement));
  }

  const [shape] = await tx.$queryRaw<ShapeRow[]>`
    SELECT
      to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS legacy_table_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_listing_option_inventory_components'
          AND column_name = 'sellpia_inventory_sku_id'
      ) AS legacy_component_column_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'master_products'
          AND column_name = 'origin_channel_listing_id'
      ) AS origin_channel_listing_id_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'master_products'
          AND column_name = 'image_urls'
      ) AS image_urls_exists
  `;
  if (!shape?.legacy_table_exists) {
    if (shape?.legacy_component_column_exists) {
      throw new Error(
        'MasterProduct inventory cutover found legacy recipe references without '
        + 'sellpia_inventory_skus; refusing to infer their MasterProduct ids.',
      );
    }
    return {
      affectedRows: 0,
      details: {
        legacyTablePresent: false,
        outcome: 'unchanged',
        target: context.target,
      },
    };
  }

  const legacySkus = await tx.$queryRaw<LegacySkuRecord[]>`
    SELECT
      id::text AS id,
      organization_id::text AS "organizationId",
      master_product_id::text AS "masterProductId",
      code,
      name,
      option_name AS "optionName",
      barcode,
      current_stock AS "currentStock",
      purchase_price AS "purchasePrice",
      raw_json AS "rawJson"
    FROM sellpia_inventory_skus
    ORDER BY organization_id, id
  `;
  const sourceAccounts = await tx.$queryRaw<SourceAccountRow[]>`
    SELECT organization_id::text AS "organizationId", source_account_key AS "sourceAccountKey"
    FROM sellpia_inventory_states
    ORDER BY organization_id
  `;
  const masterProducts = await tx.$queryRaw<MasterProductRecord[]>`
    SELECT
      id::text AS id,
      organization_id::text AS "organizationId",
      source_account_key AS "sourceAccountKey",
      source_product_code AS "sourceProductCode",
      source_option_code AS "sourceOptionCode"
    FROM master_products
    ORDER BY organization_id, id
  `;

  const plan = planMasterProductInventoryMappings({
    skus: legacySkus,
    sourceAccounts,
    masterProducts,
  });
  const unlinkedMasterProductIssues = plan.issues.filter(
    (issue) => issue.code === 'unlinked_master_product' && issue.masterProductId,
  );
  const disposableUnlinkedMasterProducts = await findDisposableUnlinkedMasterProducts(
    tx,
    unlinkedMasterProductIssues,
    shape,
  );
  const disposableUnlinkedMasterProductKeys = new Set(
    disposableUnlinkedMasterProducts.map((candidate) =>
      `${candidate.organizationId}\u001f${candidate.id}`),
  );
  const effectivePlan = {
    mappings: plan.mappings,
    issues: plan.issues.filter((issue) =>
      issue.code !== 'unlinked_master_product'
      || !issue.masterProductId
      || !disposableUnlinkedMasterProductKeys.has(
        `${issue.organizationId}\u001f${issue.masterProductId}`,
      )),
  };
  assertMasterProductInventoryCutoverPlan(effectivePlan);

  await assertLegacyImportRuns(tx);

  await tx.$executeRaw`
    CREATE TEMP TABLE kiditem_master_product_inventory_cutover_map (
      legacy_sellpia_inventory_sku_id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      master_product_id uuid NOT NULL,
      source_account_key text NOT NULL,
      source_product_code text NOT NULL,
      source_option_code text NOT NULL
    ) ON COMMIT DROP
  `;
  if (plan.mappings.length > 0) {
    const values = plan.mappings.map((mapping) => Prisma.sql`(
      ${mapping.legacySellpiaInventorySkuId}::uuid,
      ${mapping.organizationId}::uuid,
      ${mapping.masterProductId}::uuid,
      ${mapping.sourceAccountKey},
      ${mapping.sourceProductCode},
      ${mapping.sourceOptionCode}
    )`);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO kiditem_master_product_inventory_cutover_map (
        legacy_sellpia_inventory_sku_id,
        organization_id,
        master_product_id,
        source_account_key,
        source_product_code,
        source_option_code
      ) VALUES ${Prisma.join(values)}
    `);
  }

  await assertMappedReferenceUniqueness(tx);

  const references = [] as ReferenceStatus[];
  for (const spec of LEGACY_REFERENCE_SPECS) {
    const status = await readReferenceStatus(tx, spec.table, spec.historical);
    references.push(status);
    if (
      status.crossOrganization > 0
      || status.existingMasterConflict > 0
      || status.existingMasterMissing > 0
      || (spec.required && status.unresolved > 0)
    ) {
      throw new Error(
        `MasterProduct inventory cutover reference preflight failed for ${spec.table}: `
        + JSON.stringify(status),
      );
    }
  }

  const deletedUnlinkedMasterProducts = await deleteDisposableUnlinkedMasterProducts(
    tx,
    disposableUnlinkedMasterProducts,
    shape,
  );

  const masterUpdated = toRowCount(await tx.$executeRaw`
    UPDATE master_products master_product
    SET
      source_account_key = cutover.source_account_key,
      source_product_code = cutover.source_product_code,
      source_option_code = cutover.source_option_code,
      name = legacy.name,
      option_name = legacy.option_name,
      barcode = legacy.barcode,
      current_stock = legacy.current_stock,
      purchase_price = legacy.purchase_price,
      updated_at = now()
    FROM kiditem_master_product_inventory_cutover_map cutover
    JOIN sellpia_inventory_skus legacy
      ON legacy.id = cutover.legacy_sellpia_inventory_sku_id
     AND legacy.organization_id = cutover.organization_id
    WHERE master_product.id = cutover.master_product_id
      AND master_product.organization_id = cutover.organization_id
  `);

  const currentReferencesUpdated =
    await updateReferenceTable(tx, 'channel_listing_option_inventory_components')
    + await updateReferenceTable(tx, 'supplier_products');
  let historicalReferencesUpdated = 0;
  let unresolvedHistoricalReferenceCount = 0;
  for (const spec of LEGACY_REFERENCE_SPECS.filter((entry) => entry.historical)) {
    historicalReferencesUpdated += await updateReferenceTable(tx, spec.table);
    unresolvedHistoricalReferenceCount += references.find((entry) => entry.table === spec.table)?.unresolved ?? 0;
  }

  // Ensure the allocator exists and is positioned after every existing KID
  // code before allocating new MasterProduct or Channel bundle codes. Legacy
  // MasterProduct codes are allowed to be non-KID values only until this
  // migration rewrites them; the post-schema ensure step validates the final
  // shape strictly.
  await prepareKidItemCodeSequenceForCutover(tx);
  const allocatedMasterProductCodes = toRowCount(await tx.$executeRaw`
    WITH to_allocate AS MATERIALIZED (
      SELECT id, nextval(${KID_ITEM_CODE_SEQUENCE}::regclass) AS sequence_value
      FROM master_products
      WHERE code IS NULL OR code !~ '^KID[0-9]{8}$'
      ORDER BY id
    )
    UPDATE master_products master_product
    SET code = 'KID' || lpad(to_allocate.sequence_value::text, 8, '0'),
        updated_at = now()
    FROM to_allocate
    WHERE master_product.id = to_allocate.id
  `);
  const allocatedChannelBundleCodes = toRowCount(await tx.$executeRaw`
    WITH bundle_options AS MATERIALIZED (
      SELECT channel_listing_option_id
      FROM channel_listing_option_inventory_components
      GROUP BY channel_listing_option_id
      HAVING COUNT(*) > 1 OR COALESCE(SUM(quantity), 0) <> 1
    ), to_allocate AS MATERIALIZED (
      SELECT option.id, nextval(${KID_ITEM_CODE_SEQUENCE}::regclass) AS sequence_value
      FROM channel_listing_options option
      JOIN bundle_options bundle ON bundle.channel_listing_option_id = option.id
      WHERE option.kid_item_code IS NULL
      ORDER BY option.id
    )
    UPDATE channel_listing_options option
    SET kid_item_code = 'KID' || lpad(to_allocate.sequence_value::text, 8, '0'),
        updated_at = now()
    FROM to_allocate
    WHERE option.id = to_allocate.id
  `);

  // Validate the fully allocated namespace before dropping the source table.
  // This catches duplicate pre-existing KID values and illegal channel-code
  // reuse inside the same transaction, so a later db push cannot leave a
  // committed destructive cutover behind a uniqueness failure.
  await kidItemCodeSequenceStep.run(tx, context);

  const droppedLegacySkuForeignKeys = await dropLegacySkuInboundForeignKeys(tx);
  await tx.$executeRaw`
    ALTER TABLE channel_listing_option_inventory_components
      DROP COLUMN IF EXISTS sellpia_inventory_sku_id
  `;
  await tx.$executeRaw`DROP TABLE sellpia_inventory_skus`;

  const unresolvedByTable = Object.fromEntries(
    references
      .filter((entry) => entry.historical && entry.unresolved > 0)
      .map((entry) => [entry.table, entry.unresolved]),
  );
  return {
    affectedRows:
      masterUpdated
      + currentReferencesUpdated
      + historicalReferencesUpdated
      + allocatedMasterProductCodes
      + allocatedChannelBundleCodes
      + legacySkus.length,
    details: {
      target: context.target,
      legacyTablePresent: true,
      legacySkuCount: legacySkus.length,
      mappedMasterProductCount: plan.mappings.length,
      masterProductsUpdated: masterUpdated,
      currentReferencesUpdated,
      historicalReferencesUpdated,
      unresolvedHistoricalReferenceCount,
      unresolvedHistoricalReferencesByTable: unresolvedByTable,
      allocatedMasterProductCodes,
      allocatedChannelBundleCodes,
      droppedLegacySkuForeignKeys,
      unlinkedMasterProductsDeleted: deletedUnlinkedMasterProducts,
      unlinkedMasterProductDeletionFieldsPresent:
        shape.origin_channel_listing_id_exists && shape.image_urls_exists,
      sourceAccounts: sourceAccounts
        .filter((row) => row.sourceAccountKey)
        .map((row) => ({ organizationId: row.organizationId, sourceAccountKey: row.sourceAccountKey })),
      droppedLegacySkuTable: true,
      droppedLegacyRecipeReferenceColumn: true,
    },
  };
}

export const migrateMasterProductInventoryCutoverMigration: DataMigration = {
  id: 'v0.1.31:016_master_product_inventory_cutover',
  releaseVersion: '0.1.31',
  name: 'Move Sellpia current inventory into canonical MasterProducts and preserve SKU history',
  phase: 'pre-schema',
  run: migrateMasterProductInventoryCutover,
};

async function assertLegacyImportRuns(tx: PrismaTypes.TransactionClient): Promise<void> {
  const issues = await tx.$queryRaw<ImportRunIssueRow[]>`
    SELECT
      sku.id::text AS sku_id,
      sku.organization_id::text AS organization_id,
      sku.last_import_run_id::text AS last_import_run_id,
      run.organization_id::text AS run_organization_id
    FROM sellpia_inventory_skus sku
    LEFT JOIN source_import_runs run ON run.id = sku.last_import_run_id
    WHERE sku.last_import_run_id IS NOT NULL
      AND (
        run.id IS NULL
        OR run.organization_id <> sku.organization_id
      )
    ORDER BY sku.organization_id, sku.id
  `;
  if (issues.length > 0) {
    throw new Error(
      'MasterProduct inventory cutover found missing or cross-organization legacy import runs: '
      + JSON.stringify(issues),
    );
  }
}

async function readReferenceStatus(
  tx: PrismaTypes.TransactionClient,
  table: string,
  historical: boolean,
): Promise<ReferenceStatus> {
  const tableIdentifier = Prisma.raw(table);
  const [row] = await tx.$queryRaw<Array<{
    unresolved: bigint | number | string;
    cross_organization: bigint | number | string;
    existing_master_conflict: bigint | number | string;
    existing_master_missing: bigint | number | string;
  }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE reference.sellpia_inventory_sku_id IS NOT NULL
          AND legacy.id IS NULL
      )::bigint AS unresolved,
      COUNT(*) FILTER (
        WHERE legacy.id IS NOT NULL
          AND legacy.organization_id <> reference.organization_id
      )::bigint AS cross_organization,
      COUNT(*) FILTER (
        WHERE reference.master_product_id IS NOT NULL
          AND cutover.master_product_id IS NOT NULL
          AND reference.master_product_id <> cutover.master_product_id
      )::bigint AS existing_master_conflict,
      COUNT(*) FILTER (
        WHERE reference.master_product_id IS NOT NULL
          AND existing_master.id IS NULL
      )::bigint AS existing_master_missing
    FROM ${tableIdentifier} reference
    LEFT JOIN sellpia_inventory_skus legacy
      ON legacy.id = reference.sellpia_inventory_sku_id
    LEFT JOIN kiditem_master_product_inventory_cutover_map cutover
      ON cutover.legacy_sellpia_inventory_sku_id = reference.sellpia_inventory_sku_id
     AND cutover.organization_id = reference.organization_id
    LEFT JOIN master_products existing_master
      ON existing_master.id = reference.master_product_id
     AND existing_master.organization_id = reference.organization_id
  `);
  return {
    table,
    historical,
    unresolved: toRowCount(row?.unresolved ?? 0),
    crossOrganization: toRowCount(row?.cross_organization ?? 0),
    existingMasterConflict: toRowCount(row?.existing_master_conflict ?? 0),
    existingMasterMissing: toRowCount(row?.existing_master_missing ?? 0),
  };
}

async function updateReferenceTable(
  tx: PrismaTypes.TransactionClient,
  table: string,
): Promise<number> {
  const result = await tx.$executeRaw(Prisma.sql`
    UPDATE ${Prisma.raw(table)} reference
    SET master_product_id = cutover.master_product_id
    FROM kiditem_master_product_inventory_cutover_map cutover
    WHERE reference.sellpia_inventory_sku_id = cutover.legacy_sellpia_inventory_sku_id
      AND reference.organization_id = cutover.organization_id
      AND (
        reference.master_product_id IS NULL
        OR reference.master_product_id <> cutover.master_product_id
      )
  `);
  return toRowCount(result);
}

async function assertMappedReferenceUniqueness(
  tx: PrismaTypes.TransactionClient,
): Promise<void> {
  const conflicts = await tx.$queryRaw<Array<{
    table_name: string;
    reference_key: string;
    row_count: bigint | number | string;
  }>>(Prisma.sql`
    WITH conflicts AS (
      SELECT
        'channel_listing_option_inventory_components'::text AS table_name,
        reference.channel_listing_option_id::text || ':' || cutover.master_product_id::text AS reference_key,
        COUNT(*)::bigint AS row_count
      FROM channel_listing_option_inventory_components reference
      JOIN kiditem_master_product_inventory_cutover_map cutover
        ON cutover.legacy_sellpia_inventory_sku_id = reference.sellpia_inventory_sku_id
       AND cutover.organization_id = reference.organization_id
      GROUP BY reference.channel_listing_option_id, cutover.master_product_id
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT
        'supplier_products'::text,
        reference.supplier_id::text || ':' || cutover.master_product_id::text,
        COUNT(*)::bigint
      FROM supplier_products reference
      JOIN kiditem_master_product_inventory_cutover_map cutover
        ON cutover.legacy_sellpia_inventory_sku_id = reference.sellpia_inventory_sku_id
       AND cutover.organization_id = reference.organization_id
      GROUP BY reference.supplier_id, cutover.master_product_id
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT
        'supplier_products.primary'::text,
        reference.organization_id::text || ':' || cutover.master_product_id::text,
        COUNT(*)::bigint
      FROM supplier_products reference
      JOIN kiditem_master_product_inventory_cutover_map cutover
        ON cutover.legacy_sellpia_inventory_sku_id = reference.sellpia_inventory_sku_id
       AND cutover.organization_id = reference.organization_id
      WHERE reference.is_primary = true
      GROUP BY reference.organization_id, cutover.master_product_id
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT
        'rocket_purchase_confirmation_allocations'::text,
        reference.confirmation_line_id::text || ':' || cutover.master_product_id::text,
        COUNT(*)::bigint
      FROM rocket_purchase_confirmation_allocations reference
      JOIN kiditem_master_product_inventory_cutover_map cutover
        ON cutover.legacy_sellpia_inventory_sku_id = reference.sellpia_inventory_sku_id
       AND cutover.organization_id = reference.organization_id
      GROUP BY reference.confirmation_line_id, cutover.master_product_id
      HAVING COUNT(*) > 1
    )
    SELECT table_name, reference_key, row_count
    FROM conflicts
    ORDER BY table_name, reference_key
  `);
  if (conflicts.length > 0) {
    throw new Error(
      'MasterProduct inventory cutover would create duplicate canonical references: '
      + JSON.stringify(conflicts),
    );
  }
}

async function findDisposableUnlinkedMasterProducts(
  tx: PrismaTypes.TransactionClient,
  issues: readonly InventoryCutoverIssue[],
  shape: ShapeRow,
): Promise<UnlinkedMasterProductCandidate[]> {
  // These fields are legacy-only evidence. If the old schema no longer has
  // them, retain the fail-closed unlinked-product behavior instead of
  // synthesizing a disposition from the final schema.
  if (!shape.origin_channel_listing_id_exists || !shape.image_urls_exists) return [];
  const candidateIds = Array.from(new Set(
    issues
      .map((issue) => issue.masterProductId)
      .filter((id): id is string => Boolean(id)),
  ));
  if (candidateIds.length === 0) return [];

  const idValues = candidateIds.map((id) => Prisma.sql`${id}::uuid`);
  const candidates = await tx.$queryRaw<UnlinkedMasterProductCandidate[]>(Prisma.sql`
    -- queryraw-tenancy-exempt: inspect the global pre-cutover disposition of
    -- surviving MasterProducts before deleting only explicitly safe rows.
    SELECT id::text AS "id", organization_id::text AS "organizationId"
    FROM master_products
    WHERE id IN (${Prisma.join(idValues)})
      AND origin_channel_listing_id IS NOT NULL
      AND COALESCE(cardinality(image_urls), 0) = 0
    ORDER BY organization_id, id
  `);
  if (candidates.length === 0) return [];

  const referenceCounts = await readMasterProductReferenceCounts(
    tx,
    candidates.map((candidate) => candidate.id),
  );
  return candidates.filter((candidate) => !referenceCounts.has(candidate.id));
}

async function readMasterProductReferenceCounts(
  tx: PrismaTypes.TransactionClient,
  candidateIds: readonly string[],
): Promise<Map<string, number>> {
  const specs = MASTER_PRODUCT_REFERENCE_SPECS;
  const conditions = specs.map(({ table, column }) =>
    Prisma.sql`(table_name = ${table} AND column_name = ${column})`,
  );
  const available = await tx.$queryRaw<Array<{ table_name: string; column_name: string }>>(Prisma.sql`
    -- queryraw-tenancy-exempt: enumerate global cross-owner references to
    -- candidates before the transactional legacy-product deletion.
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (${Prisma.join(conditions, ' OR ')})
  `);
  const availableKeys = new Set(available.map((row) => `${row.table_name}\u001f${row.column_name}`));
  const idValues = candidateIds.map((id) => Prisma.sql`${id}::uuid`);
  const counts = new Map<string, number>();
  for (const spec of specs) {
    if (!availableKeys.has(`${spec.table}\u001f${spec.column}`)) continue;
    const table = Prisma.raw(`"public".${quoteIdentifier(spec.table)}`);
    const column = Prisma.raw(quoteIdentifier(spec.column));
    const rows = await tx.$queryRaw<MasterProductReferenceCountRow[]>(Prisma.sql`
      -- queryraw-tenancy-exempt: this is an explicit global reference audit
      -- for the approved unlinked-product disposition.
      SELECT ${column}::text AS master_product_id, COUNT(*)::bigint AS reference_count
      FROM ${table}
      WHERE ${column} IN (${Prisma.join(idValues)})
      GROUP BY ${column}
    `);
    for (const row of rows) {
      counts.set(
        row.master_product_id,
        (counts.get(row.master_product_id) ?? 0) + toRowCount(row.reference_count),
      );
    }
  }
  return counts;
}

async function deleteDisposableUnlinkedMasterProducts(
  tx: PrismaTypes.TransactionClient,
  candidates: readonly UnlinkedMasterProductCandidate[],
  shape: ShapeRow,
): Promise<number> {
  if (
    candidates.length === 0
    || !shape.origin_channel_listing_id_exists
    || !shape.image_urls_exists
  ) return 0;
  const idValues = candidates.map((candidate) => Prisma.sql`${candidate.id}::uuid`);
  const deleted = toRowCount(await tx.$executeRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: delete only the reviewed, reference-free
    -- legacy-origin rows inside the cutover transaction.
    DELETE FROM master_products
    WHERE id IN (${Prisma.join(idValues)})
      AND origin_channel_listing_id IS NOT NULL
      AND COALESCE(cardinality(image_urls), 0) = 0
  `));
  if (deleted !== candidates.length) {
    throw new Error(
      'MasterProduct inventory cutover deleted a different number of approved '
      + `unlinked products than preflight (${deleted} vs ${candidates.length}); rolling back.`,
    );
  }
  return deleted;
}

/**
 * Historical rows retain their legacy SKU id as evidence, so the old table
 * cannot be dropped while baseline databases still have inbound FKs to it.
 * Drop only the known legacy-reference constraints and preserve every
 * referencing column and row. An unknown inbound FK blocks the cutover
 * instead of being discarded implicitly by DROP TABLE.
 */
async function dropLegacySkuInboundForeignKeys(
  tx: PrismaTypes.TransactionClient,
): Promise<number> {
  const foreignKeys = await tx.$queryRaw<LegacySkuForeignKeyRow[]>`
    -- queryraw-tenancy-exempt: inspect global schema dependencies before the
    -- one transactional legacy-table removal.
    SELECT
      namespace.nspname AS schema_name,
      referencing.relname AS table_name,
      constraint_row.conname AS constraint_name
    FROM pg_constraint constraint_row
    JOIN pg_class referencing ON referencing.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = referencing.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.sellpia_inventory_skus'::regclass
    ORDER BY namespace.nspname, referencing.relname, constraint_row.conname
  `;
  const knownTables = new Set(LEGACY_REFERENCE_SPECS.map(({ table }) => table));
  const unexpected = foreignKeys.filter((row) =>
    row.schema_name !== 'public' || !knownTables.has(row.table_name));
  if (unexpected.length > 0) {
    throw new Error(
      'MasterProduct inventory cutover found unknown inbound foreign keys to '
      + 'sellpia_inventory_skus; refusing implicit constraint removal: '
      + JSON.stringify(unexpected),
    );
  }

  for (const foreignKey of foreignKeys) {
    await tx.$executeRaw(Prisma.sql`
      ALTER TABLE ${Prisma.raw(quoteIdentifier(foreignKey.schema_name))}.${Prisma.raw(quoteIdentifier(foreignKey.table_name))}
        DROP CONSTRAINT ${Prisma.raw(quoteIdentifier(foreignKey.constraint_name))}
    `);
  }
  return foreignKeys.length;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function toRowCount(value: number | bigint | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`MasterProduct inventory cutover returned an invalid row count: ${String(value)}.`);
  }
  return count;
}

/**
 * Prepare the shared allocator while the pre-schema MasterProduct code may
 * still contain legacy non-KID values. Only valid KID values participate in
 * the bound; the migration immediately replaces every other MasterProduct
 * code before the strict post-schema ensure runs.
 */
async function prepareKidItemCodeSequenceForCutover(
  tx: PrismaTypes.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: serialize allocation in the shared namespace.
    SELECT pg_advisory_xact_lock(hashtextextended('kiditem.kid-item-code-sequence', 0))::text AS "lock"
  `;
  await tx.$executeRaw`
    CREATE SEQUENCE IF NOT EXISTS kid_item_code_seq
      AS integer
      MINVALUE 1
      MAXVALUE 99999999
      START WITH 1
      INCREMENT BY 1
      NO CYCLE
  `;
  await assertKidItemCodeSequenceDefinition(tx);

  const [maxRow] = await tx.$queryRaw<Array<{ max_suffix: bigint | number | string | null }>>`
    SELECT MAX(suffix)::bigint AS max_suffix
    FROM (
      SELECT substring(code FROM 4)::bigint AS suffix
      FROM master_products
      WHERE code ~ '^KID[0-9]{8}$'
      UNION ALL
      SELECT substring(kid_item_code FROM 4)::bigint AS suffix
      FROM channel_listing_options
      WHERE kid_item_code ~ '^KID[0-9]{8}$'
    ) codes
  `;
  const maxSuffix = toSequenceValue(maxRow?.max_suffix ?? 0, 'max existing KID suffix');
  const [state] = await tx.$queryRaw<Array<{
    last_value: bigint | number | string;
    is_called: boolean;
  }>>`
    SELECT last_value, is_called FROM kid_item_code_seq
  `;
  const current = toSequenceValue(state?.last_value ?? 0, 'sequence last value');
  if (maxSuffix > 0 && (!state?.is_called || current < maxSuffix)) {
    await tx.$executeRaw`
      SELECT setval('kid_item_code_seq'::regclass, ${maxSuffix}, true)
    `;
  }
}

function toSequenceValue(value: bigint | number | string, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > KID_ITEM_CODE_MAX) {
    throw new Error(`kid_item_code_seq returned an invalid ${label}: ${String(value)}.`);
  }
  return result;
}
