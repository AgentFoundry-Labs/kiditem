import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  DeterministicVariantRecipeInput,
  ProductVariantRecipeAutomationPort,
} from '../port/in/product-variant-recipe-automation.port';
import {
  PRODUCT_OPERATIONS_REPOSITORY_PORT,
  type ProductOperationsRepositoryPort,
} from '../port/out/repository/product-operations.repository.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProductVariantRecipeAutomationService
implements ProductVariantRecipeAutomationPort {
  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsRepositoryPort,
  ) {}

  async applyIfEmpty(input: {
    organizationId: string;
    recipes: DeterministicVariantRecipeInput[];
  }) {
    validateInput(input);
    if (input.recipes.length === 0) {
      return {
        appliedProductVariantIds: [],
        skippedExistingProductVariantIds: [],
      };
    }
    return this.repository.applyDeterministicRecipesIfEmpty(input);
  }
}

function validateInput(input: {
  organizationId: string;
  recipes: DeterministicVariantRecipeInput[];
}) {
  if (!UUID.test(input.organizationId)) {
    throw new BadRequestException('organizationId must be a UUID');
  }
  const variantIds = new Set<string>();
  for (const recipe of input.recipes) {
    if (!UUID.test(recipe.productVariantId) || !UUID.test(recipe.sellpiaInventorySkuId)) {
      throw new BadRequestException('Recipe variant and Sellpia SKU IDs must be UUIDs');
    }
    if (recipe.quantity !== 1) {
      throw new BadRequestException('Deterministic recipes require exactly one component quantity');
    }
    if (variantIds.has(recipe.productVariantId)) {
      throw new BadRequestException('Each ProductVariant can have only one deterministic recipe');
    }
    variantIds.add(recipe.productVariantId);
  }
}
