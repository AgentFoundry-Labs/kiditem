import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';
import { simplifyProductReferencesMigration } from '../../../../scripts/data-migrations/v0.1.31/017_simplify_product_references';

const MASTER_ID = '10000000-0000-0000-0000-000000000001';
const OTHER_MASTER_ID = '10000000-0000-0000-0000-000000000002';
const MISSING_MASTER_ID = '10000000-0000-0000-0000-000000000003';
const ACCOUNT_ID = '20000000-0000-0000-0000-000000000001';
const LISTING_ID = '30000000-0000-0000-0000-000000000001';
const OPTION_ID = '40000000-0000-0000-0000-000000000001';
const RECIPE_ID = '50000000-0000-0000-0000-000000000001';
const SNAPSHOT_ID = '60000000-0000-0000-0000-000000000001';
const VALID_ALIAS_ID = '70000000-0000-0000-0000-000000000001';
const DUPLICATE_ALIAS_ID = '70000000-0000-0000-0000-000000000002';
const DUPLICATE_ALIAS_2_ID = '70000000-0000-0000-0000-000000000003';
const UNMATCHED_ALIAS_ID = '70000000-0000-0000-0000-000000000004';
const CROSS_ORG_ALIAS_ID = '70000000-0000-0000-0000-000000000005';

const SNAPSHOT_HASH = 'a'.repeat(64);

describe('v0.1.31:017 product reference simplification (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedFixture();
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('removes only stale hints, preserves aliases and confirmed recipes, and is idempotent', async () => {
    const first = await prisma.$transaction(async (tx) => {
      await createAliasShadow(tx);
      await insertAliasShadowRows(tx, [
        [VALID_ALIAS_ID, MASTER_ID, 'known'],
        [UNMATCHED_ALIAS_ID, null, 'unmatched'],
        [CROSS_ORG_ALIAS_ID, OTHER_MASTER_ID, 'cross-org'],
      ]);

      const result = await simplifyProductReferencesMigration.run(tx, { target: 'local' });

      const remaining = await tx.$queryRaw<Array<{
        id: string;
        master_product_id: string | null;
      }>>`
        SELECT id::text, master_product_id::text
        FROM sellpia_manual_match_aliases
        ORDER BY id
      `;
      expect(remaining).toEqual([{ id: VALID_ALIAS_ID, master_product_id: MASTER_ID }]);

      await expectConfirmedRecipe(tx);
      return result;
    });

    expect(first).toEqual({
      affectedRows: 3,
      details: { deletedAliases: 2, updatedSnapshots: 1 },
    });

    await expectSnapshot({ aliasCount: 1, snapshotHash: SNAPSHOT_HASH });
    await expectPublicAlias();
    await expectConfirmedRecipe(prisma);

    const second = await prisma.$transaction((tx) =>
      simplifyProductReferencesMigration.run(tx, { target: 'local' }));
    expect(second).toEqual({
      affectedRows: 0,
      details: { deletedAliases: 0, updatedSnapshots: 0 },
    });
    await expectSnapshot({ aliasCount: 1, snapshotHash: SNAPSHOT_HASH });
    await expectPublicAlias();
    await expectConfirmedRecipe(prisma);
  }, 60_000);

  it('rolls back stale-hint deletion when duplicate canonical aliases are found', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await createAliasShadow(tx);
      await insertAliasShadowRows(tx, [
        [DUPLICATE_ALIAS_ID, MASTER_ID, 'duplicate'],
        [DUPLICATE_ALIAS_2_ID, MASTER_ID, 'duplicate'],
        [UNMATCHED_ALIAS_ID, null, 'unmatched'],
      ]);

      await simplifyProductReferencesMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/duplicate product\/quantity keys/);

    await expectSnapshot({ aliasCount: 3, snapshotHash: SNAPSHOT_HASH });
    await expectPublicAlias();
    await expectConfirmedRecipe(prisma);
  }, 60_000);

  it('aborts before cleanup when a supplier product has no canonical master product', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await createAliasShadow(tx);
      await insertAliasShadowRows(tx, [[UNMATCHED_ALIAS_ID, null, 'unmatched']]);
      await createSupplierProductShadow(tx);

      await simplifyProductReferencesMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/Supplier product references must resolve/);

    await expectSnapshot({ aliasCount: 3, snapshotHash: SNAPSHOT_HASH });
    await expectPublicAlias();
    await expectConfirmedRecipe(prisma);
  }, 60_000);

  async function seedFixture(): Promise<void> {
    await prisma.masterProduct.createMany({
      data: [
        {
          id: MASTER_ID,
          organizationId: TEST_ORGANIZATION_ID,
          code: 'MASTER-001',
          sourceAccountKey: 'sellpia:test',
          sourceProductCode: 'PRODUCT-1',
          sourceOptionCode: 'OPTION-1',
          name: 'Canonical product',
        },
        {
          id: OTHER_MASTER_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          code: 'MASTER-002',
          sourceAccountKey: 'sellpia:other',
          sourceProductCode: 'PRODUCT-2',
          sourceOptionCode: 'OPTION-2',
          name: 'Other organization product',
        },
      ],
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
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        id: RECIPE_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: OPTION_ID,
        masterProductId: MASTER_ID,
        quantity: 2,
      },
    });
    await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        id: SNAPSHOT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        targetCount: 3,
        matchedTargetCount: 3,
        aliasCount: 3,
        snapshotHash: SNAPSHOT_HASH,
        capturedAt: new Date('2026-09-21T00:00:00Z'),
      },
    });
    await prisma.sellpiaManualMatchAlias.create({
      data: {
        id: VALID_ALIAS_ID,
        organizationId: TEST_ORGANIZATION_ID,
        snapshotId: SNAPSHOT_ID,
        masterProductId: MASTER_ID,
        aliasTitle: 'Known title',
        normalizedAlias: 'known',
        itemCount: 1,
        matchedType: 'E',
        evidenceCount: 1,
      },
    });
  }

  async function createAliasShadow(tx: Prisma.TransactionClient): Promise<void> {
    // The final schema makes this key non-null and unique. A transaction-local
    // shadow models the nullable pre-schema table without changing that schema.
    await tx.$executeRaw`
      CREATE TEMPORARY TABLE sellpia_manual_match_aliases (
        id uuid NOT NULL,
        organization_id uuid NOT NULL,
        snapshot_id uuid NOT NULL,
        master_product_id uuid,
        normalized_alias text NOT NULL,
        item_count integer NOT NULL
      ) ON COMMIT DROP
    `;
  }

  async function insertAliasShadowRows(
    tx: Prisma.TransactionClient,
    rows: ReadonlyArray<readonly [string, string | null, string]>,
  ): Promise<void> {
    for (const [id, masterProductId, normalizedAlias] of rows) {
      await tx.$executeRaw`
        INSERT INTO sellpia_manual_match_aliases (
          id, organization_id, snapshot_id, master_product_id,
          normalized_alias, item_count
        ) VALUES (
          ${id}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${SNAPSHOT_ID}::uuid,
          ${masterProductId}::uuid, ${normalizedAlias}, 1
        )
      `;
    }
  }

  async function createSupplierProductShadow(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`
      CREATE TEMPORARY TABLE supplier_products (
        organization_id uuid NOT NULL,
        master_product_id uuid
      ) ON COMMIT DROP
    `;
    await tx.$executeRaw`
      INSERT INTO supplier_products (organization_id, master_product_id)
      VALUES (${TEST_ORGANIZATION_ID}::uuid, ${MISSING_MASTER_ID}::uuid)
    `;
  }

  async function expectSnapshot(expected: {
    aliasCount: number;
    snapshotHash: string;
  }): Promise<void> {
    await expect(prisma.$queryRaw<Array<{
      alias_count: number;
      snapshot_hash: string;
    }>>`
      SELECT alias_count, snapshot_hash
      FROM sellpia_manual_match_snapshots
      WHERE id = ${SNAPSHOT_ID}::uuid
    `).resolves.toEqual([{
      alias_count: expected.aliasCount,
      snapshot_hash: expected.snapshotHash,
    }]);
  }

  async function expectPublicAlias(): Promise<void> {
    await expect(prisma.$queryRaw<Array<{
      id: string;
      master_product_id: string;
    }>>`
      SELECT id::text, master_product_id::text
      FROM sellpia_manual_match_aliases
      WHERE snapshot_id = ${SNAPSHOT_ID}::uuid
    `).resolves.toEqual([{ id: VALID_ALIAS_ID, master_product_id: MASTER_ID }]);
  }

  async function expectConfirmedRecipe(client: PrismaClient | Prisma.TransactionClient): Promise<void> {
    await expect(client.$queryRaw<Array<{
      id: string;
      master_product_id: string;
      quantity: number;
    }>>`
      SELECT id::text, master_product_id::text, quantity
      FROM channel_listing_option_inventory_components
      WHERE id = ${RECIPE_ID}::uuid
    `).resolves.toEqual([{
      id: RECIPE_ID,
      master_product_id: MASTER_ID,
      quantity: 2,
    }]);
  }
});
