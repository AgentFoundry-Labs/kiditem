import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogDisplayMediaRepositoryAdapter } from '../../ai/adapter/out/repository/catalog-display-media.repository.adapter';
import { CatalogDisplayMediaService } from '../../ai/application/service/catalog-display-media.service';
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
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
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
    const sku = await createInventorySku('SKU-DIRECT', 12);
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

  it('keeps catalog identities unlinked until an operator confirms the MasterProduct', async () => {
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
    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
      masterProductId: product.id,
    });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: product.id });
  });

  it('preserves option inventory recipes when a listing is unlinked from its MasterProduct', async () => {
    const product = await createProduct('KI-PRESERVE', 'Preserve product');
    const sku = await createInventorySku('SKU-PRESERVE', 9);
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
    await expect(prisma.channelListingOptionInventoryComponent.findUniqueOrThrow({
      where: {
        channelListingOptionId_sellpiaInventorySkuId: {
          channelListingOptionId: option.id,
          sellpiaInventorySkuId: sku.id,
        },
      },
    })).resolves.toMatchObject({ quantity: 3 });
  });

  it('auto-matches one exact product and writes an exact manual-alias recipe directly to its option', async () => {
    const product = await createProduct('KI-AUTO', 'Auto product');
    const sku = await createInventorySku('SKU-AUTO', 20);
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

    await expect(service.autoMatch(TEST_ORGANIZATION_ID, {})).resolves.toEqual({
      evaluatedListings: 1,
      matchedListings: 1,
      configuredOptions: 1,
    });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: target.id } }))
      .toMatchObject({ masterProductId: product.id });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: targetOption.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
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

  function createInventorySku(code: string, currentStock: number) {
    return prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
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
    masterProductId?: string;
    rawJson?: object;
    isActive?: boolean;
  }) {
    return prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: `P-${randomUUID()}`,
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
});
