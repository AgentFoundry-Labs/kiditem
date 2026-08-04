import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { CoupangCatalogProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelCatalogPublicationRepositoryAdapter } from '../adapter/out/repository/channel-catalog-publication.repository.adapter';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SNAPSHOT_A = 'a'.repeat(64);

describe('ChannelCatalogPublicationRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let publisher: ChannelCatalogPublicationRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    publisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as unknown as PrismaService,
      new AiCatalogMediaPublicationRepositoryAdapter(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: 'vendor-primary',
        vendorId: 'vendor-primary',
      },
    });
  });

  it('publishes channel identities and media without creating operating products', async () => {
    const result = await publish(await createCollectionRun(prisma), SNAPSHOT_A, [
      product('P-1', 'S-1'),
    ]);

    const listing = await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: 'P-1',
      },
      include: {
        options: { include: { inventoryComponents: true } },
        contentWorkspaces: {
          include: {
            currentThumbnailSelection: { include: { contentAsset: true } },
          },
        },
      },
    });

    expect(result).toMatchObject({
      duplicate: false,
      changes: {
        createdProductCount: 1,
        createdSkuCount: 1,
      },
    });
    expect(listing).toMatchObject({
      masterProductId: null,
      displayName: 'P-1 노출상품',
      isActive: true,
    });
    expect(listing.options).toEqual([
      expect.objectContaining({
        externalOptionId: 'S-1',
        itemName: '기본',
        inventoryComponents: [],
      }),
    ]);
    expect(await prisma.masterProduct.count()).toBe(0);
    expect(listing.contentWorkspaces[0]?.currentThumbnailSelection?.contentAsset)
      .toMatchObject({ url: 'https://example.com/P-1.jpg' });
  });

  it('publishes scraper data when vendorId differs from a legacy external alias', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: {
        externalAccountId: 'legacy-wing-alias',
        vendorId: 'vendor-primary',
      },
    });

    await expect(publish(await createCollectionRun(prisma), SNAPSHOT_A, [
      product('P-1', 'S-1'),
    ])).resolves.toMatchObject({
      duplicate: false,
      changes: {
        createdProductCount: 1,
        createdSkuCount: 1,
      },
    });
  });

  it('preserves a confirmed product link and direct option components on recollection', async () => {
    await publish(await createCollectionRun(prisma), SNAPSHOT_A, [
      product('P-1', 'S-1'),
      product('P-2', 'S-2'),
    ]);
    const before = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-1' },
      include: { options: true },
    });
    const absentBefore = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-2' },
      include: { options: true },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-1',
        name: '운영 상품',
        abcGrade: 'A',
      },
    });
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-1',
        name: '실재고',
        currentStock: 20,
      },
    });
    await prisma.channelListing.update({
      where: { id: before.id },
      data: { masterProductId: master.id },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: before.options[0]!.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 2,
      },
    });

    await publish(await createCollectionRun(prisma), 'b'.repeat(64), [
      product('P-1', 'S-1', { displayName: '수정된 노출명' }),
    ]);

    const after = await prisma.channelListing.findUniqueOrThrow({
      where: { id: before.id },
      include: { options: { include: { inventoryComponents: true } } },
    });
    const absentAfter = await prisma.channelListing.findUniqueOrThrow({
      where: { id: absentBefore.id },
      include: { options: true },
    });
    expect(after).toMatchObject({
      masterProductId: master.id,
      displayName: '수정된 노출명',
      isActive: true,
    });
    expect(after.options[0]).toMatchObject({
      id: before.options[0]!.id,
      inventoryComponents: [expect.objectContaining({
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 2,
      })],
    });
    expect(absentAfter.isActive).toBe(false);
    expect(absentAfter.options[0]?.isActive).toBe(false);
  });

  it('reuses a completed identical snapshot without duplicating identities', async () => {
    const first = await publish(
      await createCollectionRun(prisma),
      SNAPSHOT_A,
      [product('P-1', 'S-1')],
    );
    const duplicate = await publish(
      await createCollectionRun(prisma),
      SNAPSHOT_A,
      [product('P-1', 'S-1')],
    );

    expect(duplicate).toMatchObject({
      sourceImportRunId: first.sourceImportRunId,
      duplicate: true,
    });
    expect(await prisma.channelListing.count()).toBe(1);
    expect(await prisma.channelListingOption.count()).toBe(1);
  });

  it('rejects an external option moving to another parent and rolls back', async () => {
    await publish(await createCollectionRun(prisma), SNAPSHOT_A, [
      product('P-1', 'S-1'),
    ]);
    await expect(publish(
      await createCollectionRun(prisma),
      'c'.repeat(64),
      [product('P-2', 'S-1')],
    )).rejects.toBeInstanceOf(ConflictException);

    expect(await prisma.channelListing.count({ where: { externalId: 'P-2' } }))
      .toBe(0);
  });

  async function publish(
    collectionRunId: string,
    snapshotHash: string,
    products: ReturnType<typeof product>[],
  ) {
    return publisher.publish({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      collectionRunId,
      snapshotHash,
      products: products.map((item, ordinal) => ({ ordinal, product: item })),
    });
  }
});

async function createCollectionRun(prisma: PrismaClient): Promise<string> {
  const run = await prisma.channelScrapeRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      clientRunKey: randomUUID(),
      channel: 'coupang',
      source: 'coupang_wing_catalog_browser',
      pageType: 'catalog_full_snapshot',
      status: 'running',
      parserVersion: 'wing-inventory-v1',
      metaJson: { phase: 'ready_to_finalize' },
    },
  });
  return run.id;
}

function product(
  externalProductId: string,
  externalOptionId: string,
  overrides: { displayName?: string | null } = {},
): CoupangCatalogProductV1 {
  return {
    externalProductId,
    registeredName: `${externalProductId} 등록상품`,
    displayName: overrides.displayName ?? `${externalProductId} 노출상품`,
    category: '완구',
    manufacturer: '제조사',
    brand: '브랜드',
    productStatus: '승인완료',
    options: [{
      externalOptionId,
      optionName: '기본',
      skuStatus: '판매중',
      salePrice: 12_900,
      sellerSku: `${externalProductId}-SELLER`,
      modelNumber: 'MODEL-1',
      barcode: '001234567890',
      attributes: [{ type: '색상', value: '파랑' }],
      media: [],
      raw: { source: 'fixture-option' },
    }],
    media: [{
      sourceUrl: `https://example.com/${externalProductId}.jpg`,
      role: 'primary',
      sortOrder: 0,
      externalOptionId: null,
    }],
    raw: { externalProductId },
  };
}
