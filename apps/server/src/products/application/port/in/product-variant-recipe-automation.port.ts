export const PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT = Symbol(
  'PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT',
);

export type DeterministicVariantRecipeInput = {
  productVariantId: string;
  sellpiaInventorySkuId: string;
  quantity: 1;
};

export type DeterministicVariantRecipeApplyResult = {
  appliedProductVariantIds: string[];
  skippedExistingProductVariantIds: string[];
};

export interface ProductVariantRecipeAutomationPort {
  applyIfEmpty(input: {
    organizationId: string;
    recipes: DeterministicVariantRecipeInput[];
  }): Promise<DeterministicVariantRecipeApplyResult>;
}
