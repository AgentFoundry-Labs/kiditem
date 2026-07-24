import { Injectable } from '@nestjs/common';
import { ProductOperationsService } from './product-operations.service';
import type { ProductVariantRecipePort } from '../port/in/product-variant-recipe.port';

@Injectable()
export class ProductVariantRecipeService implements ProductVariantRecipePort {
  constructor(private readonly products: ProductOperationsService) {}

  planCreateIfEmpty(organizationId: string, input: unknown) {
    return this.products.planRecipesIfEmpty(organizationId, input);
  }

  createIfEmpty(organizationId: string, userId: string, input: unknown) {
    return this.products.createRecipesIfEmpty(organizationId, userId, input);
  }

  replaceRecipe(
    organizationId: string,
    userId: string,
    productVariantId: string,
    input: unknown,
  ) {
    return this.products.replaceRecipe(
      organizationId,
      userId,
      productVariantId,
      input,
    );
  }
}
