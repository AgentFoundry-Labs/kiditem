import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildSellpiaMasterIdentityMap } from '../../../../scripts/data-migrations/v0.1.9/001_build_sellpia_master_identity_map';
import { repointChannelSkuComponents } from '../../../../scripts/data-migrations/v0.1.9/002_repoint_channel_sku_components';
import { backfillFinalOwnerRelations } from '../../../../scripts/data-migrations/v0.1.9/003_backfill_final_owner_relations';
import { verifyFreshSellpiaSnapshot } from '../../../../scripts/data-migrations/v0.1.9/004_verify_fresh_sellpia_snapshot';
import { verifyChannelCatalogCutover } from '../../../../scripts/data-migrations/v0.1.9/005_verify_channel_catalog_cutover';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from './real-prisma';

const COLLIDING_ID = '10000000-0000-4000-8000-000000000001';
const SHARED_ID = '10000000-0000-4000-8000-000000000002';

describe.sequential('v0.1.9 Sellpia identity migrations', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('preserves source UUIDs when free and records deterministic collision resolution', async () => {
    await prisma.masterProduct.create({
      data: {
        id: COLLIDING_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'LEGACY-COLLISION',
        name: 'Legacy family',
      },
    });
    await prisma.inventorySku.createMany({
      data: [
        inventoryRow(COLLIDING_ID, 'SP-COLLISION'),
        inventoryRow(SHARED_ID, 'SP-SHARED'),
      ],
    });

    const first = await prisma.$transaction((tx) => buildSellpiaMasterIdentityMap.run(tx));
    const ledgers = await prisma.inventorySkuMasterProductMap.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { inventorySkuId: 'asc' },
      include: { masterProduct: true },
    });

    expect(first.details).toMatchObject({ stagedMasterProducts: 2, identityLedgerRows: 2 });
    expect(ledgers).toHaveLength(2);
    expect(ledgers.find(({ inventorySkuId }) => inventorySkuId === COLLIDING_ID))
      .toMatchObject({ resolution: 'generated_uuid_collision' });
    expect(ledgers.find(({ inventorySkuId }) => inventorySkuId === COLLIDING_ID)
      ?.masterProductId).not.toBe(COLLIDING_ID);
    expect(ledgers.find(({ inventorySkuId }) => inventorySkuId === SHARED_ID))
      .toMatchObject({ resolution: 'shared_uuid', masterProductId: SHARED_ID });
    expect(ledgers.map(({ masterProduct }) => ({
      code: masterProduct.sellpiaProductCode,
      stock: masterProduct.currentStock,
      active: masterProduct.isActive,
    }))).toEqual(expect.arrayContaining([
      { code: 'SP-COLLISION', stock: 7, active: true },
      { code: 'SP-SHARED', stock: 7, active: true },
    ]));

    await expect(prisma.$transaction((tx) => buildSellpiaMasterIdentityMap.run(tx)))
      .resolves.toMatchObject({ affectedRows: 0 });
  });

  it('repoints the component multiset and leaves a second run unchanged', async () => {
    await prisma.inventorySku.create({ data: inventoryRow(SHARED_ID, 'SP-COMPONENT') });
    await prisma.$transaction((tx) => buildSellpiaMasterIdentityMap.run(tx));
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: 'v019-wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        channel: 'coupang',
        externalId: 'V019-LISTING',
      },
    });
    const sku = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        listingId: listing.id,
        externalOptionId: 'V019-SKU',
      },
    });
    const component = await prisma.channelSkuComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelSkuId: sku.id,
        inventorySkuId: SHARED_ID,
        quantity: 8,
        mappingSource: 'old_unknown_source',
      },
    });

    await expect(prisma.$transaction((tx) => repointChannelSkuComponents.run(tx)))
      .resolves.toMatchObject({ affectedRows: 1 });
    const persisted = await prisma.channelSkuComponent.findUniqueOrThrow({
      where: { id: component.id },
    });
    expect(persisted).toMatchObject({
      id: component.id,
      inventorySkuId: SHARED_ID,
      masterProductId: SHARED_ID,
      quantity: 8,
      mappingSource: 'legacy_migrated',
    });

    await expect(prisma.$transaction((tx) => repointChannelSkuComponents.run(tx)))
      .resolves.toMatchObject({ affectedRows: 0 });
  });

  it('backfills account, listing-option, physical operation, supply, and ad owners', async () => {
    await prisma.inventorySku.create({ data: inventoryRow(SHARED_ID, 'SP-OWNER') });
    await prisma.$transaction((tx) => buildSellpiaMasterIdentityMap.run(tx));
    const family = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'LEGACY-FAMILY',
        name: 'Legacy family',
      },
    });
    const option = await prisma.productOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterId: family.id,
        sku: 'SP-OWNER',
      },
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: 'owner-wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        channel: 'coupang',
        externalId: 'OWNER-LISTING',
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        listingId: listing.id,
        externalOptionId: 'OWNER-SKU',
        optionId: option.id,
      },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        platform: 'coupang',
        externalOrderId: 'OWNER-ORDER',
        listingId: listing.id,
      },
    });
    const orderLine = await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        optionId: option.id,
        productName: 'Owner product',
      },
    });
    const supplier = await prisma.supplier.create({
      data: { organizationId: TEST_ORGANIZATION_ID, name: 'Owner supplier' },
    });
    const supplierProduct = await prisma.supplierProduct.create({
      data: { supplierId: supplier.id, optionId: option.id, supplyPrice: 500 },
    });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        supplierName: 'Owner supplier',
        totalAmountCny: 10,
      },
    });
    const purchaseOrderItem = await prisma.purchaseOrderItem.create({
      data: {
        orderId: purchaseOrder.id,
        optionId: option.id,
        productName: 'Owner product',
        quantity: 1,
        unitPriceCny: 10,
      },
    });
    const [fromWarehouse, toWarehouse] = await Promise.all([
      prisma.warehouse.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'From', code: 'FROM' },
      }),
      prisma.warehouse.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'To', code: 'TO' },
      }),
    ]);
    const transfer = await prisma.stockTransfer.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        optionId: option.id,
        inventorySkuId: SHARED_ID,
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        quantity: 1,
      },
    });
    const adTarget = await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        businessDate: new Date('2026-07-13T00:00:00.000Z'),
        optionId: option.id,
        externalOptionId: listingOption.externalOptionId,
        targetType: 'product',
        targetKey: 'OWNER-AD',
      },
    });

    await prisma.$transaction((tx) => backfillFinalOwnerRelations.run(tx));

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .resolves.toMatchObject({ channelAccountId: account.id });
    await expect(prisma.orderLineItem.findUniqueOrThrow({ where: { id: orderLine.id } }))
      .resolves.toMatchObject({ listingOptionId: listingOption.id });
    await expect(prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } }))
      .resolves.toMatchObject({ masterProductId: SHARED_ID });
    await expect(prisma.supplierProduct.findUniqueOrThrow({ where: { id: supplierProduct.id } }))
      .resolves.toMatchObject({
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: SHARED_ID,
      });
    await expect(prisma.purchaseOrderItem.findUniqueOrThrow({
      where: { id: purchaseOrderItem.id },
    })).resolves.toMatchObject({
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: SHARED_ID,
    });
    await expect(prisma.channelAdTargetDailySnapshot.findUniqueOrThrow({
      where: { id: adTarget.id },
    })).resolves.toMatchObject({ listingOptionId: listingOption.id });
  });

  it('blocks a stale Sellpia publication and accepts the fresh authoritative snapshot', async () => {
    const expandCompletedAt = new Date('2026-07-13T01:00:00.000Z');
    const staleImportedAt = new Date('2026-07-13T00:59:59.000Z');
    const freshImportedAt = new Date('2026-07-13T01:00:01.000Z');
    await prisma.dataMigrationRun.create({
      data: {
        migrationId: buildSellpiaMasterIdentityMap.id,
        releaseVersion: '0.1.9',
        name: buildSellpiaMasterIdentityMap.name,
        status: 'succeeded',
        completedAt: expandCompletedAt,
      },
    });
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        fileName: 'exported-list.xls',
        fileHash: 'v019-post-deploy-verifier',
        status: 'completed',
        rowCount: 1,
        importedAt: staleImportedAt,
        publicationSequence: 1n,
      },
    });
    await prisma.inventorySku.create({
      data: {
        ...inventoryRow(SHARED_ID, 'SP-VERIFIED'),
        lastImportRunId: importRun.id,
      },
    });
    await prisma.masterProduct.create({
      data: {
        id: SHARED_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SELLPIA-SP-VERIFIED',
        name: 'SP-VERIFIED item',
        sellpiaProductCode: 'SP-VERIFIED',
        sellpiaName: 'SP-VERIFIED item',
        sellpiaBarcode: 'SP-VERIFIED-BARCODE',
        optionName: 'Blue',
        currentStock: 7,
        purchasePrice: 1_000,
        salePrice: 2_000,
        isActive: true,
        rawJson: { sellpiaProductCode: 'SP-VERIFIED' },
        lastImportRunId: importRun.id,
      },
    });
    await prisma.inventorySkuMasterProductMap.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        inventorySkuId: SHARED_ID,
        masterProductId: SHARED_ID,
        resolution: 'shared_uuid',
      },
    });

    await expect(prisma.$transaction((tx) => verifyFreshSellpiaSnapshot.run(tx)))
      .rejects.toThrow(/stale_sellpia_publication/);

    await prisma.sourceImportRun.update({
      where: { id: importRun.id },
      data: { importedAt: freshImportedAt },
    });

    await expect(prisma.$transaction((tx) => verifyFreshSellpiaSnapshot.run(tx)))
      .resolves.toEqual({
        affectedRows: 0,
        details: { verifiedOrganizations: 1, activeMasters: 1 },
      });
    await expect(prisma.$transaction((tx) => verifyChannelCatalogCutover.run(tx)))
      .resolves.toEqual({
        affectedRows: 0,
        details: { listings: 0, channelSkus: 0, components: 0 },
      });
  });
});

function inventoryRow(id: string, sellpiaProductCode: string) {
  return {
    id,
    organizationId: TEST_ORGANIZATION_ID,
    sellpiaProductCode,
    name: `${sellpiaProductCode} item`,
    optionName: 'Blue',
    barcode: `${sellpiaProductCode}-BARCODE`,
    currentStock: 7,
    purchasePrice: 1_000,
    salePrice: 2_000,
    isActive: true,
    rawJson: { sellpiaProductCode },
  };
}
