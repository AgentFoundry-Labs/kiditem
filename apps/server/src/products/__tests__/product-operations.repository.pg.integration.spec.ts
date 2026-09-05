import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
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
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/repository/product-operations-data-status.repository.adapter';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

describe('ProductOperationsRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ProductOperationsService;
  let sellpia: SellpiaProfitabilitySourceService;
  let advertising: ProfitabilityAdImportRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const alerts = new SourceFailureAlerts(new AlertsRepository(prismaService));
    sellpia = new SellpiaProfitabilitySourceService(prismaService, alerts);
    advertising = new ProfitabilityAdImportRepositoryAdapter(prismaService, alerts);
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
      new ProductOperationsDataStatusRepositoryAdapter(prismaService,
        new MasterProductProfitabilityReadService(sellpia, advertising, prismaService)),
      { readContribution: async () => null } as never,
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
      activeStatus: 'all',
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
      activeStatus: 'all',
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
    await seedOfficialAbcEvaluations(prisma, [
      { masterProductId: first.id, abcGrade: 'A' },
      { masterProductId: second.id, abcGrade: 'A' },
      { masterProductId: third.id, abcGrade: 'B' },
    ]);

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 1,
      periodDays: 30,
      activeStatus: 'all',
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
      activeStatus: 'all',
    });
    expect(unclassifiedPage.total).toBe(1);
    expect(unclassifiedPage.items.map((item) => item.id)).toEqual([unclassified.id]);
  });

  it('derives ABC display statuses from current source snapshots and keeps status, grade, and organization filters distinct', async () => {
    const observing = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-OBSERVING', name: 'Observing' });
    const ready = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-READY', name: 'Ready' });
    const unpublished = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, { code: 'ABC-UNPUBLISHED', name: 'Unpublished' });
    const foreign = await service.createProduct(OTHER_ORGANIZATION_ID, OTHER_USER_ID, { code: 'ABC-FOREIGN', name: 'Foreign' });
    await inventorySku('SP-ABC-OBSERVING', 1, true, TEST_ORGANIZATION_ID, observing.id);
    await inventorySku('SP-ABC-READY', 1, true, TEST_ORGANIZATION_ID, ready.id);
    await inventorySku('SP-ABC-UNPUBLISHED', 1, true, TEST_ORGANIZATION_ID, unpublished.id);
    await seedOfficialAbcEvaluations(
      prisma,
      [{ masterProductId: ready.id, abcGrade: 'B' }],
    );
    await prisma.masterProduct.update({
      where: { id: observing.id },
      data: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
    });
    await prisma.masterProduct.update({
      where: { id: unpublished.id },
      data: { createdAt: new Date('2026-09-02T00:00:00.000Z') },
    });

    const all = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
    });
    expect(all.total).toBe(3);
    expect(all.items.find((item) => item.id === observing.id)?.abc).toMatchObject({
      abcGrade: null,
      evaluation: null,
      displayStatus: 'INSUFFICIENT_EVIDENCE',
    });
    expect(all.items.find((item) => item.id === ready.id)?.abc).toMatchObject({
      abcGrade: 'B',
      displayStatus: 'READY',
    });
    expect(all.items.find((item) => item.id === unpublished.id)?.abc).toMatchObject({
      abcGrade: null,
      evaluation: null,
      displayStatus: 'NEW',
    });
    expect(all.summary).toMatchObject({
      abcGradeCounts: { A: 0, B: 1, C: 0, unclassified: 2 },
      abcStatusCounts: {
        NEW: 1,
        READY: 1,
        INSUFFICIENT_EVIDENCE: 1,
        SOURCE_UNMAPPED: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
      },
    });

    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: observing.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcCalculationStatus: 'READY',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: ready.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcCalculationStatus: 'NEW',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: unpublished.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, { page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcGrade: 'unclassified' }))
      .resolves.toMatchObject({ total: 2 });
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

  it('increments mapping generation once for a committed recipe replacement', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-GENERATION', 1);
    const sku = await inventorySku('SP-MAPPING-GENERATION', 7, true, TEST_ORGANIZATION_ID, product.id);

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);

    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      { components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }] },
    );

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: {
        activeFormulaVersionId: true,
        formulaRevision: true,
        publicationRevision: true,
        mappingGeneration: true,
      },
    })).resolves.toEqual({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      publicationRevision: 0,
      mappingGeneration: 1n,
    });
  });

  it('does not increment mapping generation for an identical recipe replacement', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-NOOP', 1);
    const sku = await inventorySku('SP-MAPPING-NOOP', 7, true, TEST_ORGANIZATION_ID, product.id);
    const replacement = { components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }] };

    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      replacement,
    );
    const first = await prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: options[0]!.id },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      replacement,
    );

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: options[0]!.id },
      select: { id: true, createdAt: true, updatedAt: true },
    })).resolves.toEqual(first);
  });

  it('does not increment mapping generation for a rejected recipe replacement', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-REJECTED', 1);
    const foreignProduct = await prisma.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'KI-MAPPING-FOREIGN',
        name: 'Foreign product',
      },
    });
    const foreignSku = await inventorySku(
      'SP-MAPPING-FOREIGN',
      7,
      true,
      OTHER_ORGANIZATION_ID,
      foreignProduct.id,
    );

    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      { components: [{ sellpiaInventorySkuId: foreignSku.id, quantity: 1 }] },
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);
    expect(await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBeNull();
  });

  it('rolls back the recipe and generation when the mapping transaction cannot advance', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-ROLLBACK', 1);
    const sku = await inventorySku('SP-MAPPING-ROLLBACK', 7, true, TEST_ORGANIZATION_ID, product.id);
    const oldGeneration = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: { organizationId: TEST_ORGANIZATION_ID, mappingGeneration: oldGeneration },
    });

    await expect(service.replaceChannelOptionInventory(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      { components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }] },
    )).rejects.toThrow();

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(oldGeneration);
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: options[0]!.id },
    })).toBe(0);
  });

  it('does not increment mapping generation for product-operation reads', async () => {
    const { product } = await linkedProductWithOptions('KI-MAPPING-READ', 1);

    await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
    });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);
    expect(await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBeNull();
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

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(withoutFacts.id)).toMatchObject({
      traffic: null,
      orderCount: null,
      salesAmount: null,
      adSpend: null,
      abcEvaluation: null,
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
      abcEvaluation: null,
    });
    expect(page.summary.negativeProfitCount).toBe(0);
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

  function readMappingGeneration(organizationId: string) {
    return prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    }).then((state) => state?.mappingGeneration ?? 0n);
  }

  async function seedOfficialAbcEvaluations(
    prisma: PrismaClient,
    evaluations: readonly { masterProductId: string; abcGrade: 'A' | 'B' | 'C' }[],
  ) {
    const calculatedAt = new Date('2026-09-01T00:00:00.000Z');
    const coverageEndDate = new Date('2026-08-31T00:00:00.000Z');
    const formulaVersion = await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        formulaKey: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.formulaKey,
        version: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD.version,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_HASH,
      },
    });
    const sellpiaSource = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, randomUUID());
    await sellpia.submitAttempt(TEST_ORGANIZATION_ID, sellpiaSource.attemptId, {
      attemptToken: sellpiaSource.attemptToken,
      parserVersion: 'sellpia-profitability-v1',
      providerBackedEmptyProof: true,
      coveredMonths: sellpiaSource.plan.coveredMonths,
      provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      products: [],
    });
    const advertisingSource = await advertising.beginAttempt({ organizationId: TEST_ORGANIZATION_ID, idempotencyKey: randomUUID() });
    expect(advertisingSource.accounts).toEqual([]);
    await advertising.finalizeAttempt({ organizationId: TEST_ORGANIZATION_ID,
      attemptId: advertisingSource.attemptId, attemptToken: advertisingSource.attemptToken });
    await prisma.$transaction(async (tx) => {
      await tx.masterProductAbcFormulaState.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          activeFormulaVersionId: formulaVersion.id,
          formulaRevision: 1,
          publicationRevision: 1,
          officialCutoffDate: coverageEndDate,
          publishedSellpiaSourceImportRunId: sellpiaSource.attemptId,
          publishedAdvertisingSourceImportRunId: advertisingSource.attemptId,
          publishedMappingGeneration: 0n,
          mappingGeneration: 0n,
          publishedAt: calculatedAt,
        },
      });
      await tx.masterProductAbcEvaluation.createMany({
        data: evaluations.map(({ masterProductId, abcGrade }) => ({
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId,
          formulaVersionId: formulaVersion.id,
          abcGrade,
          weightedRevenue: 1_000_000,
          weightedOrderTimeSupplyCost: 200_000,
          weightedAdvertisingSpend: 100_000,
          weightedOperatingProfit: 700_000,
          operatingProfitVelocity30: 700_000,
          operatingMargin: 0.7,
          lossPersistence: 0,
          profitScore: 70,
          marginScore: 100,
          consistencyScore: 100,
          economicScore: abcGrade === 'A' ? 85 : abcGrade === 'B' ? 75 : 20,
          validObservationDays: 30,
          formulaRevision: 1,
          publicationRevision: 1,
          gradeBasisCutoffDate: coverageEndDate,
          sellpiaSourceImportRunId: sellpiaSource.attemptId,
          advertisingSourceImportRunId: advertisingSource.attemptId,
          sellpiaGeneration: 1n,
          advertisingGeneration: 1n,
          mappingGeneration: 0n,
          calculatedAt,
        })),
      });
      for (const grade of ['A', 'B', 'C'] as const) {
        const ids = evaluations
          .filter((evaluation) => evaluation.abcGrade === grade)
          .map((evaluation) => evaluation.masterProductId);
        if (ids.length > 0) {
          await tx.masterProduct.updateMany({
            where: { organizationId: TEST_ORGANIZATION_ID, id: { in: ids } },
            data: { abcGrade: grade },
          });
        }
      }
    });
    return { formulaVersion, sellpiaSource, advertisingSource };
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
