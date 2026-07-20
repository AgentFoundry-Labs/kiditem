import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { CoupangCatalogProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelCatalogProductProvisioningRepositoryAdapter } from '../../products/adapter/out/repository/channel-catalog-product-provisioning.repository.adapter';
import { ChannelCatalogProductProvisioningService } from '../../products/application/service/channel-catalog-product-provisioning.service';
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
      productProvisioner(),
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
      masterProductId: expect.any(String),
      isActive: true,
    });
    expect(listing.options).toEqual([
      expect.objectContaining({
        externalOptionId: 'S-1',
        itemName: '기본',
        salePrice: 12_900,
        sellerSku: 'P-1-SELLER',
        productVariantId: expect.any(String),
        isActive: true,
      }),
    ]);
    const operationalProduct = await prisma.masterProduct.findUniqueOrThrow({
      where: { id: listing.masterProductId! },
      include: { variants: { include: { components: true } } },
    });
    expect(operationalProduct.originChannelListingId).toBe(listing.id);
    expect(operationalProduct.variants).toEqual([
      expect.objectContaining({
        id: listing.options[0]!.productVariantId,
        components: [],
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

  it('publishes one stored detail chunk without inactivating unseen listings', async () => {
    await publish(
      await createCollectionRun(prisma),
      SNAPSHOT_A,
      [product('P-EXISTING', 'S-EXISTING')],
    );
    const collectionRunId = await createCollectionRun(prisma);
    const products = [product('P-NEW', 'S-NEW')];
    const chunkId = await createDetailChunk(prisma, collectionRunId, products);

    const result = await publishChunk(collectionRunId, chunkId, products);

    const [newListing, existingListing, chunk] = await Promise.all([
      prisma.channelListing.findFirstOrThrow({
        where: { channelAccountId: ACCOUNT_ID, externalId: 'P-NEW' },
        include: { options: true, contentWorkspaces: true },
      }),
      prisma.channelListing.findFirstOrThrow({
        where: { channelAccountId: ACCOUNT_ID, externalId: 'P-EXISTING' },
      }),
      prisma.channelScrapeChunk.findUniqueOrThrow({ where: { id: chunkId } }),
    ]);
    expect(result.duplicate).toBe(false);
    expect(newListing).toMatchObject({ isActive: true, lastImportRunId: null });
    expect(newListing.options).toEqual([
      expect.objectContaining({ externalOptionId: 'S-NEW', isActive: true }),
    ]);
    expect(newListing.contentWorkspaces).toHaveLength(1);
    expect(existingListing.isActive).toBe(true);
    expect(chunk.publishedAt).not.toBeNull();
    expect(chunk.publicationJson).toMatchObject({ publishedProducts: 1 });
  });

  it('reuses an existing product and variant only from typed seller SKU evidence', async () => {
    const existing = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'EXACT-SELLER-PRODUCT',
        name: 'Existing exact seller product',
        variants: {
          create: {
            code: 'EXACT-SELLER-SKU',
            name: 'Existing exact seller variant',
            isDefault: true,
          },
        },
      },
      include: { variants: true },
    });

    await publish(await createCollectionRun(prisma), 'e'.repeat(64), [
      product('P-EXACT-SELLER', 'O-EXACT-SELLER', {
        sellerSku: 'EXACT-SELLER-SKU',
        barcode: null,
      }),
    ]);

    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-EXACT-SELLER' },
      include: { options: true },
    });
    expect(listing.masterProductId).toBe(existing.id);
    expect(listing.options[0]!.productVariantId).toBe(existing.variants[0]!.id);
    expect(await prisma.masterProduct.count({
      where: { originChannelListingId: listing.id },
    })).toBe(0);
  });

  it('reuses a safe typed barcode recipe but rejects an alphanumeric barcode payload', async () => {
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'BARCODE-INVENTORY',
        name: 'Barcode inventory',
        barcode: '001-2345-67890',
        currentStock: 5,
      },
    });
    const existing = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'BARCODE-PRODUCT',
        name: 'Barcode product',
        variants: {
          create: {
            code: 'BARCODE-VARIANT',
            name: 'Barcode variant',
            isDefault: true,
            components: {
              create: {
                sellpiaInventorySkuId: inventorySku.id,
                quantity: 1,
                source: 'manual',
                confirmedBy: TEST_USER_ID,
              },
            },
          },
        },
      },
      include: { variants: true },
    });

    await publish(await createCollectionRun(prisma), 'f'.repeat(64), [
      product('P-SAFE-BARCODE', 'O-SAFE-BARCODE', {
        sellerSku: null,
        barcode: '001234567890',
      }),
    ]);
    const safe = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-SAFE-BARCODE' },
      include: { options: true },
    });
    expect(safe.masterProductId).toBe(existing.id);
    expect(safe.options[0]!.productVariantId).toBe(existing.variants[0]!.id);

    await publish(await createCollectionRun(prisma), '1'.repeat(64), [
      product('P-UNSAFE-BARCODE', 'O-UNSAFE-BARCODE', {
        sellerSku: null,
        barcode: 'ABC001234567890XYZ',
      }),
    ]);
    const unsafe = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-UNSAFE-BARCODE' },
    });
    expect(unsafe.masterProductId).not.toBe(existing.id);
    await expect(prisma.masterProduct.findUniqueOrThrow({
      where: { id: unsafe.masterProductId! },
    })).resolves.toMatchObject({ originChannelListingId: unsafe.id });
  });

  it('uses external-ID name fallbacks and ignores name or raw alias lookalikes', async () => {
    const lookalike = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'RAW-PRODUCT-CODE',
        name: 'normalized product name',
        variants: {
          create: {
            code: 'RAW-SELLPIA-CODE',
            name: 'Raw lookalike variant',
            isDefault: true,
          },
        },
      },
    });
    await publish(await createCollectionRun(prisma), '2'.repeat(64), [
      product('P-NAME-ONLY', 'O-NAME-ONLY', {
        registeredName: '  NORMALIZED   PRODUCT NAME ',
        displayName: null,
        optionName: null,
        sellerSku: null,
        barcode: null,
        raw: { productCode: 'RAW-PRODUCT-CODE' },
        optionRaw: { sellpiaCode: 'RAW-SELLPIA-CODE' },
      }),
      product('P-FALLBACK', 'O-FALLBACK', {
        registeredName: null,
        displayName: null,
        optionName: null,
        sellerSku: null,
        barcode: null,
      }),
    ]);

    const [nameOnly, fallback] = await Promise.all([
      prisma.channelListing.findFirstOrThrow({
        where: { channelAccountId: ACCOUNT_ID, externalId: 'P-NAME-ONLY' },
      }),
      prisma.channelListing.findFirstOrThrow({
        where: { channelAccountId: ACCOUNT_ID, externalId: 'P-FALLBACK' },
        include: { options: true },
      }),
    ]);
    expect(nameOnly.masterProductId).not.toBe(lookalike.id);
    await expect(prisma.masterProduct.findUniqueOrThrow({
      where: { id: fallback.masterProductId! },
      include: { variants: true },
    })).resolves.toMatchObject({
      name: 'P-FALLBACK',
      variants: [expect.objectContaining({ name: 'O-FALLBACK' })],
    });
  });

  it('replays an already published detail chunk without changing stable IDs', async () => {
    const collectionRunId = await createCollectionRun(prisma);
    const products = [product('P-REPLAY', 'S-REPLAY')];
    const chunkId = await createDetailChunk(prisma, collectionRunId, products);
    await publishChunk(collectionRunId, chunkId, products);
    const before = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-REPLAY' },
      include: { options: true },
    });

    const replay = await publishChunk(collectionRunId, chunkId, products);
    const after = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-REPLAY' },
      include: { options: true },
    });

    expect(replay.duplicate).toBe(true);
    expect(after.id).toBe(before.id);
    expect(after.masterProductId).toBe(before.masterProductId);
    expect(after.options[0].id).toBe(before.options[0].id);
    expect(after.options[0].productVariantId).toBe(before.options[0].productVariantId);
  });

  it('rolls back a detail chunk when media attachment fails', async () => {
    const failingPublisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as unknown as PrismaService,
      {
        publishProviderMedia: vi.fn().mockRejectedValue(new Error('media failed')),
      },
      productProvisioner(),
    );
    const collectionRunId = await createCollectionRun(prisma);
    const products = [product('P-ROLLBACK', 'S-ROLLBACK')];
    const chunkId = await createDetailChunk(prisma, collectionRunId, products);

    await expect(failingPublisher.publishChunk({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      collectionRunId,
      chunkId,
      products: products.map((item, ordinal) => ({ ordinal, product: item })),
    })).rejects.toThrow('media failed');

    expect(await prisma.channelListing.count({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-ROLLBACK' },
    })).toBe(0);
    expect(await prisma.masterProduct.count()).toBe(0);
    expect(await prisma.productVariant.count()).toBe(0);
    await expect(
      prisma.channelScrapeChunk.findUniqueOrThrow({ where: { id: chunkId } }),
    ).resolves.toMatchObject({ publishedAt: null, publicationJson: null });
  });

  it('preserves stable IDs, confirmed links, and variant recipes while inactivating unseen rows', async () => {
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
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SELLPIA-1',
        name: '재고 상품',
        currentStock: 5,
      },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-1',
        name: '운영 상품',
        abcGrade: 'A',
        adBudgetLimit: 250_000,
        healthScore: 91,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: master.id,
        code: 'KI-1-DEFAULT',
        name: '기본 옵션',
        isDefault: true,
      },
    });
    await prisma.productVariantComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: variant.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 2,
        source: 'manual',
        confirmedBy: TEST_USER_ID,
      },
    });
    await prisma.channelListing.update({
      where: { id: before.id },
      data: { masterProductId: master.id },
    });
    await prisma.channelListingOption.update({
      where: { id: before.options[0].id },
      data: { productVariantId: variant.id },
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
      prisma.productVariantComponent.findFirstOrThrow({
        where: { productVariantId: variant.id },
      }),
    ]);

    expect(after).toMatchObject({
      id: before.id,
      displayName: '수정된 노출명',
      isActive: true,
      masterProductId: master.id,
    });
    expect(after.options[0].id).toBe(before.options[0].id);
    expect(after.options[0]).toMatchObject({ productVariantId: variant.id });
    expect(component).toMatchObject({ quantity: 2, source: 'manual' });
    expect(absentAfter.isActive).toBe(false);
    expect(absentAfter.options[0].isActive).toBe(false);
  });

  it('preserves a manual product and variant link committed before a waiting publication continues', async () => {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: 'P-LOCK-WINNER',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'O-LOCK-WINNER',
      },
    });
    const manual = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'MANUAL-LOCK-WINNER',
        name: 'Manual lock winner',
        variants: {
          create: {
            code: 'MANUAL-LOCK-WINNER-VARIANT',
            name: 'Manual lock winner variant',
            isDefault: true,
          },
        },
      },
      include: { variants: true },
    });
    let releaseLock!: () => void;
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => { markLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const manualWrite = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM channel_listings
        WHERE id = ${listing.id}::uuid
        FOR UPDATE
      `;
      markLocked();
      await release;
      await transaction.channelListing.update({
        where: { id: listing.id },
        data: { masterProductId: manual.id },
      });
      await transaction.channelListingOption.update({
        where: { id: option.id },
        data: { productVariantId: manual.variants[0]!.id },
      });
    }, { timeout: 20_000 });
    await locked;
    const publication = publish(
      await createCollectionRun(prisma),
      '3'.repeat(64),
      [product('P-LOCK-WINNER', 'O-LOCK-WINNER', {
        sellerSku: null,
        barcode: null,
      })],
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseLock();
    await Promise.all([manualWrite, publication]);

    const after = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { options: true },
    });
    expect(after.masterProductId).toBe(manual.id);
    expect(after.options[0]!.productVariantId).toBe(manual.variants[0]!.id);
    expect(await prisma.masterProduct.count({
      where: { originChannelListingId: listing.id },
    })).toBe(0);
  });

  it('publishes 1,225 listings and 2,241 options within the bulk transaction boundary', {
    timeout: 120_000,
  }, async () => {
    const products = Array.from({ length: 1_225 }, (_, index) => {
      const base = product(`P-BULK-${index}`, `O-BULK-${index}-0`, {
        sellerSku: `SELLER-BULK-${index}-0`,
        barcode: null,
      });
      const options = index < 1_016
        ? [
          base.options[0]!,
          {
            ...base.options[0]!,
            externalOptionId: `O-BULK-${index}-1`,
            sellerSku: `SELLER-BULK-${index}-1`,
          },
        ]
        : base.options;
      return { ...base, options, media: [] };
    });

    const result = await publish(
      await createCollectionRun(prisma),
      '4'.repeat(64),
      products,
    );

    expect(result.changes).toMatchObject({
      createdMasterProductCount: 1_225,
      createdVariantCount: 2_241,
      linkedProductCount: 1_225,
      linkedVariantCount: 2_241,
    });
    expect(await prisma.channelListing.count({
      where: { channelAccountId: ACCOUNT_ID, isActive: true },
    })).toBe(1_225);
    expect(await prisma.masterProduct.count({
      where: { originChannelListingId: { not: null } },
    })).toBe(1_225);
    expect(await prisma.productVariant.count()).toBe(2_241);
  });

  it('keeps provider media as an external URL without downloading a managed copy', async () => {
    await publish(
      await createCollectionRun(prisma),
      SNAPSHOT_A,
      [product('P-1', 'S-1')],
    );
    const asset = await prisma.contentAsset.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    expect(asset).toMatchObject({
      url: 'https://example.com/P-1.jpg',
      storageKey: null,
      mimeType: null,
      fileSize: null,
    });
    expect(asset.metadata).toMatchObject({
      sourceUrl: 'https://example.com/P-1.jpg',
    });
    expect(asset.metadata).not.toHaveProperty('materializationStatus');
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
      changes: {
        createdMasterProductCount: 0,
        reusedMasterProductCount: 0,
        createdVariantCount: 0,
        linkedProductCount: 0,
        linkedVariantCount: 0,
      },
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

  async function publishChunk(
    collectionRunId: string,
    chunkId: string,
    products: ReturnType<typeof product>[],
  ) {
    return publisher.publishChunk({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      collectionRunId,
      chunkId,
      products: products.map((item, ordinal) => ({ ordinal, product: item })),
    });
  }
});

function productProvisioner() {
  return new ChannelCatalogProductProvisioningService(
    new ChannelCatalogProductProvisioningRepositoryAdapter(),
  );
}

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

async function createDetailChunk(
  prisma: PrismaClient,
  collectionRunId: string,
  products: ReturnType<typeof product>[],
): Promise<string> {
  const chunk = await prisma.channelScrapeChunk.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      scrapeRunId: collectionRunId,
      kind: 'product_details',
      sequence: 1,
      checksum: 'd'.repeat(64),
      itemCount: products.length,
      payload: {
        version: 1,
        kind: 'product_details',
        startOrdinal: 0,
        products: products.map((item, ordinal) => ({ ordinal, product: item })),
      },
    },
  });
  return chunk.id;
}

function product(
  externalProductId: string,
  externalOptionId: string,
  overrides: {
    registeredName?: string | null;
    displayName?: string | null;
    optionName?: string | null;
    sellerSku?: string | null;
    barcode?: string | null;
    raw?: Record<string, unknown>;
    optionRaw?: Record<string, unknown>;
  } = {},
): CoupangCatalogProductV1 {
  return {
    externalProductId,
    registeredName: overrides.registeredName === undefined
      ? `${externalProductId} 등록상품`
      : overrides.registeredName,
    displayName: overrides.displayName === undefined
      ? `${externalProductId} 노출상품`
      : overrides.displayName,
    category: '완구',
    manufacturer: '제조사',
    brand: '브랜드',
    productStatus: '승인완료',
    options: [{
      externalOptionId,
      optionName: overrides.optionName === undefined ? '기본' : overrides.optionName,
      skuStatus: '판매중',
      salePrice: 12_900,
      sellerSku: overrides.sellerSku === undefined
        ? `${externalProductId}-SELLER`
        : overrides.sellerSku,
      modelNumber: 'MODEL-1',
      barcode: overrides.barcode === undefined ? '001234567890' : overrides.barcode,
      attributes: [{ type: '색상', value: '파랑' }],
      media: [],
      raw: overrides.optionRaw ?? { source: 'fixture-option' },
    }],
    media: [{
      sourceUrl: `https://example.com/${externalProductId}.jpg`,
      role: 'primary' as const,
      sortOrder: 0,
      externalOptionId: null,
    }],
    raw: overrides.raw ?? { externalProductId },
  };
}
