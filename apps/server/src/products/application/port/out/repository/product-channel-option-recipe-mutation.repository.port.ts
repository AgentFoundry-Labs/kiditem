import type {
  ProductChannelOptionRecipeMutation,
  ProductRecipeComponentInput,
  ProductRecipeMutationResult,
} from '../../in/product-channel-option-recipe-mutation.port';

export const PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_REPOSITORY_PORT = Symbol(
  'PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_REPOSITORY_PORT',
);

export interface ProductChannelOptionRecipeMutationRepositoryPort {
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
