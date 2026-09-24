import { makeChannelListingQuery } from '../../test-helpers/channel-catalog-ports';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogDisplayMediaRepositoryAdapter } from '../../content/adapter/out/repository/catalog-display-media.repository.adapter';
import { CatalogDisplayMediaService } from '../../content/application/service/catalog-display-media.service';
import { lockProductMapping } from '../../products/transaction/product-mapping-lock';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { lockProductSource } from '../../products/adapter/out/persistence/transaction/product-source-lock';
import { ProductAvailabilityUseCase } from '../../products/application/service/product-availability.usecase';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelProductMatchingService } from '../application/service/listing/channel-product-matching.service';
import { ChannelSkuAvailabilityService } from '../application/service/listing/channel-sku-availability.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { readListingProductIds } from '../adapter/out/persistence/listing-product-summary.reader';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, PrismaClient } from '@prisma/client';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelProductMatchingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelProductMatchingRepositoryAdapter;
  let service: ChannelProductMatchingService;
  let completedRunId: string;
  let inventoryCompletedRunId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    repository = new ChannelProductMatchingRepositoryAdapter(
      prismaService,
      new ProductTransactionalReadRepositoryAdapter(),
      new ProductSourceReadRepositoryAdapter(prismaService),
      new ChannelOptionRecipeService(
        new ChannelOptionRecipeRepositoryAdapter(
          prismaService,
          new ProductTransactionalReadRepositoryAdapter(),
          new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
        ),
      ),
    );
    service = new ChannelProductMatchingService(
      repository,
      new CatalogDisplayMediaService(
        new CatalogDisplayMediaRepositoryAdapter(prismaService, makeChannelListingQuery(prisma)),
      ),
      new ProductAvailabilityUseCase(
        new ProductAvailabilityRepositoryAdapter(prismaService),
      ),
      { log: () => undefined, warn: () => undefined },
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    inventoryCompletedRunId = (await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'channel-matching-inventory.json',
        fileHash: 'c'.repeat(64),
        status: 'completed',
        rowCount: 0,
        importedAt: new Date('2026-08-01T00:00:00.000Z'),
        lastVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        verificationCount: 1,
        freshnessGeneration: 1n,
      },
    })).id;
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        verifiedGeneration: 1n,
        lastCompletedImportRunId: inventoryCompletedRunId,
      },
    });
    await prisma.channelAccount.createMany({
      data: [
        {
          id: ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Wing',
        },
        {
          id: OTHER_ACCOUNT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Other Wing',
        },
      ],
    });
    completedRunId = (await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: ACCOUNT_ID,
        fileName: 'matching.xlsx',
        fileHash: randomUUID(),
        status: 'completed',
      },
    })).id;
  });

  it('lists channel products separately from direct option inventory recipes', async () => {
    const product = await createProduct('KI-DIRECT', 'Direct product');
    const sku = await createInventorySku('SKU-DIRECT', 12, product.id);
    const linked = await createListing({ masterProductId: product.id, displayName: 'Direct listing' });
    const configured = await createOption(linked.id, { itemName: 'Two pack' });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: configured.id,
        masterProductId: sku.id,
        quantity: 2,
      },
    });
    const unlinked = await createListing({ displayName: 'Unlinked listing' });
    await createOption(unlinked.id, { itemName: 'Single' });

    const queue = await service.list(TEST_ORGANIZATION_ID);

    expect(queue.counts).toEqual({
      products: { all: 2, linked: 1, unlinked: 1 },
      options: { all: 2, configured: 1, unconfigured: 1 },
    });
    expect(queue.products.find((row) => row.listing.id === linked.id)).toMatchObject({
      linkedProduct: { id: product.id, code: 'KI-DIRECT' },
      optionCount: 1,
      configuredOptionCount: 1,
    });
    expect(queue.options.find((row) => row.option.id === configured.id)).toMatchObject({
      listing: { masterProductId: product.id },
      capacity: 6,
      option: {
        inventoryComponents: [{ masterProductId: sku.id, quantity: 2, currentStock: 12 }],
      },
    });
  });

  it('keeps deleted recipe IDs readable without inventing stock or relinking a same-code SKU', async () => {
    const product = await createProduct('KI-DELETED', 'Deleted identity');
    const sku = await createInventorySku('SKU-DELETED', 12, product.id);
    const listing = await createListing({ masterProductId: product.id });
    const option = await createOption(listing.id, {});
    await prisma.channelListingOptionInventoryComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id,
      masterProductId: sku.id, quantity: 2,
    } });
    await prisma.masterProduct.delete({ where: { id: sku.id } });
    await createInventorySku('SKU-DELETED', 99, product.id);
    const queue = await service.list(TEST_ORGANIZATION_ID);
    expect(queue.options.find((row) => row.option.id === option.id)).toMatchObject({
      capacity: null,
      option: { inventoryComponents: [{ masterProductId: sku.id, quantity: 2, code: null, name: null, currentStock: null }] },
    });
    const rows = await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {});
    expect(rows.find((row) => row.option.id === option.id)?.inventoryComponents).toMatchObject([
      { masterProductId: sku.id, quantity: 2, code: null, name: null },
    ]);
  });

  it('uses the latest source-evidenced sale status without requiring traffic evidence', async () => {
    const listing = await createListing({
      displayName: 'Stopped listing',
      rawJson: { saleStatus: '판매중' },
    });
    const activeFallback = await createListing({ displayName: 'Active fallback' });
    const supplierStopped = await createListing({ displayName: 'Supplier stopped' });
    await prisma.channelListing.update({
      where: { id: supplierStopped.id },
      data: { status: '비활성' },
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: [{
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date('2026-08-01T00:00:00.000Z'),
        saleStatus: '판매중',
      }, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date('2026-08-02T00:00:00.000Z'),
        saleStatus: '판매중지',
        trafficObservedAt: null,
      }],
    });

    const queue = await service.list(TEST_ORGANIZATION_ID);

    const statusByListing = new Map(queue.products.map((row) => [
      row.listing.id,
      row.listing.saleStatus,
    ]));
    expect(statusByListing).toEqual(new Map([
      [listing.id, '판매중지'],
      [activeFallback.id, 'active'],
      [supplierStopped.id, '비활성'],
    ]));
  });

  it('keeps listing identity and latest sale status on one repeatable-read snapshot', async () => {
    const publisher = makeTestPrisma();
    const observer = makeTestPrisma();
    await Promise.all([publisher.$connect(), observer.$connect()]);
    const listing = await createListing({
      displayName: 'Concurrent sale status',
      rawJson: { saleStatus: '판매중' },
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        saleStatus: '판매중',
      },
    });

    const publicationLocked = deferred<void>();
    const publish = deferred<void>();
    const publication = publisher.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE channel_listing_daily_snapshots IN ACCESS EXCLUSIVE MODE',
      );
      publicationLocked.resolve();
      await publish.promise;
      await tx.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          channel: 'coupang',
          externalId: listing.externalId,
          businessDate: new Date('2026-09-02T00:00:00.000Z'),
          saleStatus: '판매중지',
        },
      });
    }, { timeout: 15_000 });

    try {
      await publicationLocked.promise;
      const reading = service.list(TEST_ORGANIZATION_ID);
      await waitForBlockedListingStateRead(observer);
      publish.resolve();
      await publication;

      const queue = await reading;
      expect(queue.products.find((row) => row.listing.id === listing.id)?.listing.saleStatus)
        .toBe('판매중');
    } finally {
      publish.resolve();
      await publication.catch(() => undefined);
      await Promise.all([publisher.$disconnect(), observer.$disconnect()]);
    }
  }, 20_000);

  it('keeps a multi-Master listing fully matched through its option recipes', async () => {
    const firstProduct = await createProduct('INV-FIRST', 'First inventory product');
    const secondProduct = await createProduct('INV-SECOND', 'Second inventory product');
    const firstSku = await createInventorySku('SKU-FIRST', 12, firstProduct.id);
    const secondSku = await createInventorySku('SKU-SECOND', 8, secondProduct.id);
    const listing = await createListing({ displayName: 'Two-color listing' });
    const firstOption = await createOption(listing.id, { itemName: 'Pink' });
    const secondOption = await createOption(listing.id, { itemName: 'Blue' });
    await prisma.channelListingOptionInventoryComponent.createMany({
      data: [{
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: firstOption.id,
        masterProductId: firstSku.id,
        quantity: 2,
      }, {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: secondOption.id,
        masterProductId: secondSku.id,
        quantity: 4,
      }],
    });

    const queue = await service.list(TEST_ORGANIZATION_ID);

    expect(queue.products).toEqual([
      expect.objectContaining({
        listing: expect.objectContaining({ id: listing.id, masterProductId: null }),
        linkedProduct: null,
        optionCount: 2,
        configuredOptionCount: 2,
      }),
    ]);
    expect(queue.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ option: expect.objectContaining({ id: firstOption.id }), capacity: 6 }),
      expect.objectContaining({ option: expect.objectContaining({ id: secondOption.id }), capacity: 2 }),
    ]));
  });

  it('rejects an arbitrary product link until option recipes resolve the inventory product', async () => {
    const product = await createProduct('KI-BEAR', 'Blue Bear');
    const listing = await createListing({
      displayName: ' blue  bear ',
      rawJson: {
        aiSuggestedMasterProductId: product.id,
        aiExplanation: 'same catalog image',
        aiScore: 0.8,
      },
    });

    const candidates = await service.productCandidates(
      TEST_ORGANIZATION_ID,
      listing.id,
      {},
    );

    expect(candidates.items[0]).toMatchObject({
      masterProductId: product.id,
      reason: 'exact_normalized_name',
    });
    await expect(service.linkProduct(
      OTHER_ORGANIZATION_ID,
      listing.id,
      { masterProductId: product.id },
    )).rejects.toMatchObject({ code: 'CHANNELS_LISTING_NOT_FOUND', kind: 'not_found' });
    await expect(service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
      masterProductId: product.id,
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'PRODUCT_LINK_DERIVED_FROM_RECIPES' } });
    expect((await service.list(TEST_ORGANIZATION_ID)).products
      .find((row) => row.listing.id === listing.id)?.listing.masterProductId).toBeNull();
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);
    expect(await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBeNull();
  });

  it('clears option inventory recipes when the derived product link is removed', async () => {
    const product = await createProduct('KI-PRESERVE', 'Preserve product');
    const sku = await createInventorySku('SKU-PRESERVE', 9, product.id);
    const listing = await createListing({ masterProductId: product.id });
    const option = await createOption(listing.id, {});
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: sku.id,
        quantity: 3,
      },
    });

    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, { masterProductId: null });

    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: option.id },
    })).toBe(0);
  });

  it('increments mapping generation once for a committed channel mapping change', async () => {
    const product = await createProduct('KI-CHANNEL-MAPPING-GENERATION', 'Channel mapping');
    const sku = await createInventorySku('SKU-CHANNEL-MAPPING-GENERATION', 9, product.id);
    const listing = await createListing({ masterProductId: product.id });
    const option = await createOption(listing.id, { itemName: 'Single' });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: sku.id,
        quantity: 1,
      },
    });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);

    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, { masterProductId: null });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: {
        activeFormulaVersionId: true,
        formulaRevision: true,
        publicationRevision: true,
        publishedAt: true,
        mappingGeneration: true,
      },
    })).resolves.toEqual({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      publicationRevision: 0,
      publishedAt: null,
      mappingGeneration: 1n,
    });
  });

  it('does not increment mapping generation for an identical channel mapping', async () => {
    const listing = await createListing({ masterProductId: null });
    await createOption(listing.id, { itemName: 'Unconfigured' });

    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, { masterProductId: null });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);
    expect(await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBeNull();
  });

  it('isolates mapping generations by organization', async () => {
    const testProduct = await createProduct(
      'KI-ORG-TEST',
      'Test organization product',
    );
    const testListing = await createListing({ masterProductId: testProduct.id });
    const testOption = await createOption(testListing.id, { itemName: 'Test option' });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: testOption.id,
        masterProductId: testProduct.id,
        quantity: 1,
      },
    });
    const otherProduct = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'KI-ORG-OTHR',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'KI-ORG-OTHER',
        sourceOptionCode: '',
        name: 'Other organization product',
      },
    });
    const otherListing = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ACCOUNT_ID,
        externalId: `OTHER-${randomUUID()}`,
      },
    });
    const otherOption = await prisma.channelListingOption.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: otherListing.id,
        externalOptionId: `OTHER-${randomUUID()}`,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelListingOptionId: otherOption.id,
        masterProductId: otherProduct.id,
        quantity: 1,
      },
    });

    await service.linkProduct(TEST_ORGANIZATION_ID, testListing.id, { masterProductId: null });
    await service.linkProduct(OTHER_ORGANIZATION_ID, otherListing.id, { masterProductId: null });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    expect(await readMappingGeneration(OTHER_ORGANIZATION_ID)).toBe(1n);

    await service.linkProduct(TEST_ORGANIZATION_ID, testListing.id, { masterProductId: null });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    expect(await readMappingGeneration(OTHER_ORGANIZATION_ID)).toBe(1n);
  });

  it('rolls back channel mapping writes when generation advancement fails', async () => {
    const product = await createProduct('KI-CHANNEL-ROLLBACK', 'Channel rollback');
    const sku = await createInventorySku('SKU-CHANNEL-ROLLBACK', 9, product.id);
    const listing = await createListing({ masterProductId: product.id });
    const option = await createOption(listing.id, { itemName: 'Single' });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: sku.id,
        quantity: 1,
      },
    });
    const oldGeneration = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: { organizationId: TEST_ORGANIZATION_ID, mappingGeneration: oldGeneration },
    });

    await expect(service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
      masterProductId: null,
    })).rejects.toThrow();

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(oldGeneration);
    await expect(readListingProductIds(prisma as unknown as Prisma.TransactionClient, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listing.id],
    })).resolves.toEqual(new Map([[listing.id, product.id]]));
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: option.id },
    })).toBe(1);
  });

  it('auto-matches one exact product and writes an exact manual-alias recipe directly to its option', async () => {
    const product = await createProduct('KI-AUTO', 'Auto product');
    const sku = await createInventorySku('SKU-AUTO', 20, product.id);
    const ownerListing = await createListing({
      masterProductId: product.id,
      displayName: 'Owner listing',
    });
    const ownerOption = await createOption(ownerListing.id, { itemName: 'Owner option' });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: ownerOption.id,
        masterProductId: sku.id,
        quantity: 1,
      },
    });
    const snapshot = await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'a'.repeat(64),
        capturedAt: new Date(),
      },
    });
    await prisma.sellpiaManualMatchAlias.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        snapshotId: snapshot.id,
        masterProductId: sku.id,
        aliasTitle: 'Auto product Two pack',
        normalizedAlias: 'autoproducttwopack',
        itemCount: 2,
        matchedType: 'M',
        evidenceCount: 1,
      },
    });
    const target = await createListing({ displayName: 'Auto product' });
    const targetOption = await createOption(target.id, { itemName: 'Two pack' });
    const secondTarget = await createListing({ displayName: 'Auto product' });
    const secondTargetOption = await createOption(secondTarget.id, { itemName: 'Two pack' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, {})).resolves.toEqual({
      evaluatedListings: 3,
      matchedListings: 2,
      configuredOptions: 2,
    });
    await expect(readListingProductIds(prisma as unknown as Prisma.TransactionClient, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [target.id],
    })).resolves.toEqual(new Map([[target.id, product.id]]));
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: targetOption.id },
    })).resolves.toMatchObject({ masterProductId: sku.id, quantity: 2 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: secondTargetOption.id },
    })).resolves.toMatchObject({ masterProductId: sku.id, quantity: 2 });
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, {})).resolves.toEqual({
      evaluatedListings: 3,
      matchedListings: 0,
      configuredOptions: 0,
    });
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
  });

  it('configures a Wing option from its registered title and the stored Sellpia deduction quantity', async () => {
    const product = await createProduct('KI-WING-ALIAS', 'Wing alias product');
    const sku = await createInventorySku('SKU-WING-ALIAS', 27, product.id);
    const snapshot = await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'b'.repeat(64),
        capturedAt: new Date(),
      },
    });
    await prisma.sellpiaManualMatchAlias.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        snapshotId: snapshot.id,
        masterProductId: sku.id,
        aliasTitle: '등록 Wing 상품 3종 세트',
        normalizedAlias: '등록wing상품3종세트',
        itemCount: 3,
        matchedType: 'M',
        evidenceCount: 1,
      },
    });
    const target = await createListing({
      masterProductId: product.id,
      channelName: '등록 Wing 상품',
      displayName: '검색용 노출 상품명',
    });
    const targetOption = await createOption(target.id, { itemName: '3종 세트' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toEqual({
        evaluatedListings: 1,
        matchedListings: 1,
        configuredOptions: 1,
      });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: targetOption.id },
    })).resolves.toMatchObject({ masterProductId: sku.id, quantity: 3 });
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: sku.id } }))
      .resolves.toMatchObject({ currentStock: 27 });
  });

  it('leaves an option whose source product was deleted for review and still links the rest (KID-246)', async () => {
    const active = await createProduct('10162-1', '할로윈 아트 네일팁');
    const activeSku = await createInventorySku('10162-1', 5, active.id);
    const retired = await createProduct('9151-1', '할로윈 LED 거미줄');
    await prisma.masterProduct.delete({ where: { id: retired.id } });
    const linked = await createListing({ displayName: '할로윈 아트 네일팁 1p' });
    const linkedOption = await createOption(linked.id, {
      itemName: '할로윈 아트 네일팁 1p',
      sellerSku: '10162-1',
    });
    const held = await createListing({ displayName: '할로윈 LED 거미줄 1p' });
    const heldOption = await createOption(held.id, {
      itemName: '할로윈 LED 거미줄 1p',
      sellerSku: '9151-1',
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 2, configuredOptions: 1 });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: { in: [linkedOption.id, heldOption.id] } },
      select: { channelListingOptionId: true, masterProductId: true },
    })).resolves.toEqual([
      { channelListingOptionId: linkedOption.id, masterProductId: activeSku.id },
    ]);
  });

  it('links a mall listing by the Sellpia name the mall keeps as its option name, with the title pack count (KID-246)', async () => {
    const waxPop = await createProduct('10271-1', '왁스팝 말랑이');
    const mask = await createProduct('792-1', '스크림가면');
    const waxPopSku = await createInventorySku('10271-1', 20, waxPop.id, { name: '3000왁스팝 말랑이' });
    const maskSku = await createInventorySku('792-1', 20, mask.id);
    const single = await createListing({
      channelName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
      displayName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
    });
    const singleOption = await createOption(single.id, { itemName: '3000왁스팝 말랑이' });
    const pack = await createListing({
      channelName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
      displayName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
    });
    const packOption = await createOption(pack.id, { itemName: '스크림가면' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 2, configuredOptions: 2 });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: { in: [singleOption.id, packOption.id] } },
      select: { channelListingOptionId: true, masterProductId: true, quantity: true },
      orderBy: { quantity: 'asc' },
    })).resolves.toEqual([
      { channelListingOptionId: singleOption.id, masterProductId: waxPopSku.id, quantity: 1 },
      { channelListingOptionId: packOption.id, masterProductId: maskSku.id, quantity: 12 },
    ]);
  });

  it('rejects incompatible provider and confirmed CSV barcodes without writing recipes or stock changes', async () => {
    const product = await createProduct('KI-BARCODE-REJECT', '퓨어 클리어 슬라임');
    const listing = await createListing({
      displayName: '퓨어 클리어 슬라임 투명 9개 x 150g',
      rawJson: {
        source: 'coupang_rocket_matching_csv',
        sellpiaBarcode: '8806384804294',
        confidence: 'high',
      },
    });
    const providerOption = await createOption(listing.id, {
      itemName: '기본',
      barcode: '8806384804294',
    });
    const csvOption = await createOption(listing.id, { itemName: 'CSV 기본' });
    const watergun = await createInventorySku('10054-1', 27, product.id, {
      name: '어린이 물총 워터건',
      barcode: '8806384804294',
    });
    const beforeStock = await prisma.masterProduct.findUniqueOrThrow({
      where: { id: watergun.id },
      select: { id: true, currentStock: true },
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 1, configuredOptions: 0 });
    expect(await prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: { in: [providerOption.id, csvOption.id] } },
    })).toEqual([]);
    await expect(prisma.masterProduct.findUniqueOrThrow({
      where: { id: watergun.id },
      select: { id: true, currentStock: true },
    })).resolves.toEqual(beforeStock);
  });

  it('configures a compatible barcode with the title-derived nine-unit quantity', async () => {
    const product = await createProduct('KI-BARCODE-COMPATIBLE', '퓨어 클리어 슬라임');
    const listing = await createListing({
      displayName: '퓨어 클리어 슬라임 투명 9개 x 150g',
    });
    const option = await createOption(listing.id, { barcode: '8806384804966' });
    const slime = await createInventorySku('10429-1', 31, product.id, {
      name: '2000퓨어클리어슬라임(쿠팡용)',
      barcode: '8806384804966',
    });
    const beforeStock = await prisma.masterProduct.findUniqueOrThrow({
      where: { id: slime.id },
      select: { id: true, currentStock: true },
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 1, matchedListings: 1, configuredOptions: 1 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual({ masterProductId: slime.id, quantity: 9 });
    expect((await service.list(TEST_ORGANIZATION_ID)).products
      .find((row) => row.listing.id === listing.id)?.listing.masterProductId).toBe(product.id);
    await expect(prisma.masterProduct.findUniqueOrThrow({
      where: { id: slime.id },
      select: { id: true, currentStock: true },
    })).resolves.toEqual(beforeStock);
  });

  it('preserves a multi-component BOM when a barcode candidate is incompatible', async () => {
    const product = await createProduct('KI-BARCODE-BOM', '퓨어 클리어 슬라임');
    const secondProduct = await createProduct('KI-BARCODE-BOM-SECOND', '슬라임 보조 구성품');
    const watergunProduct = await createProduct('KI-BARCODE-BOM-WATERGUN', '어린이 물총');
    const listing = await createListing({
      displayName: '퓨어 클리어 슬라임 투명 9개 x 150g',
    });
    const option = await createOption(listing.id, { barcode: '8806384804294' });
    const slime = await createInventorySku('10429-1', 31, product.id, {
      name: '2000퓨어클리어슬라임(쿠팡용)',
      barcode: '8806384804966',
    });
    const second = await createInventorySku('10429-2', 13, secondProduct.id, {
      name: '슬라임 보조 구성품',
      barcode: null,
    });
    const watergun = await createInventorySku('10054-1', 27, watergunProduct.id, {
      name: '어린이 물총 워터건',
      barcode: '8806384804294',
    });
    await prisma.channelListingOptionInventoryComponent.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: slime.id,
          quantity: 9,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: second.id,
          quantity: 2,
        },
      ],
    });
    const beforeComponents = await prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
      orderBy: { masterProductId: 'asc' },
    });
    const beforeStock = await prisma.masterProduct.findMany({
      where: { id: { in: [slime.id, second.id, watergun.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 1, configuredOptions: 0 });
    expect((await service.list(TEST_ORGANIZATION_ID)).products
      .find((row) => row.listing.id === listing.id)?.listing.masterProductId).toBeNull();
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
      orderBy: { masterProductId: 'asc' },
    })).resolves.toEqual(beforeComponents);
    await expect(prisma.masterProduct.findMany({
      where: { id: { in: [slime.id, second.id, watergun.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    })).resolves.toEqual(beforeStock);
  });

  it('auto-confirms one clear name candidate with matching option and explicit single-unit evidence', async () => {
    const product = await createProduct('KI-NAME-CLEAR', '키즈 식판');
    const sku = await createInventorySku('SP-NAME-CLEAR', 12, product.id, {
      name: '키즈 식판',
      optionName: '블루',
    });
    const listing = await createListing({ displayName: '키즈 식판' });
    const option = await createOption(listing.id, { itemName: '블루 단품' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 1, configuredOptions: 1 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual({ masterProductId: sku.id, quantity: 1 });
  });

  it('waits on the mapping lock before acquiring the source lock while publication commits first', async () => {
    const product = await createProduct('KI-DEADLOCK', 'Auto product');
    const sku = await createInventorySku('SKU-DEADLOCK', 20, product.id);
    const snapshot = await prisma.sellpiaManualMatchSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'd'.repeat(64),
        capturedAt: new Date(),
      },
    });
    await prisma.sellpiaManualMatchAlias.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        snapshotId: snapshot.id,
        masterProductId: sku.id,
        aliasTitle: 'Auto product Two pack',
        normalizedAlias: 'autoproducttwopack',
        itemCount: 2,
        matchedType: 'M',
        evidenceCount: 1,
      },
    });
    const listing = await createListing({ displayName: 'Auto product' });
    const option = await createOption(listing.id, { itemName: 'Two pack' });

    const publicationPrisma = makeTestPrisma();
    await publicationPrisma.$connect();
    const mappingLocked = deferred<void>();
    const releasePublication = deferred<void>();
    let completePublication = true;
    const publication = publicationPrisma.$transaction(async (tx) => {
      // This is the ProductSourcePublicationRepositoryAdapter order: mapping -> source.
      await lockProductMapping(tx, TEST_ORGANIZATION_ID);
      mappingLocked.resolve();
      await releasePublication.promise;
      if (!completePublication) return 'aborted';
      await lockProductSource(tx, TEST_ORGANIZATION_ID);
      return (await tx.masterProduct.findUniqueOrThrow({
        where: { id: product.id, organizationId: TEST_ORGANIZATION_ID },
        select: { id: true },
      })).id;
    }, { timeout: 15_000 });

    let matching: ReturnType<ChannelProductMatchingRepositoryAdapter['autoMatch']> | null = null;
    const productRead = new ProductTransactionalReadRepositoryAdapter();
    const sourceLock = vi.spyOn(productRead, 'lock');
    const concurrentRepository = new ChannelProductMatchingRepositoryAdapter(
      prisma as unknown as PrismaService,
      productRead,
      new ProductSourceReadRepositoryAdapter(prisma as unknown as PrismaService),
      new ChannelOptionRecipeService(
        new ChannelOptionRecipeRepositoryAdapter(
          prisma as unknown as PrismaService,
          new ProductTransactionalReadRepositoryAdapter(),
          new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
        ),
      ),
    );

    try {
      await mappingLocked.promise;
      matching = concurrentRepository.autoMatch({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
      });
      await waitForBlockedAdvisoryLock(prisma);
      expect(sourceLock).not.toHaveBeenCalled();

      releasePublication.resolve();
      await expect(publication).resolves.toBe(product.id);
      await expect(matching).resolves.toEqual({
        evaluatedListings: 1,
        matchedListings: 1,
        configuredOptions: 1,
      });
      await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
        where: { channelListingOptionId: option.id },
        select: { masterProductId: true, quantity: true },
      })).resolves.toEqual({ masterProductId: sku.id, quantity: 2 });
    } catch (error) {
      // Before the ordering fix, autoMatch has already acquired source before
      // waiting on mapping. Let the publication transaction exit without
      // taking source so the intentionally failing assertion cannot leave a
      // real deadlock behind for the rest of this file.
      completePublication = false;
      releasePublication.resolve();
      throw error;
    } finally {
      releasePublication.resolve();
      await Promise.allSettled([
        publication,
        ...(matching ? [matching] : []),
      ]);
      sourceLock.mockRestore();
      await publicationPrisma.$disconnect();
    }
  });

  it('leaves duplicate normalized names for review, and reads an unmarked exact name as one unit (KID-246)', async () => {
    const first = await createProduct('KI-NAME-DUP-1', '키즈 식판');
    const second = await createProduct('KI-NAME-DUP-2', '키즈 식판');
    await Promise.all([
      createInventorySku('SP-NAME-DUP-1', 5, first.id, { name: '키즈 식판' }),
      createInventorySku('SP-NAME-DUP-2', 6, second.id, { name: '키즈 식판' }),
    ]);
    const duplicateListing = await createListing({ displayName: '키즈 식판 단품' });
    const duplicateOption = await createOption(duplicateListing.id, { itemName: '단품' });
    const quantityListing = await createListing({ displayName: '유아 접시' });
    const quantityOption = await createOption(quantityListing.id, {});
    const quantityProduct = await createProduct('KI-NAME-QUANTITY', '유아 접시');
    await createInventorySku('SP-NAME-QUANTITY', 9, quantityProduct.id, { name: '유아 접시' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toEqual({ evaluatedListings: 2, matchedListings: 1, configuredOptions: 1 });
    // 같은 이름이 SKU 둘에 걸리면 어느 쪽인지 모른다 — 그대로 사람 확인으로 남긴다.
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: duplicateOption.id },
    })).toBe(0);
    // 이름이 그 상품 이름과 글자까지 같고 묶음 표기가 없으면 낱개 하나다(사장님 2026-09-17).
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: quantityOption.id },
      select: { quantity: true },
    })).resolves.toEqual([{ quantity: 1 }]);
  });

  it('leaves a high-scoring color mismatch for review', async () => {
    const product = await createProduct('KI-NAME-COLOR', '키즈 식판');
    await createInventorySku('SP-NAME-COLOR', 8, product.id, {
      name: '키즈 식판',
      optionName: '핑크',
    });
    const listing = await createListing({ displayName: '키즈 식판' });
    const option = await createOption(listing.id, { itemName: '블루 단품' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 0 });
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: option.id },
    })).toBe(0);
  });

  it('uses completed catalog imports for availability and excludes inactive listings', async () => {
    const active = await createListing({ displayName: 'Active' });
    const activeOption = await createOption(active.id, { sellerSku: 'ACTIVE-SKU' });
    const inactive = await createListing({ displayName: 'Inactive', isActive: false });
    await createOption(inactive.id, { sellerSku: 'INACTIVE-SKU' });

    const rows = await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {});

    expect(rows.map((row) => row.option.id)).toEqual([activeOption.id]);
  });

  it('stores option safety stock through the public capability with organization isolation and unchanged source facts', async () => {
    const product = await createProduct('THRESHOLD', 'Threshold source');
    await createInventorySku('THRESHOLD', 6, product.id);
    const listing = await createListing({ displayName: 'Threshold listing' });
    const option = await createOption(listing.id, {});
    const sibling = await createOption(listing.id, {});
    await prisma.channelListingOptionInventoryComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id,
      masterProductId: product.id, quantity: 2,
    } });
    const inventory = new ProductAvailabilityUseCase(new ProductAvailabilityRepositoryAdapter(prisma as unknown as PrismaService));
    const availability = new ChannelSkuAvailabilityService(repository, inventory);
    expect(option.safetyStock).toBe(0);
    await expect(availability.updateSafetyStock(OTHER_ORGANIZATION_ID, option.id, 9))
      .rejects.toMatchObject({ code: 'CHANNELS_LISTING_NOT_FOUND', kind: 'not_found' });
    await expect(availability.updateSafetyStock(TEST_ORGANIZATION_ID, option.id, -1))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
    await expect(availability.updateSafetyStock(TEST_ORGANIZATION_ID, option.id, 3))
      .resolves.toEqual({ channelListingOptionId: option.id, safetyStock: 3 });
    const [projected] = await availability.findByChannelSkuIds(TEST_ORGANIZATION_ID, [option.id]);
    expect(projected?.sku).toMatchObject({ safetyStock: 3, sellableStock: 3 });
    expect((await prisma.channelListingOption.findUniqueOrThrow({ where: { id: sibling.id } })).safetyStock).toBe(0);
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: product.id } })).currentStock).toBe(6);
    expect(await prisma.productRegistrationExecution.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).toBe(0);
  });

  async function nextGeneratedCode() {
    const [{ value }] = await prisma.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('kid_item_code_seq'::regclass) AS value
    `;
    return `KID${value.toString().padStart(8, '0')}`;
  }

  async function createProduct(code: string, name: string) {
    return prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: code.length <= 11 ? code : await nextGeneratedCode(),
        sourceAccountKey: 'kiditem',
        sourceProductCode: code,
        sourceOptionCode: '',
        name,
      },
    });
  }

  async function createInventorySku(
    code: string,
    currentStock: number,
    _masterProductId: string,
    input: {
      name?: string;
      optionName?: string | null;
      barcode?: string | null;
      reuseMasterProduct?: boolean;
    } = {},
  ) {
    if (input.reuseMasterProduct !== false) {
      const existing = await prisma.masterProduct.findUnique({
        where: { id: _masterProductId },
      });
      if (existing) {
        return prisma.masterProduct.update({
          where: { id: existing.id },
          data: {
            name: input.name ?? existing.name,
            optionName: input.optionName === undefined
              ? existing.optionName
              : input.optionName,
            barcode: input.barcode === undefined ? existing.barcode : input.barcode,
            currentStock,
            purchasePrice: 100,
          },
        });
      }
    }
    return prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: await nextGeneratedCode(),
        sourceAccountKey: 'kiditem',
        sourceProductCode: code,
        sourceOptionCode: '',
        name: input.name ?? code,
        optionName: input.optionName ?? null,
        barcode: input.barcode === undefined ? `BAR-${code}` : input.barcode,
        currentStock,
        purchasePrice: 100,
      },
    });
  }

  function createListing(input: {
    displayName?: string;
    channelName?: string;
    masterProductId?: string | null;
    rawJson?: object;
    isActive?: boolean;
  }) {
    return prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: `P-${randomUUID()}`,
        channelName: input.channelName,
        displayName: input.displayName,
        rawJson: input.rawJson,
        lastImportRunId: completedRunId,
        status: '승인완료',
        isActive: input.isActive ?? true,
      },
    });
  }

  function createOption(listingId: string, input: {
    itemName?: string;
    sellerSku?: string;
    barcode?: string;
  }) {
    return prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        externalOptionId: `O-${randomUUID()}`,
        itemName: input.itemName,
        sellerSku: input.sellerSku,
        barcode: input.barcode,
        isActive: true,
      },
    });
  }

  function readMappingGeneration(organizationId: string) {
    return prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    }).then((state) => state?.mappingGeneration ?? 0n);
  }

  it('includes active Rocket PO listings published by the canonical completed spelling', async () => {
      const rocketAccount = await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'rocket',
          name: 'Rocket',
        },
      });
      const rocketRun = await prisma.sourceImportRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: rocketAccount.id,
          sourceType: 'coupang_rocket_po_catalog',
          parserVersion: 'rocket-po-v1',
          status: 'completed',
          importedAt: new Date(),
        },
      });
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: rocketAccount.id,
          externalId: 'ROCKET-PO-ELIGIBLE',
          displayName: 'Rocket PO eligible',
          lastImportRunId: rocketRun.id,
          isActive: true,
        },
      });
      const option = await createOption(listing.id, {
        sellerSku: 'ROCKET-PO-SKU',
      });

      const rows = await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {
        channelAccountId: rocketAccount.id,
      });

      expect(rows.map((row) => row.option.id)).toEqual([option.id]);
    });

  it('admits only completed catalog runs on the availability read', async () => {
    const rocketAccount = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: 'Rocket eligibility',
      },
    });
    const cases = [
      {
        name: 'completed Rocket matching CSV',
        run: { sourceType: 'coupang_rocket_matching_csv', status: 'completed', parserVersion: null },
        eligible: true,
      },
      {
        name: 'completed Rocket PO catalog',
        run: { sourceType: 'coupang_rocket_po_catalog', status: 'completed', parserVersion: 'rocket-po-v1' },
        eligible: true,
      },
      {
        name: 'running Rocket matching CSV',
        run: { sourceType: 'coupang_rocket_matching_csv', status: 'running', parserVersion: null },
        eligible: false,
      },
      {
        name: 'uncertified legacy Rocket PO catalog',
        run: { sourceType: 'coupang_rocket_po_catalog', status: 'completed', parserVersion: null },
        eligible: false,
      },
    ];
    const seeded: Array<{ name: string; listingId: string; optionId: string }> = [];
    for (const [index, entry] of cases.entries()) {
      const run = await prisma.sourceImportRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: rocketAccount.id,
          importedAt: new Date(),
          ...entry.run,
        },
      });
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: rocketAccount.id,
          externalId: `ROCKET-ELIGIBILITY-${index}`,
          displayName: entry.name,
          lastImportRunId: run.id,
          isActive: true,
        },
      });
      const option = await createOption(listing.id, { sellerSku: `ROCKET-ELIGIBILITY-${index}` });
      seeded.push({ name: entry.name, listingId: listing.id, optionId: option.id });
    }

    const available = new Set(
      (await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {
        channelAccountId: rocketAccount.id,
      })).map((row) => row.option.id),
    );

    expect(seeded.map((entry) => ({
      name: entry.name,
      availability: available.has(entry.optionId),
    }))).toEqual(cases.map((entry) => ({
      name: entry.name,
      availability: entry.eligible,
    })));
  });

  it('admits a browser-published catalog option on the availability read', async () => {
    // The listing's last run is not a completed catalog run, so only the
    // published option marker can make it catalog identity.
    const runningBasics = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog_basics',
        parserVersion: 'coupang-catalog-owner-v1',
        status: 'running',
      },
    });
    const cases = [
      { name: 'browser catalog publication', source: 'coupang_catalog_browser', eligible: true },
      { name: 'catalog basics publication', source: 'coupang_catalog_basics', eligible: true },
      { name: 'unpublished browser staging', source: 'coupang_wing_catalog_browser', eligible: false },
    ];
    const seeded: Array<{ name: string; listingId: string; optionId: string }> = [];
    for (const [index, entry] of cases.entries()) {
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          externalId: `OPTION-SOURCE-${index}`,
          displayName: entry.name,
          lastImportRunId: runningBasics.id,
          isActive: true,
        },
      });
      const option = await prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `OPTION-SOURCE-${index}-O`,
          rawJson: { source: entry.source },
          isActive: true,
        },
      });
      seeded.push({ name: entry.name, listingId: listing.id, optionId: option.id });
    }

    const available = new Set(
      (await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {
        channelAccountId: ACCOUNT_ID,
      })).map((row) => row.option.id),
    );

    expect(seeded.map((entry) => ({
      name: entry.name,
      availability: available.has(entry.optionId),
    }))).toEqual(cases.map((entry) => ({
      name: entry.name,
      availability: entry.eligible,
    })));
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForBlockedListingStateRead(prisma: PrismaClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [activity] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query ILIKE '%channel_listing_daily_snapshots%'
      ) AS waiting
    `;
    if (activity?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the listing-state read to block.');
}

async function waitForBlockedAdvisoryLock(prisma: PrismaClient): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks
        WHERE locktype = 'advisory' AND granted = false
      ) AS waiting
    `;
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the mapping lock waiter.');
}
