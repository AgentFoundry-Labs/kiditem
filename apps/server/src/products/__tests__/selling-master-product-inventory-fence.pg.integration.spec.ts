import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ProductTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/product-transactional-read.repository.adapter';
import { listSellingMasterProductIds } from '../adapter/out/persistence/selling-master-product.query';

describe('selling MasterProduct inventory fence (PostgreSQL)', () => {
  let prisma: PrismaClient;
  const inventory = new ProductTransactionalReadRepositoryAdapter();

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

  it('uses current positive stock without per-row collection membership', async () => {
    const verifiedAt = new Date('2026-09-13T00:00:00.000Z');
    const publishedRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'published.json',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: verifiedAt,
        lastVerifiedAt: verifiedAt,
        verificationCount: 1,
        freshnessGeneration: 1n,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: verifiedAt,
        lastCompletedImportRunId: publishedRun.id,
      },
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: 'ABC inventory fence',
        externalAccountId: randomUUID(),
        status: 'active',
      },
    });
    const publishedProductId = await seedSellingProduct({
      prisma,
      accountId: account.id,
      code: 'PUBLISHED',
    });
    const retainedProductId = await seedSellingProduct({
      prisma,
      accountId: account.id,
      code: 'RETAINED',
    });

    await expect(prisma.$transaction((tx) =>
      listSellingMasterProductIds(tx, TEST_ORGANIZATION_ID, undefined, inventory)))
      .resolves.toEqual([publishedProductId, retainedProductId].sort());
  });
});

async function seedSellingProduct(input: {
  prisma: PrismaClient;
  accountId: string;
  code: string;
}): Promise<string> {
  const product = await seedSourceProduct(input.prisma, {
    organizationId: TEST_ORGANIZATION_ID, code: input.code, name: input.code, currentStock: 10,
  });
  const sku = product;
  const listing = await input.prisma.channelListing.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: input.accountId,
      masterProductId: product.id,
      externalId: `LISTING-${input.code}`,
      status: 'active',
      isActive: true,
      rawJson: { saleStatus: '판매중' },
    },
  });
  const option = await input.prisma.channelListingOption.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      externalOptionId: `OPTION-${input.code}`,
      status: '판매중',
      isActive: true,
    },
  });
  await input.prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      masterProductId: sku.id,
      quantity: 1,
    },
  });
  return product.id;
}
