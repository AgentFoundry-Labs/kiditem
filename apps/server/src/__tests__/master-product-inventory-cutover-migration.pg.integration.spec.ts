import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';
import { kidItemCodeSequenceStep } from '../../../../scripts/data-migrations/ensure/kid-item-code-sequence';
import { migrateMasterProductInventoryCutoverMigration } from '../../../../scripts/data-migrations/v0.1.31/016_master_product_inventory_cutover';

const MASTER_ID = '10000000-0000-0000-0000-000000000001';
const UNLINKED_MASTER_ID = '10000000-0000-0000-0000-000000000002';
const LEGACY_SKU_ID = '20000000-0000-0000-0000-000000000001';
const UNKNOWN_SKU_ID = '20000000-0000-0000-0000-000000000002';
const SOURCE_RUN_ID = '30000000-0000-0000-0000-000000000001';
const ACCOUNT_ID = '40000000-0000-0000-0000-000000000001';
const LISTING_ID = '50000000-0000-0000-0000-000000000001';
const OPTION_ID = '60000000-0000-0000-0000-000000000001';
const OPTION_2_ID = '60000000-0000-0000-0000-000000000002';
const SNAPSHOT_ID = '70000000-0000-0000-0000-000000000001';
const DISPOSABLE_UNLINKED_MASTER_ID = '10000000-0000-0000-0000-000000000003';
const REFERENCED_UNLINKED_MASTER_ID = '10000000-0000-0000-0000-000000000004';

const LEGACY_SKU_FOREIGN_KEYS = [
  ['channel_listing_option_inventory_components', 'test_component_sellpia_sku_fk'],
  ['supplier_products', 'test_supplier_product_sellpia_sku_fk'],
  ['sellpia_manual_match_aliases', 'test_alias_sellpia_sku_fk'],
  ['stock_transfers', 'test_stock_transfer_sellpia_sku_fk'],
  ['return_transfers', 'test_return_transfer_sellpia_sku_fk'],
  ['purchase_order_items', 'test_purchase_order_item_sellpia_sku_fk'],
  ['rocket_purchase_confirmation_allocations', 'test_rocket_allocation_sellpia_sku_fk'],
  ['sellpia_product_monthly_sales', 'test_monthly_sales_sellpia_sku_fk'],
] as const;

describe('v0.1.31:016 MasterProduct inventory cutover (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await resetKidItemCodeSequence();
    await makeLegacyShape();
    await seedBaseFixture(prisma);
    await seedFixture();
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await resetKidItemCodeSequence();
    await restoreCurrentRecipeShape();
    await prisma.$disconnect();
  });

  it('preserves MasterProduct identity, resolves live/history references, and is idempotent', async () => {
    const first = await prisma.$transaction((tx) =>
      migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' }));

    expect(first.details).toMatchObject({
      legacyTablePresent: true,
      legacySkuCount: 1,
      mappedMasterProductCount: 1,
      unresolvedHistoricalReferenceCount: 1,
      allocatedMasterProductCodes: 1,
      allocatedChannelBundleCodes: 0,
      droppedLegacySkuTable: true,
    });

    const master = await prisma.$queryRaw<Array<{
      id: string;
      source_account_key: string;
      source_product_code: string;
      source_option_code: string;
      current_stock: number;
      purchase_price: number;
      code: string;
    }>>`
      SELECT id::text, source_account_key, source_product_code, source_option_code,
             current_stock, purchase_price, code
      FROM master_products
      WHERE id = ${MASTER_ID}::uuid
    `;
    expect(master).toEqual([expect.objectContaining({
      id: MASTER_ID,
      source_account_key: 'sellpia:primary',
      source_product_code: 'P-1',
      source_option_code: 'O-1',
      current_stock: 17,
      purchase_price: 1200,
      code: 'KID00000001',
    })]);

    await expect(prisma.$queryRaw<Array<{ master_product_id: string | null }>>`
      SELECT master_product_id::text
      FROM channel_listing_option_inventory_components
      WHERE channel_listing_option_id = ${OPTION_ID}::uuid
    `).resolves.toEqual([{ master_product_id: MASTER_ID }]);

    // A singleton option may expose the canonical MasterProduct code. It is
    // not an independently issued global code and must not fail the ensure.
    await prisma.$executeRaw`
      UPDATE channel_listing_options
      SET kid_item_code = ${'KID00000001'}
      WHERE id = ${OPTION_ID}::uuid
    `;
    await prisma.channelListingOption.create({
      data: {
        id: OPTION_2_ID,
        organizationId: TEST_ORGANIZATION_ID,
        listingId: LISTING_ID,
        externalOptionId: 'option-2',
        kidItemCode: 'KID00000001',
      },
    });
    await prisma.$executeRaw`
      INSERT INTO channel_listing_option_inventory_components (
        id, organization_id, channel_listing_option_id, master_product_id,
        quantity, created_at, updated_at
      ) VALUES (
        ${randomUUID()}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${OPTION_2_ID}::uuid,
        ${MASTER_ID}::uuid, 1, now(), now()
      )
    `;
    await expect(prisma.$transaction((tx) =>
      kidItemCodeSequenceStep.run(tx, { target: 'local' })))
      .resolves.toMatchObject({
        details: { sequence: 'kid_item_code_seq', maxExistingSuffix: 1 },
      });

    const aliases = await prisma.$queryRaw<Array<{
      sellpia_inventory_sku_id: string;
      master_product_id: string | null;
    }>>`
      SELECT sellpia_inventory_sku_id::text, master_product_id::text
      FROM sellpia_manual_match_aliases
      ORDER BY sellpia_inventory_sku_id
    `;
    expect(aliases).toEqual([
      { sellpia_inventory_sku_id: LEGACY_SKU_ID, master_product_id: MASTER_ID },
      { sellpia_inventory_sku_id: UNKNOWN_SKU_ID, master_product_id: null },
    ]);

    await expect(prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS exists
    `).resolves.toEqual([{ exists: false }]);

    const second = await prisma.$transaction((tx) =>
      migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' }));
    expect(second).toEqual({
      affectedRows: 0,
      details: {
        legacyTablePresent: false,
        outcome: 'unchanged',
        target: 'local',
      },
    });
  }, 60_000);

  it('rolls back all schema/data changes when a live reference is unresolved', async () => {
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        DROP CONSTRAINT IF EXISTS test_component_sellpia_sku_fk
    `;
    await prisma.$executeRaw`
      UPDATE channel_listing_option_inventory_components
      SET sellpia_inventory_sku_id = ${UNKNOWN_SKU_ID}::uuid
      WHERE channel_listing_option_id = ${OPTION_ID}::uuid
    `;

    await expect(prisma.$transaction((tx) =>
      migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' })))
      .rejects.toThrow(/reference preflight failed/);

    await expect(prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS exists
    `).resolves.toEqual([{ exists: true }]);
    await expect(prisma.$queryRaw<Array<{ value: string | null }>>`
      SELECT code AS value FROM master_products WHERE id = ${MASTER_ID}::uuid
    `).resolves.toEqual([{ value: 'INTERNAL-1' }]);
  }, 60_000);

  it('fails the cutover before commit when the existing allocator is malformed', async () => {
    try {
      await prisma.$executeRaw`ALTER SEQUENCE kid_item_code_seq MAXVALUE 100`;

      await expect(prisma.$transaction((tx) =>
        migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' })))
        .rejects.toThrow(/kid_item_code_seq has a malformed definition/);

      await expect(prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS exists
      `).resolves.toEqual([{ exists: true }]);
      await expect(prisma.$queryRaw<Array<{ value: string | null }>>`
        SELECT code AS value FROM master_products WHERE id = ${MASTER_ID}::uuid
      `).resolves.toEqual([{ value: 'INTERNAL-1' }]);
    } finally {
      await prisma.$executeRaw`
        ALTER SEQUENCE kid_item_code_seq
          MINVALUE 1
          MAXVALUE 99999999
          INCREMENT BY 1
          NO CYCLE
      `;
    }
  }, 60_000);

  it('fails before writes when a surviving MasterProduct has no legacy SKU mapping', async () => {
    await prisma.masterProduct.create({
      data: {
        id: UNLINKED_MASTER_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'UNLINKED-1',
        sourceAccountKey: 'sellpia:primary',
        sourceProductCode: 'UNLINKED-PRODUCT',
        sourceOptionCode: '',
        name: 'Unlinked master',
      },
    });

    await expect(prisma.$transaction((tx) =>
      migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' })))
      .rejects.toThrow(new RegExp(`unlinked_master_product.*${UNLINKED_MASTER_ID}`));

    await expect(prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS exists
    `).resolves.toEqual([{ exists: true }]);
    await expect(prisma.$queryRaw<Array<{ code: string }>>`
      SELECT code FROM master_products WHERE id = ${UNLINKED_MASTER_ID}::uuid
    `).resolves.toEqual([{ code: 'UNLINKED-1' }]);
  }, 60_000);

  it('deletes only an unlinked legacy-origin MasterProduct with no images or references', async () => {
    await prisma.masterProduct.create({
      data: {
        id: DISPOSABLE_UNLINKED_MASTER_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'UNLINK-03',
        sourceAccountKey: 'sellpia:primary',
        sourceProductCode: 'DISPOSABLE-PRODUCT',
        sourceOptionCode: '',
        name: 'Disposable imported master',
      },
    });
    await prisma.$executeRaw`
      UPDATE master_products
      SET origin_channel_listing_id = ${LISTING_ID}::uuid
      WHERE id = ${DISPOSABLE_UNLINKED_MASTER_ID}::uuid
    `;

    const result = await prisma.$transaction((tx) =>
      migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' }));

    expect(result.details).toMatchObject({
      unlinkedMasterProductsDeleted: 1,
      droppedLegacySkuForeignKeys: LEGACY_SKU_FOREIGN_KEYS.length,
    });
    await expect(prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM master_products WHERE id = ${DISPOSABLE_UNLINKED_MASTER_ID}::uuid
    `).resolves.toEqual([]);
  }, 60_000);

  it('keeps an unlinked legacy-origin MasterProduct when any current reference exists', async () => {
    await prisma.masterProduct.create({
      data: {
        id: REFERENCED_UNLINKED_MASTER_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'UNLINK-04',
        sourceAccountKey: 'sellpia:primary',
        sourceProductCode: 'REFERENCED-PRODUCT',
        sourceOptionCode: '',
        name: 'Referenced imported master',
      },
    });
    await prisma.$executeRaw`
      UPDATE master_products
      SET origin_channel_listing_id = ${LISTING_ID}::uuid
      WHERE id = ${REFERENCED_UNLINKED_MASTER_ID}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE channel_listings
      SET master_product_id = ${REFERENCED_UNLINKED_MASTER_ID}::uuid
      WHERE id = ${LISTING_ID}::uuid
    `;

    await expect(prisma.$transaction((tx) =>
      migrateMasterProductInventoryCutoverMigration.run(tx, { target: 'local' })))
      .rejects.toThrow(new RegExp(`unlinked_master_product.*${REFERENCED_UNLINKED_MASTER_ID}`));

    await expect(prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM master_products WHERE id = ${REFERENCED_UNLINKED_MASTER_ID}::uuid
    `).resolves.toEqual([{ id: REFERENCED_UNLINKED_MASTER_ID }]);
  }, 60_000);

  async function resetKidItemCodeSequence(): Promise<void> {
    // The allocator is global and is not owned by a table, so reset only the
    // disposable integration fixture between tests. Production code never
    // rewinds this sequence.
    await prisma.$executeRaw`
      ALTER SEQUENCE kid_item_code_seq
        MINVALUE 1
        MAXVALUE 99999999
        START WITH 1
        INCREMENT BY 1
        NO CYCLE
        RESTART WITH 1
    `;
  }

  async function makeLegacyShape(): Promise<void> {
    await dropFixtureLegacyInboundForeignKeys();
    await prisma.$executeRaw`DROP TABLE IF EXISTS sellpia_inventory_skus`;
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        DROP COLUMN IF EXISTS sellpia_inventory_sku_id
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        DROP COLUMN IF EXISTS master_product_id
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        ADD COLUMN sellpia_inventory_sku_id uuid
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listings
        ADD COLUMN IF NOT EXISTS master_product_id uuid
    `;
    await prisma.$executeRaw`
      ALTER TABLE sellpia_manual_match_aliases
        ADD COLUMN IF NOT EXISTS sellpia_inventory_sku_id uuid
    `;
    await prisma.$executeRaw`
      ALTER TABLE sellpia_manual_match_aliases
        ALTER COLUMN master_product_id DROP NOT NULL
    `;
    await prisma.$executeRaw`
      ALTER TABLE supplier_products
        ADD COLUMN IF NOT EXISTS sellpia_inventory_sku_id uuid
    `;
    await prisma.$executeRaw`
      ALTER TABLE master_products
        ADD COLUMN IF NOT EXISTS origin_channel_listing_id uuid
    `;
    await prisma.$executeRaw`
      CREATE TABLE sellpia_inventory_skus (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        master_product_id uuid,
        code text NOT NULL,
        name text NOT NULL,
        option_name text,
        barcode text,
        current_stock integer NOT NULL DEFAULT 0,
        purchase_price integer,
        sale_price integer,
        is_active boolean NOT NULL DEFAULT true,
        raw_json jsonb,
        last_import_run_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  }

  async function restoreCurrentRecipeShape(): Promise<void> {
    await dropFixtureLegacyInboundForeignKeys();
    await prisma.$executeRaw`DROP TABLE IF EXISTS sellpia_inventory_skus`;
    const [oldColumn] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_listing_option_inventory_components'
          AND column_name = 'sellpia_inventory_sku_id'
      ) AS exists
    `;
    if (oldColumn?.exists) {
      await prisma.$executeRaw`
        ALTER TABLE channel_listing_option_inventory_components
          DROP COLUMN sellpia_inventory_sku_id
      `;
    }
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        DROP COLUMN IF EXISTS updated_at
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        ADD COLUMN IF NOT EXISTS master_product_id uuid
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listing_option_inventory_components
        ALTER COLUMN master_product_id SET NOT NULL
    `;
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS channel_listing_option_inventory_components_channel_listing_key
      ON channel_listing_option_inventory_components (channel_listing_option_id, master_product_id)
    `;
    await prisma.$executeRaw`
      ALTER TABLE channel_listings
        DROP COLUMN IF EXISTS master_product_id
    `;
    await prisma.$executeRaw`
      ALTER TABLE sellpia_manual_match_aliases
        DROP COLUMN IF EXISTS sellpia_inventory_sku_id
    `;
    await prisma.$executeRaw`
      ALTER TABLE sellpia_manual_match_aliases
        ALTER COLUMN master_product_id SET NOT NULL
    `;
    await prisma.$executeRaw`
      ALTER TABLE supplier_products
        DROP COLUMN IF EXISTS sellpia_inventory_sku_id
    `;
    await prisma.$executeRaw`
      ALTER TABLE master_products
        DROP COLUMN IF EXISTS origin_channel_listing_id
    `;
  }

  async function seedFixture(): Promise<void> {
    await prisma.sourceImportRun.create({
      data: {
        id: SOURCE_RUN_ID,
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        status: 'completed',
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'sellpia:primary',
      },
    });
    await prisma.masterProduct.create({
      data: {
        id: MASTER_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'INTERNAL-1',
        sourceAccountKey: 'sellpia:primary',
        sourceProductCode: 'P-1',
        sourceOptionCode: 'O-1',
        name: 'Existing master',
      },
    });
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Test channel',
      },
    });
    await prisma.channelListing.create({
      data: {
        id: LISTING_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: 'listing-1',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        id: OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        listingId: LISTING_ID,
        externalOptionId: 'option-1',
      },
    });
    await prisma.$executeRaw`
      INSERT INTO sellpia_inventory_skus (
        id, organization_id, master_product_id, code, name, option_name, barcode,
        current_stock, purchase_price, sale_price, is_active, raw_json, last_import_run_id
      ) VALUES (
        ${LEGACY_SKU_ID}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${MASTER_ID}::uuid,
        'P-1-O-1', 'Source product', 'Option 1', '8800000000001',
        17, 1200, 2400, true,
        '{"productCode":"P-1","optionCode":"O-1"}'::jsonb,
        ${SOURCE_RUN_ID}::uuid
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO channel_listing_option_inventory_components (
        id, organization_id, channel_listing_option_id, sellpia_inventory_sku_id,
        quantity, created_at, updated_at
      ) VALUES (
        ${randomUUID()}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${OPTION_ID}::uuid,
        ${LEGACY_SKU_ID}::uuid, 1, now(), now()
      )
    `;
    await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        id: SNAPSHOT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        targetCount: 2,
        matchedTargetCount: 2,
        aliasCount: 2,
        snapshotHash: 'a'.repeat(64),
        capturedAt: new Date('2026-09-21T00:00:00Z'),
      },
    });
    await prisma.$executeRaw`
      INSERT INTO sellpia_manual_match_aliases (
        id, organization_id, snapshot_id, sellpia_inventory_sku_id,
        alias_title, normalized_alias, item_count, matched_type, evidence_count
      ) VALUES
        (${randomUUID()}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${SNAPSHOT_ID}::uuid, ${LEGACY_SKU_ID}::uuid,
         'Known', 'known', 1, 'E', 1),
        (${randomUUID()}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${SNAPSHOT_ID}::uuid, ${UNKNOWN_SKU_ID}::uuid,
         'Unknown', 'unknown', 1, 'E', 1)
    `;
    await addFixtureLegacyInboundForeignKeys();
  }

  async function addFixtureLegacyInboundForeignKeys(): Promise<void> {
    for (const [table, constraint] of LEGACY_SKU_FOREIGN_KEYS) {
      await prisma.$executeRaw(Prisma.sql`
        ALTER TABLE ${Prisma.raw(`"public"."${table}"`)}
          ADD CONSTRAINT ${Prisma.raw(`"${constraint}"`)}
          FOREIGN KEY (sellpia_inventory_sku_id)
          REFERENCES sellpia_inventory_skus(id)
          NOT VALID
      `);
    }
  }

  async function dropFixtureLegacyInboundForeignKeys(): Promise<void> {
    for (const [table, constraint] of LEGACY_SKU_FOREIGN_KEYS) {
      await prisma.$executeRaw(Prisma.sql`
        ALTER TABLE ${Prisma.raw(`"public"."${table}"`)}
          DROP CONSTRAINT IF EXISTS ${Prisma.raw(`"${constraint}"`)}
      `);
    }
  }
});
