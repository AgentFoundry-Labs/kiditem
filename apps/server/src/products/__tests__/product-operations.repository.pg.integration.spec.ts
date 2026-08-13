import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogDisplayMediaRepositoryAdapter } from '../../ai/adapter/out/repository/catalog-display-media.repository.adapter';
import { CatalogDisplayMediaService } from '../../ai/application/service/catalog-display-media.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/repository/product-operations.repository.adapter';
import { ProductOperationsService } from '../application/service/product-operations.service';
import { InventoryAvailabilityRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-availability.repository.adapter';
import { InventoryAvailabilityService } from '../../inventory/application/service/inventory-availability.service';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/repository/product-operations-data-status.repository.adapter';

describe('ProductOperationsRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ProductOperationsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    service = new ProductOperationsService(
      new ProductOperationsRepositoryAdapter(prismaService),
      new InventoryAvailabilityService(
        new InventoryAvailabilityRepositoryAdapter(prismaService),
      ),
      {
        findByMasterProductIds: async () => new Map(),
      },
      new CatalogDisplayMediaService(
        new CatalogDisplayMediaRepositoryAdapter(prismaService),
      ),
      new ProductOperationsDataStatusRepositoryAdapter(prismaService),
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
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: new Date(),
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: new Date(),
      },
    });
  });

  it('creates only the MasterProduct and fences product reads by organization', async () => {
    const created = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-001',
      name: 'Simple product',
    });

    expect(created.channelListings).toEqual([]);
    expect(created.inventoryStatus).toBe('configuration_required');
    expect(created.displayReference).toEqual({
      type: 'product_code',
      label: '상품 코드',
      value: 'KI-001',
    });
    await expect(service.getProduct(OTHER_ORGANIZATION_ID, created.id))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-001',
      name: 'Duplicate',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.masterProduct.count({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'KI-001' },
    })).toBe(1);
  });

  it('displays the origin channel product number without replacing the internal CP code', async () => {
    const channelAccountId = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: channelAccountId,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Coupang Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalId: '13712531060',
      },
    });
    const internalCode = `CP-${listing.id}`;
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        originChannelListingId: listing.id,
        code: internalCode,
        name: 'Channel-origin product',
      },
    });
    await prisma.channelListing.update({
      where: { id: listing.id },
      data: { masterProductId: product.id },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        listingId: listing.id,
        organizationId: TEST_ORGANIZATION_ID,
        externalOptionId: '13684204503001',
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
    });
    const listItem = page.items.find((item) => item.id === product.id);
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(listItem).toMatchObject({
      code: internalCode,
      displayReference: {
        type: 'channel_product',
        label: 'Coupang Wing 상품번호',
        value: '13712531060',
      },
    });
    expect(page.summary.channelProductCounts).toEqual([{
      channelAccountId,
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
      count: 1,
    }]);
    expect(detail).toMatchObject({
      code: internalCode,
      displayReference: {
        type: 'channel_product',
        label: 'Coupang Wing 상품번호',
        value: '13712531060',
      },
      channelListings: [{
        id: listing.id,
        options: [{ id: option.id, externalOptionId: '13684204503001' }],
      }],
    });
  });

  it('derives display images from active matched channel media without persisting them', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Primary Wing',
        status: 'active',
        isPrimary: true,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'DISPLAY-P-1',
        isActive: true,
      },
    });
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        originChannelListingId: listing.id,
        code: 'DISPLAY-MP-1',
        name: 'Channel image fallback',
        imageUrls: [],
      },
    });
    await prisma.channelListing.update({
      where: { id: listing.id },
      data: { masterProductId: product.id },
    });
    const displayUrl = 'https://cdn.example.com/channel-primary.jpg';
    await attachCatalogPrimaryImage(listing.id, 'coupang', displayUrl);

    const foreignAccount = await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Foreign Wing',
        status: 'active',
        isPrimary: true,
      },
    });
    const foreignProduct = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'FOREIGN-DISPLAY-MP',
        name: 'Foreign product',
        imageUrls: [],
      },
    });
    const foreignListing = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: foreignAccount.id,
        masterProductId: foreignProduct.id,
        externalId: 'DISPLAY-P-1',
        isActive: true,
      },
    });
    await attachCatalogPrimaryImage(
      foreignListing.id,
      'coupang',
      'https://cdn.example.com/foreign-channel.jpg',
      OTHER_ORGANIZATION_ID,
    );

    const directProduct = await service.createProduct(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      {
        code: 'DIRECT-DISPLAY-MP',
        name: 'Direct product image',
        imageUrls: ['https://cdn.example.com/operator.jpg'],
      },
    );

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
    });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(byId.get(product.id)).toMatchObject({
      imageUrls: [],
      displayImageUrls: [displayUrl],
    });
    expect(detail).toMatchObject({
      imageUrls: [],
      displayImageUrls: [displayUrl],
    });
    expect(byId.get(directProduct.id)).toMatchObject({
      imageUrls: ['https://cdn.example.com/operator.jpg'],
      displayImageUrls: ['https://cdn.example.com/operator.jpg'],
    });
    expect(page.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayImageUrls: ['https://cdn.example.com/foreign-channel.jpg'],
      }),
    ]));
    expect(await prisma.masterProduct.findUniqueOrThrow({
      where: { id: product.id },
      select: { imageUrls: true },
    })).toEqual({ imageUrls: [] });
  });

  it('summarizes ABC grades across the full result instead of the current page', async () => {
    const first = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-A-1',
      name: 'A grade one',
    });
    const second = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-A-2',
      name: 'A grade two',
    });
    const third = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-B-1',
      name: 'B grade one',
    });
    const unclassified = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-NULL-1',
      name: 'Unclassified grade',
    });
    await prisma.masterProduct.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, id: { in: [first.id, second.id] } },
      data: { abcGrade: 'A' },
    });
    await prisma.masterProduct.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, id: third.id },
      data: { abcGrade: 'B' },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 1,
      periodDays: 30,
    });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(4);
    expect(page.summary.abcGradeCounts).toEqual({ A: 2, B: 1, C: 0, unclassified: 1 });
    expect(page.summary.channelProductCounts).toEqual([]);
    expect(page.summary.inventoryStatusCounts).toEqual({
      sellable: 0,
      partial_out_of_stock: 0,
      out_of_stock: 0,
      configuration_required: 4,
      review_required: 0,
    });
    expect(page.summary.negativeProfitCount).toBe(0);

    const unclassifiedPage = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      abcGrade: 'unclassified',
    });
    expect(unclassifiedPage.total).toBe(1);
    expect(unclassifiedPage.items.map((item) => item.id)).toEqual([unclassified.id]);
  });

  it('hydrates automatic ABC statuses and keeps status, grade, and organization filters distinct', async () => {
    const observing = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-OBSERVING', name: 'Observing' });
    const mapping = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-MAPPING', name: 'Mapping' });
    const orderStale = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-ORDER-STALE', name: 'Order stale' });
    const unpublished = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-UNPUBLISHED', name: 'Unpublished' });
    const foreign = await service.createProduct(OTHER_ORGANIZATION_ID, OTHER_USER_ID, { code: 'ABC-FOREIGN', name: 'Foreign' });
    await prisma.masterProduct.update({ where: { id: orderStale.id }, data: { abcGrade: 'B' } });
    const calculatedAt = new Date('2026-07-24T00:00:00.000Z');
    await prisma.masterProductAbcEvaluation.createMany({
      data: [
        automaticEvaluationRow(observing.id, 'INSUFFICIENT_EVIDENCE', calculatedAt),
        automaticEvaluationRow(mapping.id, 'SOURCE_UNMAPPED', calculatedAt, TEST_ORGANIZATION_ID, 'UNMAPPED'),
        automaticEvaluationRow(orderStale.id, 'ORDERS_SOURCE_STALE', calculatedAt, TEST_ORGANIZATION_ID, 'READY', 'STALE'),
        automaticEvaluationRow(foreign.id, 'INSUFFICIENT_EVIDENCE', calculatedAt, OTHER_ORGANIZATION_ID),
      ],
    });

    const all = await service.listProducts(TEST_ORGANIZATION_ID, { page: 1, limit: 50, periodDays: 30 });
    expect(all.total).toBe(4);
    expect(all.items.find((item) => item.id === observing.id)).toMatchObject({
      abcGrade: null,
      abcEvaluation: { calculationStatus: 'INSUFFICIENT_EVIDENCE' },
    });
    expect(all.summary).toMatchObject({
      abcGradeCounts: { A: 0, B: 1, C: 0, unclassified: 3 },
      abcStatusCounts: {
        INSUFFICIENT_EVIDENCE: 2,
        SOURCE_UNMAPPED: 1,
        ORDERS_SOURCE_STALE: 1,
        CALIBRATION_PENDING: 0,
      },
    });

    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: observing.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, abcCalculationStatus: 'SOURCE_UNMAPPED',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: mapping.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, abcCalculationStatus: 'ORDERS_SOURCE_STALE',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: orderStale.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, { page: 1, limit: 50, periodDays: 30, abcGrade: 'unclassified' }))
      .resolves.toMatchObject({ total: 3 });
    expect(all.items.map((item) => item.id)).not.toContain(foreign.id);
    expect(all.items.map((item) => item.id)).toContain(unpublished.id);
  });

  it('allows the same product code in different organizations', async () => {
    await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-SHARED',
      name: 'Test product',
    });
    await service.createProduct(OTHER_ORGANIZATION_ID, OTHER_USER_ID, {
      code: 'KI-SHARED',
      name: 'Other product',
    });

    expect(await prisma.masterProduct.count({
      where: { code: 'KI-SHARED' },
    })).toBe(2);
  });

  it('projects direct channel-option recipes and deduplicates shared physical stock', async () => {
    const { product, options } = await linkedProductWithOptions('KI-BUNDLE', 2);
    const sku = await inventorySku('SP-SHARED', 7, true, TEST_ORGANIZATION_ID, product.id);

    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      { components: [{ sellpiaInventorySkuId: sku.id, quantity: 1 }] },
    );
    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[1]!.id,
      { components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }] },
    );
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(detail.inventoryUnits).toBe(7);
    expect(detail.inventoryStatus).toBe('sellable');
    expect(detail.channelListings[0]!.options.map((option) => option.capacity).sort()).toEqual([3, 7]);
    const single = detail.channelListings[0]!.options.find(({ id }) => id === options[0]!.id);
    expect(single?.inventoryComponents).toMatchObject([{
      sellpiaInventorySkuId: sku.id,
      quantity: 1,
      currentStock: 7,
      availableStock: 7,
    }]);
    expect(await prisma.masterProduct.findUniqueOrThrow({
      where: { id: product.id },
      select: { id: true },
    })).toEqual({ id: product.id });
  });

  it('uses physical stock for option capacity without mutating it', async () => {
    const { product, options } = await linkedProductWithOptions('KI-COMMITTED', 1);
    const sku = await inventorySku('SP-COMMITTED', 100, true, TEST_ORGANIZATION_ID, product.id);
    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      { components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }] },
    );
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(detail).toMatchObject({
      inventoryUnits: 100,
      inventoryStatus: 'sellable',
      channelListings: [{ options: [{
        capacity: 50,
        inventoryComponents: [{
          currentStock: 100,
          availableStock: 100,
          quantity: 2,
        }],
      }] }],
    });
    expect(await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: sku.id },
      select: { currentStock: true },
    })).toEqual({ currentStock: 100 });
  });

  it('atomically replaces direct recipes and preserves the old recipe on invalid input', async () => {
    const { product, options } = await linkedProductWithOptions('KI-RECIPE', 1);
    const inactiveOwner = await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'INV-INACTIVE', name: 'Inactive' },
    });
    const foreignOwner = await prisma.masterProduct.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, code: 'INV-FOREIGN', name: 'Foreign' },
    });
    const active = await inventorySku('SP-ACTIVE', 8, true, TEST_ORGANIZATION_ID, product.id);
    const inactive = await inventorySku('SP-INACTIVE', 10, false, TEST_ORGANIZATION_ID, inactiveOwner.id);
    const foreign = await inventorySku('SP-FOREIGN', 10, true, OTHER_ORGANIZATION_ID, foreignOwner.id);
    const optionId = options[0]!.id;

    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      optionId,
      { components: [{ sellpiaInventorySkuId: active.id, quantity: 3 }] },
    );
    const replaced = await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    expect(replaced.channelListings[0]!.options[0]).toMatchObject({
      capacity: 2,
      inventoryComponents: [{ sellpiaInventorySkuId: active.id, quantity: 3 }],
    });

    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      optionId,
      { components: [{ sellpiaInventorySkuId: inactive.id, quantity: 1 }] },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      optionId,
      { components: [{ sellpiaInventorySkuId: foreign.id, quantity: 1 }] },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replaceChannelOptionInventory(
      OTHER_ORGANIZATION_ID,
      optionId,
      { components: [] },
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(await prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: optionId },
      select: { sellpiaInventorySkuId: true, quantity: true },
    })).toEqual([{ sellpiaInventorySkuId: active.id, quantity: 3 }]);

    await prisma.sellpiaInventorySku.update({
      where: { id: active.id },
      data: { isActive: false },
    });
    const afterInactivation = await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    expect(afterInactivation).toMatchObject({
      inventoryStatus: 'review_required',
      channelListings: [{ options: [{
        capacity: null,
        inventoryComponents: [{ sellpiaInventorySkuId: active.id, isActive: false }],
      }] }],
    });
  });

  it('derives the product link when an unlinked listing receives a complete recipe', async () => {
    const product = await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'INV-UNLINKED', name: 'Inventory product' },
    });
    const sku = await inventorySku('SP-UNLINKED', 5, true, TEST_ORGANIZATION_ID, product.id);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Unlinked Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'UNLINKED-P',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'UNLINKED-O',
      },
    });

    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      option.id,
      { components: [{ sellpiaInventorySkuId: sku.id, quantity: 1 }] },
    )).resolves.toEqual({ masterProductId: product.id });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: product.id });
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: option.id },
    })).toBe(1);
  });

  it('links several options only when every recipe converges on one inventory product', async () => {
    const first = await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'INV-FIRST', name: 'First inventory' },
    });
    const second = await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'INV-SECOND', name: 'Second inventory' },
    });
    const firstSku = await inventorySku('SP-FIRST', 5, true, TEST_ORGANIZATION_ID, first.id);
    const secondSku = await inventorySku('SP-SECOND', 5, true, TEST_ORGANIZATION_ID, second.id);
    const { listing, options } = await linkedProductWithOptions('LEGACY-MIXED', 2);

    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      { components: [{ sellpiaInventorySkuId: firstSku.id, quantity: 1 }] },
    )).resolves.toEqual({ masterProductId: null });
    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[1]!.id,
      { components: [{ sellpiaInventorySkuId: secondSku.id, quantity: 1 }] },
    )).resolves.toEqual({ masterProductId: null });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: null });

    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[1]!.id,
      { components: [{ sellpiaInventorySkuId: firstSku.id, quantity: 2 }] },
    )).resolves.toEqual({ masterProductId: first.id });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: first.id });
  });

  it('keeps product metrics null without facts and aggregates linked listing facts when present', async () => {
    const withoutFacts = await service.createProduct(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      { code: 'KI-NULL', name: 'No facts' },
    );
    const withFacts = await service.createProduct(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      { code: 'KI-FACTS', name: 'With facts' },
    );
    const channelAccountId = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: channelAccountId,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        masterProductId: withFacts.id,
        externalId: 'P-001',
      },
    });
    const now = new Date();
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: now,
        trafficViews: 20,
        trafficOrders: 3,
        trafficRevenue: 40_000,
        adSpend: 5_000,
      },
    });
    await prisma.profitLoss.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        netProfit: 12_000,
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
    });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(withoutFacts.id)).toMatchObject({
      traffic: null,
      orderCount: null,
      salesAmount: null,
      adSpend: null,
      profit: null,
    });
    expect(byId.get(withFacts.id)).toMatchObject({
      channelCount: 1,
      traffic: null,
      visitorCount: null,
      viewCount: 20,
      cartAddCount: null,
      orderCount: 3,
      salesQuantity: null,
      salesAmount: 40_000,
      adSpend: 5_000,
      profit: 12_000,
    });
  });

  async function linkedProductWithOptions(code: string, optionCount: number) {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code,
        name: code,
      },
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: `${code} Wing`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        masterProductId: product.id,
        externalId: `${code}-P`,
      },
    });
    const options = await Promise.all(Array.from({ length: optionCount }, (_, index) =>
      prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `${code}-O-${index + 1}`,
        },
      })));
    return { product, listing, options };
  }

  function inventorySku(
    code: string,
    currentStock: number,
    isActive = true,
    organizationId = TEST_ORGANIZATION_ID,
    masterProductId?: string,
  ) {
    return prisma.sellpiaInventorySku.create({
      data: { organizationId, masterProductId, code, name: code, currentStock, isActive },
    });
  }

  function automaticEvaluationRow(
    masterProductId: string,
    calculationStatus: 'INSUFFICIENT_EVIDENCE' | 'SOURCE_UNMAPPED' | 'ORDERS_SOURCE_STALE',
    calculatedAt: Date,
    organizationId = TEST_ORGANIZATION_ID,
    mappingSourceStatus: 'READY' | 'UNMAPPED' = 'READY',
    ordersSourceStatus: 'READY' | 'STALE' = 'READY',
  ) {
    return {
      organizationId,
      masterProductId,
      calculationStatus,
      evaluationCutoffDate: calculatedAt,
      sellpiaSourceStatus: 'READY',
      advertisingSourceStatus: 'READY',
      ordersSourceStatus,
      mappingSourceStatus,
      costComponentsJson: automaticCostComponents(),
      calculatedAt,
    };
  }

  function automaticCostComponents() {
    return {
      recognizedRevenue: { amount: 0, status: 'OBSERVED' },
      orderTimeCogs: { amount: 0, status: 'OBSERVED' },
      advertisingSpend: { amount: 0, status: 'OBSERVED' },
      marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
      outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
      returnLoss: { amount: 0, status: 'NOT_APPLIED' },
      otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
    };
  }

  async function attachCatalogPrimaryImage(
    listingId: string,
    channel: string,
    url: string,
    organizationId = TEST_ORGANIZATION_ID,
  ) {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId,
        ownerType: 'channel_listing',
        channelListingId: listingId,
        displayName: `Workspace ${listingId}`,
        normalizedTitle: `workspace${listingId.replaceAll('-', '')}`,
      },
    });
    const group = await prisma.contentGenerationGroup.create({
      data: {
        organizationId,
        contentWorkspaceId: workspace.id,
        groupType: 'workspace_assets',
        title: 'Workspace managed assets',
      },
    });
    await prisma.contentAsset.create({
      data: {
        organizationId,
        originGenerationGroupId: group.id,
        assetKey: `channel-provider:${channel}:${listingId}`,
        url,
        assetType: 'image',
        role: 'primary',
        sortOrder: 0,
        metadata: { sourceType: 'channel_catalog', channel, active: true },
      },
    });
  }

});
