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
  it('creates one default variant when variants are omitted', async () => {
    const repository = makeRepository();
    const service = new ProductOperationsService(repository);

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
    const service = new ProductOperationsService(repository);

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
    const service = new ProductOperationsService(repository);

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
    const service = new ProductOperationsService(repository);

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
  });
});

function makeRepository() {
  return {
    listProducts: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      summary: {
        abcGradeCounts: { A: 0, B: 0, C: 0 },
        channelConnectionCounts: { connected: 0, unconnected: 0 },
        inventoryStatusCounts: {
          sellable: 0,
          partial_out_of_stock: 0,
          out_of_stock: 0,
          configuration_required: 0,
          review_required: 0,
        },
        negativeProfitCount: 0,
      },
    }),
    getProduct: vi.fn().mockResolvedValue({ id: productId }),
    createProduct: vi.fn().mockResolvedValue({ id: productId }),
    updateProduct: vi.fn().mockResolvedValue({ id: productId }),
    createVariant: vi.fn().mockResolvedValue({ id: variantId }),
    updateVariant: vi.fn().mockResolvedValue({ id: variantId }),
    replaceRecipe: vi.fn().mockResolvedValue({ id: variantId }),
  } as unknown as {
    [K in keyof ProductOperationsRepositoryPort]: ReturnType<typeof vi.fn>;
  };
}
