import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductOperationsRepositoryPort } from '../port/out/repository/product-operations.repository.port';
import { ProductVariantRecipeAutomationService } from './product-variant-recipe-automation.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const variantId = '00000000-0000-4000-8000-000000000002';
const skuId = '00000000-0000-4000-8000-000000000003';

describe('ProductVariantRecipeAutomationService', () => {
  it('delegates one-component quantity-one deterministic recipes', async () => {
    const repository = makeRepository();
    repository.applyDeterministicRecipesIfEmpty.mockResolvedValue({
      appliedProductVariantIds: [variantId],
      skippedExistingProductVariantIds: [],
    });
    const service = new ProductVariantRecipeAutomationService(repository);

    await expect(service.applyIfEmpty({
      organizationId,
      recipes: [{ productVariantId: variantId, sellpiaInventorySkuId: skuId, quantity: 1 }],
    })).resolves.toEqual({
      appliedProductVariantIds: [variantId],
      skippedExistingProductVariantIds: [],
    });
    expect(repository.applyDeterministicRecipesIfEmpty).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'duplicate variant entries',
      recipes: [
        { productVariantId: variantId, sellpiaInventorySkuId: skuId, quantity: 1 },
        { productVariantId: variantId, sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000004', quantity: 1 },
      ],
    },
    {
      name: 'a non-quantity-one recipe',
      recipes: [{ productVariantId: variantId, sellpiaInventorySkuId: skuId, quantity: 2 }],
    },
    {
      name: 'an invalid identifier',
      recipes: [{ productVariantId: 'not-a-uuid', sellpiaInventorySkuId: skuId, quantity: 1 }],
    },
  ])('rejects $name before repository access', async ({ recipes }) => {
    const repository = makeRepository();
    const service = new ProductVariantRecipeAutomationService(repository);

    await expect(service.applyIfEmpty({
      organizationId,
      recipes: recipes as never,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.applyDeterministicRecipesIfEmpty).not.toHaveBeenCalled();
  });
});

function makeRepository() {
  return {
    applyDeterministicRecipesIfEmpty: vi
      .fn<ProductOperationsRepositoryPort['applyDeterministicRecipesIfEmpty']>(),
  } as unknown as ProductOperationsRepositoryPort;
}
