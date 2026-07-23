import type {
  CreateProductVariantRecipesIfEmptyResponse,
  PlanProductVariantRecipesIfEmptyResponse,
  ProductVariantDetail,
} from '@kiditem/shared/product-operations';

export interface ProductVariantRecipePort {
  planCreateIfEmpty(
    organizationId: string,
    input: unknown,
  ): Promise<PlanProductVariantRecipesIfEmptyResponse>;
  createIfEmpty(
    organizationId: string,
    userId: string,
    input: unknown,
  ): Promise<CreateProductVariantRecipesIfEmptyResponse>;
  replaceRecipe(
    organizationId: string,
    userId: string,
    productVariantId: string,
    input: unknown,
  ): Promise<ProductVariantDetail>;
}
