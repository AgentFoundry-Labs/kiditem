import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { readProductSaleAgeEvidence } from '../../common/product-sale-age';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { InventoryTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/inventory-transactional-read.repository.adapter';

describe('Inventory sale-age mapping subsets (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('preserves a valid multi-product listing when evaluating only one product', async () => {
    const organizationId = TEST_ORGANIZATION_ID;
    const account = await prisma.channelAccount.create({ data: {
      organizationId, channel: 'coupang', name: 'Sale age subset',
    } });
    const listing = await prisma.channelListing.create({ data: {
      organizationId, channelAccountId: account.id, externalId: 'subset-listing',
      rawJson: { saleStartedAt: '2026-01-01' }, isActive: true,
    } });
    const productIds: string[] = [];
    for (const code of ['FIRST', 'SECOND']) {
      const product = await prisma.masterProduct.create({ data: {
        organizationId, code, name: code, isActive: true,
      } });
      productIds.push(product.id);
      const sku = await prisma.sellpiaInventorySku.create({ data: {
        organizationId, masterProductId: product.id, code, name: code, currentStock: 10,
      } });
      const option = await prisma.channelListingOption.create({ data: {
        organizationId, listingId: listing.id, externalOptionId: code, isActive: true,
      } });
      await prisma.channelListingOptionInventoryComponent.create({ data: {
        organizationId, channelListingOptionId: option.id,
        sellpiaInventorySkuId: sku.id, quantity: 1,
      } });
    }
    const inventory = new InventoryTransactionalReadRepositoryAdapter();
    const single = await prisma.$transaction((tx) => readProductSaleAgeEvidence(
      tx, organizationId, [productIds[0]!], '2026-09-01', inventory,
    ));
    const all = await prisma.$transaction((tx) => readProductSaleAgeEvidence(
      tx, organizationId, productIds, '2026-09-01', inventory,
    ));
    expect(single).toEqual([{
      masterProductId: productIds[0], mappingValid: true, saleStartDate: '2026-01-01',
    }]);
    expect(single).toEqual(all.filter((row) => row.masterProductId === productIds[0]));
  });
});
