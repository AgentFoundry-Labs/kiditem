import { Injectable } from '@nestjs/common';
import type { ProductVariantRecipePort } from '../port/in/product-variant-recipe.port';
import { ProductOperationsService } from './product-operations.service';

@Injectable()
export class ProductVariantRecipeService implements ProductVariantRecipePort {
  constructor(private readonly products: ProductOperationsService) {}

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
