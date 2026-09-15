import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  upsertChannelCatalogIdentities,
  type ChannelCatalogIdentityProduct,
} from '../adapter/out/repository/channel-catalog-identity-upsert';

const REGISTERED_ON = '2026-04-01 11:32:06';

describe('channel catalog identity upsert (PG integration)', () => {
  let prisma: PrismaClient;
  let channelAccountId: string;

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
    channelAccountId = (await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing' },
    })).id;
  });

  it('keeps the stored Wing registration date when the replacing listing raw JSON lacks one', async () => {
    await prisma.channelListing.createMany({
      data: [
        { externalId: 'P-KEPT', rawJson: { source: 'coupang_catalog_basics', createdOn: REGISTERED_ON } },
        { externalId: 'P-REPLACED', rawJson: { source: 'coupang_catalog_basics', createdOn: REGISTERED_ON } },
        { externalId: 'P-UNREGISTERED', rawJson: { source: 'coupang_catalog_basics' } },
      ].map((listing) => ({ organizationId: TEST_ORGANIZATION_ID, channelAccountId, ...listing })),
    });

    await prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      lastImportRunId: null,
      rawSource: 'coupang_rocket_po_catalog',
      products: [
        product('P-KEPT', { poNumber: '1001' }),
        product('P-REPLACED', { poNumber: '1002', createdOn: '2026-05-02 09:00:00' }),
        product('P-UNREGISTERED', { poNumber: '1003' }),
      ],
    }));

    await expect(prisma.channelListing.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId },
      select: { externalId: true, rawJson: true },
      orderBy: { externalId: 'asc' },
    })).resolves.toEqual([
      { externalId: 'P-KEPT', rawJson: { poNumber: '1001', createdOn: REGISTERED_ON } },
      { externalId: 'P-REPLACED', rawJson: { poNumber: '1002', createdOn: '2026-05-02 09:00:00' } },
      { externalId: 'P-UNREGISTERED', rawJson: { poNumber: '1003' } },
    ]);
  });
});

function product(
  externalProductId: string,
  raw: Record<string, unknown>,
): ChannelCatalogIdentityProduct {
  return {
    externalProductId,
    registeredName: externalProductId,
    displayName: null,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'observed',
    raw,
    options: [{
      externalOptionId: `${externalProductId}-O`,
      optionName: externalProductId,
      salePrice: null,
      sellerSku: null,
      barcode: null,
      modelNumber: null,
      skuStatus: 'observed',
      attributes: {},
      raw: {},
    }],
  };
}
