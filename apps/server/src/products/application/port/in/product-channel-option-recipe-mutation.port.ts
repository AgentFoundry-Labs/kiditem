export type ProductRecipeComponentInput = Readonly<{
  sellpiaInventorySkuId: string;
  quantity: number;
}>;

export type ProductChannelOptionRecipeMutation = Readonly<{
  channelListingOptionId: string;
  expectedMasterProductId?: string;
  components: readonly ProductRecipeComponentInput[];
}>;

export type ProductRecipeMutationResult = Readonly<{
  changedOptionCount: number;
  matchedListingCount: number;
  conflictingChannelListingOptionIds: string[];
  mappingChanged: boolean;
}>;

export const PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT = Symbol(
  'PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT',
);

export interface ProductChannelOptionRecipeMutationPort {
  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: readonly ProductRecipeComponentInput[];
  }): Promise<{ masterProductId: string | null }>;
  validateRecipeTargets(input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ProductRecipeComponentInput[];
  }): Promise<void>;
  applyPreservingRecipes(input: {
    organizationId: string;
    mutations: readonly ProductChannelOptionRecipeMutation[];
  }): Promise<ProductRecipeMutationResult>;
  applyPreservingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      mutations: readonly ProductChannelOptionRecipeMutation[];
    },
  ): Promise<ProductRecipeMutationResult>;
  clearListingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ): Promise<ProductRecipeMutationResult>;
  synchronizeListingSummaryInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ): Promise<{ masterProductId: string | null; mappingChanged: boolean }>;
}
