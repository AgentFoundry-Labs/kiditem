import { BadRequestException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buildPeriodBasis, enumerateDashboardDates } from '@kiditem/shared/dashboard';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
import { ProductOperationsService } from './product-operations.service';
import type { ProductOperationsRepositoryPort } from '../port/out/repository/product-operations.repository.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const productId = '00000000-0000-4000-8000-000000000003';
const channelListingOptionId = '00000000-0000-4000-8000-000000000004';
const skuId = '00000000-0000-4000-8000-000000000005';

describe('ProductOperationsService', () => {
  it('reads actual contribution for the basis selected by Finance evidence', async () => {
    const repository = makeRepository();
    const product = rawListProduct(productId);
    product.abcGrade = 'B';
    product.abcEvaluation = officialEvaluation();
    repository.listProducts.mockResolvedValue({
      items: [product],
      page: 1,
      limit: 50,
      sellingChannelProducts: [],
    });
    const contribution = {
      readContribution: vi.fn().mockResolvedValue(contributionAnalytics()),
    };
    const service = new ProductOperationsService(
      repository as never,
      {
        findBySkuIds: vi.fn().mockResolvedValue({ snapshot: {}, items: [] }),
      } as never,
      {
        findByMasterProductIds: vi.fn().mockResolvedValue(new Map()),
      } as never,
      makeCatalogDisplayMedia() as never,
      makeDataStatusRepository(abcStatusFacts()) as never,
      contribution as never,
      makeRecipeMutations() as never,
    );

    const result = await service.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
      adStatus: 'all',
    });

    expect(contribution.readContribution).toHaveBeenCalledWith({
      organizationId,
      basisFromDate: '2026-02-01',
      basisCutoffDate: '2026-08-31',
      sellpiaSourceImportRunId: '00000000-0000-4000-8000-000000000011',
      advertisingSourceImportRunId: '00000000-0000-4000-8000-000000000012',
      masterProductIds: [productId],
    });
    expect(result.items[0]).toMatchObject({
      abcGrade: 'B',
      abcEvaluation: { publicationRevision: 4 },
      abc: {
        abcGrade: 'B',
        formulaRevision: 2,
        publicationRevision: 4,
        officialCutoffDate: '2026-07-31',
        actualCutoffDate: '2026-08-31',
      },
      contribution: { operatingProfit: 250_000 },
    });
    expect(result.summary.contributionOverview).toEqual(
      expect.objectContaining({ totals: expect.objectContaining({ netOperatingProfit: 250_000 }) }),
    );
  });

  it('publishes the ABC official cutoff beside grade counts, null before Products publishes', async () => {
    const published = abcStatusFacts();
    const unpublished = {
      ...published,
      contributionBasis: null,
      formulaState: {
        ...published.formulaState,
        publicationRevision: 0,
        officialCutoff: null,
        publishedAt: null,
      },
      products: published.products.map((product) => ({
        ...product,
        abcGrade: null,
        evaluation: null,
      })),
    };
    const summaryFor = async (status: unknown) => {
      const repository = makeRepository();
      repository.listProducts.mockResolvedValue({
        items: [rawListProduct(productId)],
        page: 1,
        limit: 50,
        sellingChannelProducts: [],
      });
      const service = new ProductOperationsService(
        repository as never,
        { findBySkuIds: vi.fn().mockResolvedValue({ snapshot: {}, items: [] }) } as never,
        { findByMasterProductIds: vi.fn().mockResolvedValue(new Map()) } as never,
        makeCatalogDisplayMedia() as never,
        { read: vi.fn().mockResolvedValue(status) } as never,
        makeContributionRead() as never,
        makeRecipeMutations() as never,
      );
      const result = await service.listProducts(organizationId, {
        page: 1,
        limit: 50,
        periodDays: 30,
        activeStatus: 'all',
        adStatus: 'all',
      });
      return result.summary;
    };

    // Without a publication no grade was measured; only the cutoff separates
    // that from a publication that graded no product A, B or C.
    await expect(summaryFor(unpublished)).resolves.toMatchObject({
      abcGradeCounts: { A: 0, B: 0, C: 0, unclassified: 1 },
      abcOfficialCutoffDate: null,
    });
    await expect(summaryFor(published)).resolves.toMatchObject({
      abcGradeCounts: { A: 0, B: 1, C: 0, unclassified: 0 },
      abcOfficialCutoffDate: '2026-07-31',
    });
  });

  it('hydrates availability once and keeps depletion summary counts independent of pagination', async () => {
    const repository = makeRepository();
    const first = rawListProduct(productId);
    const secondId = '00000000-0000-4000-8000-000000000006';
    const second = rawListProduct(secondId);
    first.activeChannelProducts = [{
      channelAccountId: '00000000-0000-4000-8000-000000000101',
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
    }];
    second.activeChannelProducts = [{
      channelAccountId: '00000000-0000-4000-8000-000000000101',
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
    }, {
      channelAccountId: '00000000-0000-4000-8000-000000000102',
      channel: 'coupang_rocket',
      channelAccountName: 'Coupang Rocket',
    }];
    second.isActive = false;
    repository.listProducts.mockResolvedValue({
      items: [first, second],
      page: 1,
      limit: 1,
      sellingChannelProducts: [{
        channelAccountId: '00000000-0000-4000-8000-000000000101',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
      }, {
        channelAccountId: '00000000-0000-4000-8000-000000000102',
        channel: 'coupang_rocket',
        channelAccountName: 'Coupang Rocket',
      }],
    });
    const inventory = {
      findBySkuIds: vi.fn().mockResolvedValue({
        snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{
          sellpiaInventorySkuId: skuId,
          currentStock: 100,
          availableStock: 100,
          isActive: true,
          generation: '12',
        }],
      }),
    };
    const depletion = {
      findByMasterProductIds: vi.fn().mockResolvedValue(new Map([
        [productId, {
          coverage: 'ready',
          needsReorder: true,
          reorderSkuCount: 1,
          minMonthsOfAvailableStockLeft: 0.2,
        }],
        [secondId, {
          coverage: 'shared',
          needsReorder: false,
          reorderSkuCount: 0,
          minMonthsOfAvailableStockLeft: 1,
        }],
      ])),
    };
    const service = new ProductOperationsService(
      repository as never,
      inventory as never,
      depletion as never,
      makeCatalogDisplayMedia() as never,
      makeDataStatusRepository() as never,
      makeContributionRead() as never,
      makeRecipeMutations() as never,
    );

    const result = await service.listProducts(organizationId, {
      page: 1,
      limit: 1,
      periodDays: 30,
      activeStatus: 'all',
      adStatus: 'all',
    });

    expect(inventory.findBySkuIds).toHaveBeenCalledOnce();
    expect(inventory.findBySkuIds).toHaveBeenCalledWith({
      organizationId,
      sellpiaInventorySkuIds: [skuId],
    });
    expect(depletion.findByMasterProductIds).toHaveBeenCalledOnce();
    expect(depletion.findByMasterProductIds).toHaveBeenCalledWith({
      organizationId,
      masterProductIds: [productId, secondId],
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      inventoryUnits: 100,
      depletion: { needsReorder: true },
      visitorCount: 11,
      viewCount: 22,
      cartAddCount: 3,
      orderCount: 4,
      salesQuantity: 5,
      salesAmount: 35_000,
      adSpend: 3_500,
      adSpendRate: 10,
    });
    expect(result.summary).toMatchObject({
      reorderProductCount: 1,
      depletionCoveredProductCount: 2,
    });
    expect(result.summary.channelProductCounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ channelAccountName: 'Coupang Wing', count: 1 }),
      expect.objectContaining({ channelAccountName: 'Coupang Rocket', count: 1 }),
    ]));
  });

  it('counts only negative ABC contribution profit across the full pre-pagination result', async () => {
    const repository = makeRepository();
    const positive = rawListProduct(productId);
    const zero = rawListProduct('00000000-0000-4000-8000-000000000097');
    const missing = rawListProduct('00000000-0000-4000-8000-000000000098');
    const negative = rawListProduct('00000000-0000-4000-8000-000000000099');
    repository.listProducts.mockResolvedValue({
      items: [positive, zero, missing, negative],
      page: 1,
      limit: 1,
      sellingChannelProducts: [],
    });
    const analytics = contributionAnalytics();
    analytics.products = [
      contributionProduct(positive.id, 12_000),
      contributionProduct(zero.id, 0),
      contributionProduct(missing.id, null),
      contributionProduct(negative.id, -12_000),
    ];
    const service = makeService(
      repository,
      makeCatalogDisplayMedia(),
      { readContribution: vi.fn().mockResolvedValue(analytics) },
    );

    const result = await service.listProducts(organizationId, {
      page: 1,
      limit: 1,
      periodDays: 30,
      activeStatus: 'all',
      adStatus: 'all',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(positive.id);
    expect(result.total).toBe(4);
    expect(result.summary.negativeProfitCount).toBe(1);
  });

  it('uses the same inventory command predicates for counts and filtered product rows', async () => {
    const attentionId = '10000000-0000-4000-8000-000000000011';
    const outOfStockId = '10000000-0000-4000-8000-000000000012';
    const imminentId = '10000000-0000-4000-8000-000000000013';
    const reorderId = '10000000-0000-4000-8000-000000000014';
    const outOfStockSkuId = '10000000-0000-4000-8000-000000000021';
    const imminentSkuId = '10000000-0000-4000-8000-000000000022';
    const reorderSkuId = '10000000-0000-4000-8000-000000000023';
    const attention = rawListProduct(attentionId);
    attention.inventorySkuIds = [];
    attention.inventoryOptions[0]!.inventoryComponents = [];
    const outOfStock = rawListProduct(outOfStockId);
    outOfStock.inventorySkuIds = [outOfStockSkuId];
    outOfStock.inventoryOptions[0]!.inventoryComponents[0]!.sellpiaInventorySkuId = outOfStockSkuId;
    const imminent = rawListProduct(imminentId);
    imminent.inventorySkuIds = [imminentSkuId];
    imminent.inventoryOptions[0]!.inventoryComponents[0]!.sellpiaInventorySkuId = imminentSkuId;
    const reorder = rawListProduct(reorderId);
    reorder.inventorySkuIds = [reorderSkuId];
    reorder.inventoryOptions[0]!.inventoryComponents[0]!.sellpiaInventorySkuId = reorderSkuId;
    const repository = makeRepository();
    repository.listProducts.mockResolvedValue({
      items: [attention, outOfStock, imminent, reorder],
      page: 1,
      limit: 50,
    });
    const service = new ProductOperationsService(
      repository as never,
      {
        findBySkuIds: vi.fn().mockResolvedValue({
          snapshot: { collected: true, generation: '12', verifiedAt: '2026-08-03T00:00:00.000Z' },
          items: [
            inventoryAvailability(outOfStockSkuId, 0),
            inventoryAvailability(imminentSkuId, 12),
            inventoryAvailability(reorderSkuId, 12),
          ],
        }),
      } as never,
      {
        findByMasterProductIds: vi.fn().mockResolvedValue(new Map([
          [attentionId, depletionProjection(false, null)],
          [outOfStockId, depletionProjection(false, null)],
          [imminentId, depletionProjection(false, 2)],
          [reorderId, depletionProjection(true, 1)],
        ])),
      } as never,
      makeCatalogDisplayMedia() as never,
      makeDataStatusRepository() as never,
      makeContributionRead() as never,
      makeRecipeMutations() as never,
    );
    const baseQuery = {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'active',
      adStatus: 'all',
    } as const;

    const overview = await service.listProducts(organizationId, baseQuery);
    expect(overview.summary).toMatchObject({
      imminentProductCount: 1,
      reorderProductCount: 1,
    });

    await expect(service.listProducts(organizationId, {
      ...baseQuery,
      inventoryFocus: 'attention',
    })).resolves.toMatchObject({ total: 1, items: [{ id: attentionId }] });
    await expect(service.listProducts(organizationId, {
      ...baseQuery,
      inventoryFocus: 'out_of_stock',
    })).resolves.toMatchObject({ total: 1, items: [{ id: outOfStockId }] });
    await expect(service.listProducts(organizationId, {
      ...baseQuery,
      inventoryFocus: 'imminent',
    })).resolves.toMatchObject({ total: 1, items: [{ id: imminentId }] });
    await expect(service.listProducts(organizationId, {
      ...baseQuery,
      inventoryFocus: 'reorder',
    })).resolves.toMatchObject({ total: 1, items: [{ id: reorderId }] });
  });

  it('creates only the MasterProduct without a synthetic option layer', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

    await service.createProduct(organizationId, userId, {
      code: ' KI-001 ',
      name: ' Product ',
    });

    expect(repository.createProduct).toHaveBeenCalledWith({
      organizationId,
      product: expect.objectContaining({
        code: 'KI-001',
        name: 'Product',
      }),
    });
    expect(repository.createProduct.mock.calls[0]?.[0].product).not.toHaveProperty('variants');
  });

  it('keeps direct product images ahead of channel display media', async () => {
    const repository = makeRepository();
    repository.getProduct.mockResolvedValue({
      ...rawProduct(),
      imageUrls: ['https://cdn.example.com/operator.jpg'],
    });
    const media = makeCatalogDisplayMedia();
    const service = makeService(repository, media);

    const result = await service.getProduct(organizationId, productId);
    expect(result).toMatchObject({
      imageUrls: ['https://cdn.example.com/operator.jpg'],
      displayImageUrls: ['https://cdn.example.com/operator.jpg'],
    });
    expect(result.displayImageUrls).not.toBe(result.imageUrls);
    expect(repository.listDisplayMediaTargets).not.toHaveBeenCalled();
    expect(media.findDisplayMedia).not.toHaveBeenCalled();
  });

  it('uses matched channel media without mutating empty product images', async () => {
    const repository = makeRepository();
    repository.listDisplayMediaTargets.mockResolvedValue([{
      masterProductId: productId,
      channelListingId: '00000000-0000-4000-8000-000000000006',
      isOrigin: true,
      isPrimaryAccount: true,
      listingExternalId: 'P-1',
    }]);
    const media = makeCatalogDisplayMedia();
    media.findDisplayMedia.mockResolvedValue(new Map([[productId, {
      url: 'https://cdn.example.com/channel.jpg',
      source: 'channel_catalog',
      channel: 'coupang',
      channelListingId: '00000000-0000-4000-8000-000000000006',
      externalOptionId: null,
    }]]));
    const service = makeService(repository, media);

    await expect(service.getProduct(organizationId, productId)).resolves.toMatchObject({
      imageUrls: [],
      displayImageUrls: ['https://cdn.example.com/channel.jpg'],
    });
  });

  it('keeps an empty display image list when no channel target exists', async () => {
    const repository = makeRepository();
    const media = makeCatalogDisplayMedia();
    const service = makeService(repository, media);

    await expect(service.getProduct(organizationId, productId)).resolves.toMatchObject({
      imageUrls: [],
      displayImageUrls: [],
    });
    expect(media.findDisplayMedia).toHaveBeenCalledWith({
      organizationId,
      requests: [],
    });
  });

  it('keeps product reads available when channel media lookup fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.listDisplayMediaTargets.mockResolvedValue([{
      masterProductId: productId,
      channelListingId: '00000000-0000-4000-8000-000000000006',
      isOrigin: true,
      isPrimaryAccount: true,
      listingExternalId: 'P-1',
    }]);
    const media = makeCatalogDisplayMedia();
    media.findDisplayMedia.mockRejectedValue(new Error('media unavailable'));
    const service = makeService(repository, media);

    await expect(service.getProduct(organizationId, productId)).resolves.toMatchObject({
      imageUrls: [],
      displayImageUrls: [],
    });
    expect(warn).toHaveBeenCalledWith(
      `Product display media enrichment failed for organization ${organizationId}.`,
      expect.stringContaining('Error: media unavailable'),
    );
    warn.mockRestore();
  });

  it('keeps product detail reads available when display target lookup fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.listDisplayMediaTargets.mockRejectedValue(
      new Error('display targets unavailable'),
    );
    const service = makeService(repository);

    await expect(service.getProduct(organizationId, productId)).resolves.toMatchObject({
      imageUrls: [],
      displayImageUrls: [],
    });
    expect(warn).toHaveBeenCalledWith(
      `Product display media enrichment failed for organization ${organizationId}.`,
      expect.stringContaining('Error: display targets unavailable'),
    );
    warn.mockRestore();
  });

  it('keeps product list reads available when display target lookup fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.listProducts.mockResolvedValue({
      items: [rawListProduct(productId)],
      page: 1,
      limit: 50,
    });
    repository.listDisplayMediaTargets.mockRejectedValue(
      new Error('display targets unavailable'),
    );
    const service = makeService(repository);

    await expect(service.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
      adStatus: 'all',
    })).resolves.toMatchObject({
      items: [{ imageUrls: [], displayImageUrls: [] }],
    });
    expect(warn).toHaveBeenCalledWith(
      `Product display media enrichment failed for organization ${organizationId}.`,
      expect.stringContaining('Error: display targets unavailable'),
    );
    warn.mockRestore();
  });

  it('keeps a committed product creation available when display target lookup fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.listDisplayMediaTargets.mockRejectedValue(
      new Error('display targets unavailable'),
    );
    const service = makeService(repository);

    await expect(service.createProduct(organizationId, userId, {
      code: 'KI-001',
      name: 'Product',
    })).resolves.toMatchObject({
      imageUrls: [],
      displayImageUrls: [],
    });
    expect(repository.createProduct).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('keeps a committed product update available when display target lookup fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.listDisplayMediaTargets.mockRejectedValue(
      new Error('display targets unavailable'),
    );
    const service = makeService(repository);

    await expect(service.updateProduct(
      organizationId,
      productId,
      { name: 'Renamed' },
    )).resolves.toMatchObject({
      imageUrls: [],
      displayImageUrls: [],
    });
    expect(repository.updateProduct).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('accepts a one-release legacy abcGrade but never forwards it to persistence', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

    await service.updateProduct(organizationId, productId, {
      name: 'Renamed',
      abcGrade: 'A',
    });

    expect(repository.updateProduct).toHaveBeenCalledWith(
      organizationId,
      productId,
      { name: 'Renamed' },
    );
  });

  it('rejects duplicate and non-positive option inventory components before persistence', async () => {
    const repository = makeRepository();
    const recipeMutations = makeRecipeMutations();
    const service = makeService(
      repository,
      makeCatalogDisplayMedia(),
      makeContributionRead(),
      recipeMutations,
    );

    await expect(service.replaceChannelOptionInventory(
      organizationId,
      channelListingOptionId,
      {
        components: [
          { sellpiaInventorySkuId: skuId, quantity: 1 },
          { sellpiaInventorySkuId: skuId, quantity: 2 },
        ],
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replaceChannelOptionInventory(
      organizationId,
      channelListingOptionId,
      { components: [{ sellpiaInventorySkuId: skuId, quantity: 0 }] },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(recipeMutations.replaceRecipe).not.toHaveBeenCalled();
  });

  it('passes every detail and mutation through an organization fence', async () => {
    const repository = makeRepository();
    const recipeMutations = makeRecipeMutations();
    const service = makeService(repository, makeCatalogDisplayMedia(), makeContributionRead(), recipeMutations);

    await service.getProduct(organizationId, productId);
    await service.updateProduct(organizationId, productId, { name: 'Renamed' });
    await service.replaceChannelOptionInventory(organizationId, channelListingOptionId, {
      components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
    });

    expect(repository.getProduct).toHaveBeenCalledWith(organizationId, productId);
    expect(repository.updateProduct).toHaveBeenCalledWith(
      organizationId,
      productId,
      { name: 'Renamed' },
    );
    expect(recipeMutations.replaceRecipe).toHaveBeenCalledWith({
      organizationId,
      channelListingOptionId,
      components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
    });
  });
});

function makeRepository() {
  const product = rawProduct();
  return {
    listProducts: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      limit: 50,
    }),
    listDisplayMediaTargets: vi.fn().mockResolvedValue([]),
    getProduct: vi.fn().mockResolvedValue(product),
    createProduct: vi.fn().mockResolvedValue(product),
    updateProduct: vi.fn().mockResolvedValue(product),
  } as unknown as {
    [K in keyof ProductOperationsRepositoryPort]: ReturnType<typeof vi.fn>;
  };
}

function makeCatalogDisplayMedia() {
  return { findDisplayMedia: vi.fn().mockResolvedValue(new Map()) };
}

function makeDataStatusRepository(status = abcStatusFacts()) {
  return {
    read: vi.fn().mockResolvedValue(status),
  };
}

function makeContributionRead() {
  return { readContribution: vi.fn().mockResolvedValue(contributionAnalytics()) };
}

function makeRecipeMutations() {
  return {
    replaceRecipe: vi.fn().mockResolvedValue({ masterProductId: productId }),
  };
}

function makeService(
  repository: ReturnType<typeof makeRepository>,
  media = makeCatalogDisplayMedia(),
  contribution = makeContributionRead(),
  recipeMutations = makeRecipeMutations(),
) {
  return new ProductOperationsService(
    repository as never,
    {
      findBySkuIds: vi.fn().mockResolvedValue({
        snapshot: { collected: false, generation: null, verifiedAt: null },
        items: [],
      }),
    } as never,
    {
      findByMasterProductIds: vi.fn().mockResolvedValue(new Map()),
    } as never,
    media as never,
    makeDataStatusRepository() as never,
    contribution as never,
    recipeMutations as never,
  );
}

function inventoryAvailability(sellpiaInventorySkuId: string, availableStock: number) {
  return {
    sellpiaInventorySkuId,
    currentStock: availableStock,
    availableStock,
    isActive: true,
    generation: '12',
  };
}

function depletionProjection(needsReorder: boolean, months: number | null) {
  return {
    coverage: months === null ? 'no_direct_sales' as const : 'ready' as const,
    needsReorder,
    reorderSkuCount: needsReorder ? 1 : 0,
    minMonthsOfAvailableStockLeft: months,
  };
}

function rawProduct() {
  return {
    id: productId,
    code: 'MP-1',
    displayReference: { type: 'product_code' as const, label: '상품 코드', value: 'MP-1' },
    name: 'Product',
    description: null,
    category: null,
    brand: null,
    tags: [],
    imageUrls: [],
    abcGrade: null,
    abcEvaluation: null,
    adBudgetLimit: null,
    isActive: true,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    inventorySkuIds: [],
    channelListings: [],
  };
}

function rawListProduct(id: string) {
  const { createdAt: _createdAt, channelListings: _channelListings, ...product } =
    rawProduct();
  return {
    ...product,
    id,
    abcCreatedAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelCount: 0,
    channelStatus: 'unlisted' as const,
    activeChannelProducts: [],
    traffic: null,
    visitorCount: 11,
    viewCount: 22,
    cartAddCount: 3,
    orderCount: 4,
    salesQuantity: 5,
    salesAmount: 35_000,
    adSpend: 3_500,
    adSpendRate: 10,
    metricsFreshness: {
      orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      traffic: {
        capturedAt: new Date('2026-08-01T00:00:00.000Z'),
        basis: buildPeriodBasis({
          from: '2026-07-01',
          to: '2026-07-31',
          includedDates: enumerateDashboardDates('2026-07-01', '2026-07-31'),
          sources: ['wing_traffic'],
        }),
      },
      advertising: {
        ready: true,
        coverageStartDate: '2026-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    },
    inventorySkuIds: [skuId],
    inventoryOptions: [{
      id: channelListingOptionId,
      externalOptionId: 'OPTION-1',
      sellerSku: 'SELLER-1',
      itemName: 'Inventory option',
      isActive: true,
      inventoryComponents: [{
        id: '00000000-0000-4000-8000-000000000007',
        sellpiaInventorySkuId: skuId,
        code: 'SKU-1',
        name: 'Inventory',
        optionName: null,
        barcode: null,
        quantity: 1,
        source: 'manual' as const,
        confirmedBy: null,
        confirmedAt: new Date('2026-07-17T00:00:00.000Z'),
      }],
    }],
  };
}

function officialEvaluation() {
  return {
    abcGrade: 'B' as const,
    weightedRevenue: 1_000_000,
    weightedOrderTimeSupplyCost: 600_000,
    weightedAdvertisingSpend: 150_000,
    weightedOperatingProfit: 250_000,
    operatingProfitVelocity30: 100_000,
    operatingMargin: 0.25,
    lossPersistence: 0,
    profitScore: 20,
    marginScore: 90,
    consistencyScore: 100,
    economicScore: 57,
    validObservationDays: 180,
    formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
    formulaRevision: 2,
    publicationRevision: 4,
    gradeBasisCutoffDate: '2026-07-31',
    saleStartDate: '2026-06-01',
    sellpiaSourceImportRunId: '00000000-0000-4000-8000-000000000011',
    advertisingSourceImportRunId: '00000000-0000-4000-8000-000000000012',
    sellpiaGeneration: '4',
    advertisingGeneration: '5',
    mappingGeneration: '8',
    calculatedAt: '2026-08-01T01:00:00.000Z',
  };
}

function abcStatusFacts() {
  return {
    mappingReady: true,
    contributionBasis: { basisFromDate: '2026-02-01', basisCutoffDate: '2026-08-31' },
    displayDataAsOf: '2026-08-31',
    actualCutoff: '2026-08-31',
    traffic: sourceStatus('2026-09-03'),
    orders: sourceStatus('2026-09-03'),
    sellpia: sourceStatus('2026-08-31'),
    advertising: sourceStatus('2026-08-31'),
    formulaState: {
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      publishedAt: '2026-08-01T01:00:00.000Z',
      mappingGeneration: '8',
    },
    products: [{
      masterProductId: productId,
      abcGrade: 'B' as const,
      evaluation: officialEvaluation(),
      mappingValid: true,
      saleStartDate: '2026-07-01',
    }],
    sourceVector: {
      sellpia: {
        sourceImportRunId: '00000000-0000-4000-8000-000000000011',
        generation: '4',
        mappingGeneration: '8',
        coverageStartDate: '2026-01-15',
        coverageEndDate: '2026-08-31',
        capturedAt: '2026-09-01T00:00:00.000Z',
      },
      advertising: {
        sourceImportRunId: '00000000-0000-4000-8000-000000000012',
        generation: '5',
        mappingGeneration: '8',
        coverageStartDate: '2026-02-01',
        coverageEndDate: '2026-08-31',
        capturedAt: '2026-09-01T00:01:00.000Z',
      },
    },
  };
}

function sourceStatus(actualCutoff: string) {
  return {
    ready: true,
    requiredCutoff: actualCutoff,
    actualCutoff,
    latestAttempt: { state: 'COMPLETE' as const },
    latestComplete: { actualCutoff },
  };
}

function contributionAnalytics() {
  return {
    basis: {
      fromDate: '2026-02-01',
      cutoffDate: '2026-08-31',
      sourceCutoffDate: '2026-08-31',
      sellpiaSourceImportRunId: '00000000-0000-4000-8000-000000000011',
      advertisingSourceImportRunId: '00000000-0000-4000-8000-000000000012',
    },
    totals: {
      revenue: 1_000_000,
      positiveOperatingProfit: 250_000,
      lossMagnitude: 0,
      netOperatingProfit: 250_000,
    },
    metrics: {
      sales: {
        sourceComplete: true,
        includedProductCount: 1,
        excludedProductCount: 0,
        denominator: 1_000_000,
      },
      positiveOperatingProfit: {
        sourceComplete: true,
        includedProductCount: 1,
        excludedProductCount: 0,
        denominator: 250_000,
      },
      loss: {
        sourceComplete: true,
        includedProductCount: 1,
        excludedProductCount: 0,
        denominator: null,
      },
    },
    products: [{
      masterProductId: productId,
      revenue: 1_000_000,
      operatingProfit: 250_000,
      salesContribution: 1,
      positiveOperatingProfitContribution: 1,
      lossImpact: null,
      salesRank: 1,
      positiveOperatingProfitRank: 1,
      lossRank: null,
      cumulativeSalesContribution: 1,
      cumulativePositiveOperatingProfitContribution: 1,
      cumulativeLossImpact: null,
      metricCompleteness: { sales: true, operatingProfit: true },
    }],
  };
}

function contributionProduct(masterProductId: string, operatingProfit: number | null) {
  const complete = operatingProfit !== null;
  return {
    masterProductId,
    revenue: complete ? 1_000 : null,
    operatingProfit,
    salesContribution: complete ? 0.25 : null,
    positiveOperatingProfitContribution: operatingProfit !== null && operatingProfit > 0
      ? 1
      : null,
    lossImpact: operatingProfit !== null && operatingProfit < 0 ? 1 : null,
    salesRank: complete ? 1 : null,
    positiveOperatingProfitRank: operatingProfit !== null && operatingProfit > 0 ? 1 : null,
    lossRank: operatingProfit !== null && operatingProfit < 0 ? 1 : null,
    cumulativeSalesContribution: complete ? 0.25 : null,
    cumulativePositiveOperatingProfitContribution:
      operatingProfit !== null && operatingProfit > 0 ? 1 : null,
    cumulativeLossImpact: operatingProfit !== null && operatingProfit < 0 ? 1 : null,
    metricCompleteness: { sales: complete, operatingProfit: complete },
  };
}
