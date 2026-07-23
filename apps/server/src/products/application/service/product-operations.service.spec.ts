import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductOperationsRepositoryPort } from '../port/out/repository/product-operations.repository.port';
import { ProductOperationsService } from './product-operations.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const productId = '00000000-0000-4000-8000-000000000003';
const variantId = '00000000-0000-4000-8000-000000000004';
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
      repository,
      inventory as never,
      depletion as never,
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
    });
    expect(result.summary).toMatchObject({
      reorderProductCount: 1,
      depletionCoveredProductCount: 2,
      sharedDepletionProductCount: 1,
    });
  });

  it('creates one default variant when variants are omitted', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

    await service.createProduct(organizationId, userId, {
      code: ' KI-001 ',
      name: ' Product ',
    });

    expect(repository.createProduct).toHaveBeenCalledWith({
      organizationId,
      userId,
      product: expect.objectContaining({
        code: 'KI-001',
        name: 'Product',
        variants: [expect.objectContaining({
          code: 'KI-001-DEFAULT',
          name: 'Product',
          isDefault: true,
          isActive: true,
          components: [],
        })],
      }),
    });
  });

  it('atomically forwards supplied variants and their recipes', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

    await service.createProduct(organizationId, userId, {
      code: 'KI-002',
      name: 'Bundle',
      variants: [{
        code: 'KI-002-2PK',
        name: '2 pack',
        components: [{ sellpiaInventorySkuId: skuId, quantity: 2 }],
      }],
    });

    expect(repository.createProduct).toHaveBeenCalledWith({
      organizationId,
      userId,
      product: expect.objectContaining({
        variants: [expect.objectContaining({
          code: 'KI-002-2PK',
          components: [{ sellpiaInventorySkuId: skuId, quantity: 2 }],
        })],
      }),
    });
  });

  it('rejects duplicate and non-positive recipe components before persistence', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

    await expect(service.replaceRecipe(
      organizationId,
      userId,
      variantId,
      {
        components: [
          { sellpiaInventorySkuId: skuId, quantity: 1 },
          { sellpiaInventorySkuId: skuId, quantity: 2 },
        ],
        expectedRecipe: [],
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replaceRecipe(
      organizationId,
      userId,
      variantId,
      { components: [{ sellpiaInventorySkuId: skuId, quantity: 0 }], expectedRecipe: [] },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceRecipe).not.toHaveBeenCalled();
  });

  it('passes every detail and mutation through an organization fence', async () => {
    const repository = makeRepository();
    const service = makeService(repository);

    await service.getProduct(organizationId, productId);
    await service.updateProduct(organizationId, productId, { name: 'Renamed' });
    await service.createVariant(organizationId, userId, productId, {
      code: 'KI-001-L',
      name: 'Large',
    });
    await service.updateVariant(organizationId, variantId, { name: 'Large+' });
    await service.replaceRecipe(organizationId, userId, variantId, {
      components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
      expectedRecipe: [],
    });
    await service.createRecipesIfEmpty(organizationId, userId, {
      recipes: [{
        productVariantId: variantId,
        components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
      }],
    });
    await service.planRecipesIfEmpty(organizationId, {
      recipes: [{
        productVariantId: variantId,
        components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
      }],
    });

    expect(repository.getProduct).toHaveBeenCalledWith(organizationId, productId);
    expect(repository.updateProduct).toHaveBeenCalledWith(
      organizationId,
      productId,
      { name: 'Renamed' },
    );
    expect(repository.createVariant).toHaveBeenCalledWith({
      organizationId,
      userId,
      masterProductId: productId,
      variant: expect.objectContaining({ code: 'KI-001-L' }),
    });
    expect(repository.updateVariant).toHaveBeenCalledWith(
      organizationId,
      variantId,
      { name: 'Large+' },
    );
    expect(repository.replaceRecipe).toHaveBeenCalledWith({
      organizationId,
      userId,
      productVariantId: variantId,
      components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
      expectedRecipe: [],
    });
    expect(repository.createManualRecipesIfEmpty).toHaveBeenCalledWith({
      organizationId,
      userId,
      recipes: [{
        productVariantId: variantId,
        components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
      }],
    });
    expect(repository.planManualRecipesIfEmpty).toHaveBeenCalledWith({
      organizationId,
      recipes: [{
        productVariantId: variantId,
        components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
      }],
    });
  });
});

function makeRepository() {
  const product = rawProduct();
  const variant = product.variants[0]!;
  return {
    listProducts: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      limit: 50,
    }),
    getProduct: vi.fn().mockResolvedValue(product),
    createProduct: vi.fn().mockResolvedValue(product),
    updateProduct: vi.fn().mockResolvedValue(product),
    createVariant: vi.fn().mockResolvedValue(variant),
    updateVariant: vi.fn().mockResolvedValue(variant),
    replaceRecipe: vi.fn().mockResolvedValue(variant),
    createManualRecipesIfEmpty: vi.fn().mockResolvedValue({
      appliedProductVariantIds: [],
      unchangedProductVariantIds: [variant.id],
    }),
    planManualRecipesIfEmpty: vi.fn().mockResolvedValue({
      pendingProductVariantIds: [],
      unchangedProductVariantIds: [variant.id],
    }),
  } as unknown as {
    [K in keyof ProductOperationsRepositoryPort]: ReturnType<typeof vi.fn>;
  };
}

function makeService(repository: ReturnType<typeof makeRepository>) {
  return new ProductOperationsService(
    repository,
    {
      findBySkuIds: vi.fn().mockResolvedValue({
        snapshot: { collected: false, generation: null, verifiedAt: null },
        items: [],
      }),
    } as never,
    {
      findByMasterProductIds: vi.fn().mockResolvedValue(new Map()),
    } as never,
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
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelListings: [],
    variants: [{
      id: variantId,
      code: 'PV-1',
      displayReference: { type: 'product_variant_code' as const, label: '옵션 코드', value: 'PV-1' },
      name: 'Variant',
      optionLabel: null,
      isDefault: true,
      isActive: true,
      components: [],
    }],
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
    orderCount: null,
    salesAmount: null,
    adSpend: null,
    profit: null,
    variants: product.variants.map((variant) => ({
      ...variant,
      components: [{
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
    })),
  };
}
