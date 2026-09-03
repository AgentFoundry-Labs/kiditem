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

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelProductMatchingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelProductMatchingRepositoryAdapter;
  let service: ChannelProductMatchingService;
  let completedRunId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    repository = new ChannelProductMatchingRepositoryAdapter(prismaService);
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
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        verifiedGeneration: 1n,
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
      select: { activeFormulaVersionId: true, activatedAt: true, revision: true, mappingGeneration: true },
    })).resolves.toEqual({
      activeFormulaVersionId: null,
      activatedAt: null,
      revision: 0,
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
  }) {
    return prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        externalOptionId: `O-${randomUUID()}`,
        itemName: input.itemName,
        sellerSku: input.sellerSku,
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
});
