import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogDisplayMediaRepositoryAdapter } from '../../ai/adapter/out/repository/catalog-display-media.repository.adapter';
import { CatalogDisplayMediaService } from '../../ai/application/service/catalog-display-media.service';
import { InventoryAvailabilityRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-availability.repository.adapter';
import { InventoryAvailabilityService } from '../../inventory/application/service/inventory-availability.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelProductMatchingService } from '../application/service/channel-product-matching.service';
import { ProductChannelOptionRecipeMutationRepositoryAdapter } from '../../products/adapter/out/repository/product-channel-option-recipe-mutation.repository.adapter';
import { ProductChannelOptionRecipeMutationService } from '../../products/application/service/product-channel-option-recipe-mutation.service';

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
      new ProductChannelOptionRecipeMutationService(
        new ProductChannelOptionRecipeMutationRepositoryAdapter(prismaService),
      ),
    );
    service = new ChannelProductMatchingService(
      repository,
      new CatalogDisplayMediaService(
        new CatalogDisplayMediaRepositoryAdapter(prismaService),
      ),
      new InventoryAvailabilityService(
        new InventoryAvailabilityRepositoryAdapter(prismaService),
      ),
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
        sellpiaInventorySkuId: sku.id,
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
        inventoryComponents: [{ sellpiaInventorySkuId: sku.id, quantity: 2, currentStock: 12 }],
      },
    });
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
        sellpiaInventorySkuId: firstSku.id,
        quantity: 2,
      }, {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: secondOption.id,
        sellpiaInventorySkuId: secondSku.id,
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
    )).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
      masterProductId: product.id,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: null });
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
        sellpiaInventorySkuId: sku.id,
        quantity: 3,
      },
    });

    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, { masterProductId: null });

    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: null });
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
        sellpiaInventorySkuId: sku.id,
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
    const testListing = await createListing({ masterProductId: (await createProduct(
      'KI-ORG-TEST',
      'Test organization product',
    )).id });
    await createOption(testListing.id, { itemName: 'Test option' });
    const otherProduct = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'KI-ORG-OTHER',
        name: 'Other organization product',
      },
    });
    const otherListing = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ACCOUNT_ID,
        externalId: `OTHER-${randomUUID()}`,
        masterProductId: otherProduct.id,
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: otherListing.id,
        externalOptionId: `OTHER-${randomUUID()}`,
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
        sellpiaInventorySkuId: sku.id,
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
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: product.id });
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
        sellpiaInventorySkuId: sku.id,
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
        sellpiaInventorySkuId: sku.id,
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
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: target.id } }))
      .toMatchObject({ masterProductId: product.id });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: targetOption.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: secondTargetOption.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, {})).resolves.toEqual({
      evaluatedListings: 3,
      matchedListings: 0,
      configuredOptions: 0,
    });
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
  });

  it('configures a linked Wing option from its registered title and the stored Sellpia deduction quantity', async () => {
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
        sellpiaInventorySkuId: sku.id,
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
        matchedListings: 0,
        configuredOptions: 1,
      });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: targetOption.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 3 });
    await expect(prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: sku.id } }))
      .resolves.toMatchObject({ currentStock: 27 });
  });

  it('leaves an option whose SKU belongs to an inactive product for review and still links the rest (KID-246)', async () => {
    const active = await createProduct('10162-1', '할로윈 아트 네일팁');
    const retired = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: '9151-1',
        name: '할로윈 LED 거미줄',
        isActive: false,
      },
    });
    const sellpiaSku = (code: string, name: string, masterProductId: string) =>
      prisma.sellpiaInventorySku.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId,
          code,
          name,
          currentStock: 5,
          purchasePrice: 100,
          lastImportRunId: inventoryCompletedRunId,
        },
      });
    const activeSku = await sellpiaSku('10162-1', '할로윈아트네일팁', active.id);
    const retiredSku = await sellpiaSku('9151-1', '할로윈LED거미줄', retired.id);
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
      select: { channelListingOptionId: true, sellpiaInventorySkuId: true },
    })).resolves.toEqual([
      { channelListingOptionId: linkedOption.id, sellpiaInventorySkuId: activeSku.id },
    ]);
    expect(retiredSku.masterProductId).toBe(retired.id);
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
    const watergun = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: product.id,
        code: '10054-1',
        name: '어린이 물총 워터건',
        barcode: '8806384804294',
        currentStock: 27,
        purchasePrice: 100,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
    const beforeStock = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: watergun.id },
      select: { id: true, currentStock: true },
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 1, configuredOptions: 0 });
    expect(await prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: { in: [providerOption.id, csvOption.id] } },
    })).toEqual([]);
    await expect(prisma.sellpiaInventorySku.findUniqueOrThrow({
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
    const slime = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: product.id,
        code: '10429-1',
        name: '2000퓨어클리어슬라임(쿠팡용)',
        barcode: '8806384804966',
        currentStock: 31,
        purchasePrice: 100,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
    const beforeStock = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: slime.id },
      select: { id: true, currentStock: true },
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 1, matchedListings: 1, configuredOptions: 1 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: option.id },
      select: { sellpiaInventorySkuId: true, quantity: true },
    })).resolves.toEqual({ sellpiaInventorySkuId: slime.id, quantity: 9 });
    await expect(prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .resolves.toMatchObject({ masterProductId: product.id });
    await expect(prisma.sellpiaInventorySku.findUniqueOrThrow({
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
    const slime = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: product.id,
        code: '10429-1',
        name: '2000퓨어클리어슬라임(쿠팡용)',
        barcode: '8806384804966',
        currentStock: 31,
        purchasePrice: 100,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
    const second = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: secondProduct.id,
        code: '10429-2',
        name: '슬라임 보조 구성품',
        barcode: null,
        currentStock: 13,
        purchasePrice: 100,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
    const watergun = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: watergunProduct.id,
        code: '10054-1',
        name: '어린이 물총 워터건',
        barcode: '8806384804294',
        currentStock: 27,
        purchasePrice: 100,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
    await prisma.channelListingOptionInventoryComponent.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          sellpiaInventorySkuId: slime.id,
          quantity: 9,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          sellpiaInventorySkuId: second.id,
          quantity: 2,
        },
      ],
    });
    const beforeComponents = await prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { sellpiaInventorySkuId: true, quantity: true },
      orderBy: { sellpiaInventorySkuId: 'asc' },
    });
    const beforeStock = await prisma.sellpiaInventorySku.findMany({
      where: { id: { in: [slime.id, second.id, watergun.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toMatchObject({ evaluatedListings: 1, configuredOptions: 0 });
    await expect(prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .resolves.toMatchObject({ masterProductId: null });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { sellpiaInventorySkuId: true, quantity: true },
      orderBy: { sellpiaInventorySkuId: 'asc' },
    })).resolves.toEqual(beforeComponents);
    await expect(prisma.sellpiaInventorySku.findMany({
      where: { id: { in: [slime.id, second.id, watergun.id] } },
      select: { id: true, currentStock: true },
      orderBy: { id: 'asc' },
    })).resolves.toEqual(beforeStock);
  });

  it('auto-confirms one clear name candidate with matching option and explicit single-unit evidence', async () => {
    const product = await createProduct('KI-NAME-CLEAR', '키즈 식판');
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: product.id,
        code: 'SP-NAME-CLEAR',
        name: '키즈 식판',
        optionName: '블루',
        currentStock: 12,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
    const listing = await createListing({ displayName: '키즈 식판' });
    const option = await createOption(listing.id, { itemName: '블루 단품' });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 1, configuredOptions: 1 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: option.id },
      select: { sellpiaInventorySkuId: true, quantity: true },
    })).resolves.toEqual({ sellpiaInventorySkuId: sku.id, quantity: 1 });
  });

  it('leaves duplicate normalized names and unknown selling quantities for review', async () => {
    const first = await createProduct('KI-NAME-DUP-1', '키즈 식판');
    const second = await createProduct('KI-NAME-DUP-2', '키즈 식판');
    await Promise.all([
      prisma.sellpiaInventorySku.create({ data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: first.id,
        code: 'SP-NAME-DUP-1',
        name: '키즈 식판',
        currentStock: 5,
        lastImportRunId: inventoryCompletedRunId,
      } }),
      prisma.sellpiaInventorySku.create({ data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: second.id,
        code: 'SP-NAME-DUP-2',
        name: '키즈 식판',
        currentStock: 6,
        lastImportRunId: inventoryCompletedRunId,
      } }),
    ]);
    const duplicateListing = await createListing({ displayName: '키즈 식판 단품' });
    const duplicateOption = await createOption(duplicateListing.id, { itemName: '단품' });
    const quantityListing = await createListing({ displayName: '유아 접시' });
    const quantityOption = await createOption(quantityListing.id, {});
    const quantityProduct = await createProduct('KI-NAME-QUANTITY', '유아 접시');
    await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: quantityProduct.id,
      code: 'SP-NAME-QUANTITY',
      name: '유아 접시',
      currentStock: 9,
      lastImportRunId: inventoryCompletedRunId,
    } });

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, { channelAccountId: ACCOUNT_ID }))
      .resolves.toEqual({ evaluatedListings: 2, matchedListings: 0, configuredOptions: 0 });
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: { in: [duplicateOption.id, quantityOption.id] } },
    })).toBe(0);
  });

  it('leaves a high-scoring color mismatch for review', async () => {
    const product = await createProduct('KI-NAME-COLOR', '키즈 식판');
    await prisma.sellpiaInventorySku.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: product.id,
      code: 'SP-NAME-COLOR',
      name: '키즈 식판',
      optionName: '핑크',
      currentStock: 8,
      lastImportRunId: inventoryCompletedRunId,
    } });
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

  function createProduct(code: string, name: string) {
    return prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code, name },
    });
  }

  function createInventorySku(code: string, currentStock: number, masterProductId: string) {
    return prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId,
        code,
        name: code,
        barcode: `BAR-${code}`,
        currentStock,
        purchasePrice: 100,
        lastImportRunId: inventoryCompletedRunId,
      },
    });
  }

  function createListing(input: {
    displayName?: string;
    channelName?: string;
    masterProductId?: string;
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
        masterProductId: input.masterProductId,
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
