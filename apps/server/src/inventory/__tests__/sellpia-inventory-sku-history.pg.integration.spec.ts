import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { seedActiveSellpiaInventorySku } from '../../test-helpers/inventory-seeds';
import type { PrismaClient } from '@prisma/client';

describe('Sellpia inventory SKU historical references (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('deletes a SKU without losing scoped history or relinking a recollection', async () => {
    const skuId = randomUUID();
    const foreignSkuId = randomUUID();
    await seedActiveSellpiaInventorySku(prisma, {
      id: skuId,
      organizationId: TEST_ORGANIZATION_ID,
      code: 'HISTORY-SKU',
      name: 'Historical SKU',
      currentStock: 12,
    });
    await seedActiveSellpiaInventorySku(prisma, {
      id: foreignSkuId,
      organizationId: OTHER_ORGANIZATION_ID,
      code: 'OTHER-HISTORY-SKU',
      name: 'Other historical SKU',
      currentStock: 7,
    });

    const snapshot = await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'a'.repeat(64),
        capturedAt: new Date('2026-09-20T00:00:00.000Z'),
      },
    });
    const foreignSnapshot = await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'b'.repeat(64),
        capturedAt: new Date('2026-09-20T00:00:00.000Z'),
      },
    });
    const alias = await prisma.sellpiaManualMatchAlias.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        snapshotId: snapshot.id,
        sellpiaInventorySkuId: skuId,
        aliasTitle: 'Historical alias',
        normalizedAlias: 'historical alias',
        itemCount: 1,
        matchedType: 'A',
        evidenceCount: 1,
      },
    });
    const foreignAlias = await prisma.sellpiaManualMatchAlias.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        snapshotId: foreignSnapshot.id,
        sellpiaInventorySkuId: foreignSkuId,
        aliasTitle: 'Other alias',
        normalizedAlias: 'other alias',
        itemCount: 1,
        matchedType: 'A',
        evidenceCount: 1,
      },
    });

    const fromWarehouse = await prisma.warehouse.create({
      data: { organizationId: TEST_ORGANIZATION_ID, name: 'History From' },
    });
    const toWarehouse = await prisma.warehouse.create({
      data: { organizationId: TEST_ORGANIZATION_ID, name: 'History To' },
    });
    const stockTransfer = await prisma.stockTransfer.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaInventorySkuId: skuId,
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        quantity: 2,
        requestedBy: TEST_USER_ID,
      },
    });
    const returnTransfer = await prisma.returnTransfer.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        rtNumber: 'RT-HISTORY-1',
        sellpiaInventorySkuId: skuId,
        quantity: 1,
      },
    });

    const inboundSkuForeignKeys = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT child.relname AS "tableName"
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS child ON child.oid = constraint_row.conrelid
      JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
      WHERE constraint_row.contype = 'f'
        AND parent.relname = 'sellpia_inventory_skus'
      ORDER BY child.relname
    `;
    expect(inboundSkuForeignKeys).toEqual([]);
    const indexedSkuTables = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT DISTINCT tablename AS "tableName"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexdef LIKE '%sellpia_inventory_sku_id%'
      ORDER BY tablename
    `;
    expect(indexedSkuTables.map(({ tableName }) => tableName)).toEqual([
      'channel_listing_option_inventory_components',
      'purchase_order_items',
      'return_transfers',
      'rocket_purchase_confirmation_allocations',
      'sellpia_manual_match_aliases',
      'sellpia_product_monthly_sales',
      'stock_transfers',
      'supplier_products',
    ]);

    await prisma.sellpiaInventorySku.delete({ where: { id: skuId } });

    expect(await prisma.sellpiaInventorySku.findUnique({ where: { id: skuId } })).toBeNull();
    await expect(prisma.sellpiaManualMatchAlias.findUniqueOrThrow({ where: { id: alias.id } }))
      .resolves.toMatchObject({
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaInventorySkuId: skuId,
      });
    await expect(prisma.stockTransfer.findUniqueOrThrow({ where: { id: stockTransfer.id } }))
      .resolves.toMatchObject({
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaInventorySkuId: skuId,
      });
    await expect(prisma.returnTransfer.findUniqueOrThrow({ where: { id: returnTransfer.id } }))
      .resolves.toMatchObject({
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaInventorySkuId: skuId,
      });

    const missingCurrentIdentity = await prisma.sellpiaInventorySku.findFirst({
      where: { id: skuId, organizationId: TEST_ORGANIZATION_ID },
    });
    expect(missingCurrentIdentity).toBeNull();
    expect(
      await prisma.sellpiaManualMatchAlias.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { sellpiaInventorySkuId: true },
      }),
    ).toEqual([{ sellpiaInventorySkuId: skuId }]);
    expect(
      await prisma.sellpiaManualMatchAlias.findMany({
        where: { organizationId: OTHER_ORGANIZATION_ID },
        select: { id: true, sellpiaInventorySkuId: true },
      }),
    ).toEqual([{ id: foreignAlias.id, sellpiaInventorySkuId: foreignSkuId }]);

    const recollectedSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'HISTORY-SKU',
        name: 'Recollected SKU',
        currentStock: 4,
        isActive: true,
      },
    });
    expect(recollectedSku.id).not.toBe(skuId);
    expect(
      await prisma.stockTransfer.findUniqueOrThrow({ where: { id: stockTransfer.id } }),
    ).toMatchObject({ sellpiaInventorySkuId: skuId });
    expect(
      await prisma.sellpiaManualMatchAlias.findUniqueOrThrow({ where: { id: alias.id } }),
    ).toMatchObject({ sellpiaInventorySkuId: skuId });
  });
});
