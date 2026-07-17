import type { ProductVariantDetail } from '@kiditem/shared/product-operations';

export interface ProductVariantRecipePort {
  replaceRecipe(
    organizationId: string,
    userId: string,
    productVariantId: string,
    input: unknown,
  ): Promise<ProductVariantDetail>;
}
