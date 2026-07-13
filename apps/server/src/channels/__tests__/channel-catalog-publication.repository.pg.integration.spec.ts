import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCatalogMediaPublicationAdapter } from '../../ai/adapter/in/channels/ai-catalog-media-publication.adapter';
import { CatalogMediaMaterializationWorker } from '../../ai/application/service/catalog-media-materialization-worker.service';
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
      new AiCatalogMediaPublicationAdapter(),
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

  it('atomically publishes listings, options, workspace assets, and initial thumbnail', async () => {
    const collectionRunId = await createCollectionRun(prisma);

    const result = await publish(collectionRunId, SNAPSHOT_A, [product('P-1', 'S-1')]);

    const [sourceRun, collectionRun, listing] = await Promise.all([
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: result.sourceImportRunId } }),
      prisma.channelScrapeRun.findUniqueOrThrow({ where: { id: collectionRunId } }),
      prisma.channelListing.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          externalId: 'P-1',
        },
        include: {
          options: true,
          contentWorkspaces: {
            include: {
              currentThumbnailSelection: { include: { contentAsset: true } },
              contentGenerationGroups: { include: { originatingAssets: true } },
            },
          },
        },
      }),
    ]);

    expect(sourceRun).toMatchObject({
      sourceType: 'coupang_wing_catalog',
      channelAccountId: ACCOUNT_ID,
      fileName: 'browser-extension:coupang-wing:v1',
      fileHash: SNAPSHOT_A,
      status: 'completed',
    });
    expect(collectionRun).toMatchObject({
      status: 'completed',
      sourceImportRunId: sourceRun.id,
    });
    expect(listing).toMatchObject({
      externalId: 'P-1',
      channelName: 'P-1 등록상품',
      displayName: 'P-1 노출상품',
      isActive: true,
    });
    expect(listing.options).toEqual([
      expect.objectContaining({
        externalOptionId: 'S-1',
        itemName: '기본',
        salePrice: 12_900,
        sellerSku: 'P-1-SELLER',
        mappingStatus: 'unmatched',
        isActive: true,
      }),
    ]);
    expect(listing.contentWorkspaces).toHaveLength(1);
    const workspace = listing.contentWorkspaces[0];
    expect(workspace.ownerType).toBe('channel_listing');
    expect(workspace.contentGenerationGroups).toHaveLength(1);
    expect(workspace.contentGenerationGroups[0].groupType).toBe('workspace_assets');
    expect(workspace.contentGenerationGroups[0].originatingAssets).toEqual([
      expect.objectContaining({
        url: 'https://example.com/P-1.jpg',
        role: 'primary',
        isDeleted: false,
      }),
    ]);
    expect(workspace.currentThumbnailSelection?.contentAsset.url).toBe(
      'https://example.com/P-1.jpg',
    );
  });

  it('preserves stable IDs, authored fields, and component recipes while inactivating unseen rows', async () => {
    const firstRunId = await createCollectionRun(prisma);
    await publish(firstRunId, SNAPSHOT_A, [
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
    await prisma.channelListing.update({
      where: { id: before.id },
      data: { abcGrade: 'A', adBudgetLimit: 250_000, healthScore: 91 },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SELLPIA-1',
        name: '재고 상품',
      },
    });
    await prisma.channelSkuComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelSkuId: before.options[0].id,
        masterProductId: master.id,
        quantity: 2,
        mappingSource: 'manual',
      },
    });

    const secondRunId = await createCollectionRun(prisma);
    await publish(secondRunId, 'b'.repeat(64), [
      product('P-1', 'S-1', { displayName: '수정된 노출명' }),
    ]);

    const [after, absentAfter, component] = await Promise.all([
      prisma.channelListing.findUniqueOrThrow({
        where: { id: before.id },
        include: { options: true },
      }),
      prisma.channelListing.findUniqueOrThrow({
        where: { id: absentBefore.id },
        include: { options: true },
      }),
      prisma.channelSkuComponent.findFirstOrThrow({
        where: { channelSkuId: before.options[0].id },
      }),
    ]);

    expect(after).toMatchObject({
      id: before.id,
      displayName: '수정된 노출명',
      abcGrade: 'A',
      adBudgetLimit: 250_000,
      healthScore: 91,
      isActive: true,
    });
    expect(after.options[0].id).toBe(before.options[0].id);
    expect(component).toMatchObject({ quantity: 2, mappingSource: 'manual' });
    expect(absentAfter.isActive).toBe(false);
    expect(absentAfter.options[0].isActive).toBe(false);
  });

  it('materializes pending provider assets without replacing their stable asset identity', async () => {
    await publish(
      await createCollectionRun(prisma),
      SNAPSHOT_A,
      [product('P-1', 'S-1')],
    );
    const before = await prisma.contentAsset.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    const worker = new CatalogMediaMaterializationWorker(
      prisma as unknown as PrismaService,
      {
        fetchImage: vi.fn().mockResolvedValue({
          buffer: Buffer.from('provider-image'),
          mimeType: 'image/jpeg',
          storageKey: null,
        }),
        fetchTrustedStorageImage: vi.fn(),
        assertSupportedMime: vi.fn(),
        extForMime: vi.fn().mockReturnValue('jpg'),
      },
      {
        save: vi.fn().mockResolvedValue('https://storage.example/managed.jpg'),
        copy: vi.fn(),
        delete: vi.fn(),
        extractKey: vi.fn(),
      },
    );

    await worker.tick();

    const after = await prisma.contentAsset.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({
      id: before.id,
      url: 'https://storage.example/managed.jpg',
      storageKey: `content-assets/coupang/${TEST_ORGANIZATION_ID}/${before.id}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: Buffer.byteLength('provider-image'),
    });
    expect(after.metadata).toMatchObject({
      sourceUrl: 'https://example.com/P-1.jpg',
      materializationStatus: 'ready',
    });
  });

  it('rejects an external option moving to another parent and rolls back publication', async () => {
    await publish(await createCollectionRun(prisma), SNAPSHOT_A, [product('P-1', 'S-1')]);
    const secondRunId = await createCollectionRun(prisma);

    await expect(
      publish(secondRunId, 'c'.repeat(64), [product('P-2', 'S-1')]),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await prisma.channelListing.count({ where: { externalId: 'P-2' } })).toBe(0);
    expect(await prisma.sourceImportRun.count()).toBe(1);
    await expect(
      prisma.channelScrapeRun.findUniqueOrThrow({ where: { id: secondRunId } }),
    ).resolves.toMatchObject({ status: 'running', sourceImportRunId: null });
  });

  it('completes a new collection run as a no-op for an already published snapshot hash', async () => {
    const first = await publish(
      await createCollectionRun(prisma),
      SNAPSHOT_A,
      [product('P-1', 'S-1')],
    );
    const secondRunId = await createCollectionRun(prisma);

    const duplicate = await publish(secondRunId, SNAPSHOT_A, [product('P-1', 'S-1')]);

    expect(duplicate).toMatchObject({
      sourceImportRunId: first.sourceImportRunId,
      duplicate: true,
    });
    expect(await prisma.sourceImportRun.count()).toBe(1);
    await expect(
      prisma.channelScrapeRun.findUniqueOrThrow({ where: { id: secondRunId } }),
    ).resolves.toMatchObject({
      status: 'completed',
      sourceImportRunId: first.sourceImportRunId,
    });
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
  overrides: { displayName?: string } = {},
) {
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
      role: 'primary' as const,
      sortOrder: 0,
      externalOptionId: null,
    }],
    raw: { externalProductId },
  };
}
