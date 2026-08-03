import { BadRequestException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsService } from './product-operations.service';
import type { ProductOperationsRepositoryPort } from '../port/out/repository/product-operations.repository.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const productId = '00000000-0000-4000-8000-000000000003';
const channelListingOptionId = '00000000-0000-4000-8000-000000000004';
const skuId = '00000000-0000-4000-8000-000000000005';

describe('ProductOperationsService', () => {
  it('hydrates availability once and keeps depletion summary counts independent of pagination', async () => {
    const repository = makeRepository();
    const first = rawListProduct(productId);
    const secondId = '00000000-0000-4000-8000-000000000006';
    const second = rawListProduct(secondId);
    repository.listProducts.mockResolvedValue({
      items: [first, second],
      page: 1,
      limit: 1,
    });
    const inventory = {
      findBySkuIds: vi.fn().mockResolvedValue({
        snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{
          sellpiaInventorySkuId: skuId,
          currentStock: 100,
          activeCommitmentQuantity: 80,
          availableStock: 20,
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
      inventoryUnits: 20,
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
      sharedDepletionProductCount: 1,
    });
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
    const service = makeService(repository);

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
    expect(repository.replaceChannelOptionInventory).not.toHaveBeenCalled();
  });

  it('passes every detail and mutation through an organization fence', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

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
    expect(repository.replaceChannelOptionInventory).toHaveBeenCalledWith({
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
    replaceChannelOptionInventory: vi.fn().mockResolvedValue(product),
  } as unknown as {
    [K in keyof ProductOperationsRepositoryPort]: ReturnType<typeof vi.fn>;
  };
}

function makeCatalogDisplayMedia() {
  return { findDisplayMedia: vi.fn().mockResolvedValue(new Map()) };
}

function makeDataStatusRepository() {
  return {
    read: vi.fn().mockResolvedValue({ displayDataAsOf: '2026-07-31' }),
  };
}

function makeService(
  repository: ReturnType<typeof makeRepository>,
  media = makeCatalogDisplayMedia(),
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
  );
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
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelListings: [],
  };
}

function rawListProduct(id: string) {
  const { createdAt: _createdAt, channelListings: _channelListings, ...product } =
    rawProduct();
  return {
    ...product,
    id,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelCount: 0,
    channelStatus: 'unlisted' as const,
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
      traffic: {
        status: 'READY' as const,
        coverageStartDate: '2026-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      advertising: {
        status: 'READY' as const,
        coverageStartDate: '2026-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    },
    profit: null,
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
