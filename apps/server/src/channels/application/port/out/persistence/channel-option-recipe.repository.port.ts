import type {
  ChannelOptionRecipeMutation,
  ChannelRecipeComponentInput,
  ChannelRecipeMutationResult,
} from '../../in/channel-option-recipe.port';

export const CHANNEL_OPTION_RECIPE_REPOSITORY_PORT = Symbol(
  'CHANNEL_OPTION_RECIPE_REPOSITORY_PORT',
);

export interface ChannelOptionRecipeRepositoryPort {
  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: readonly ChannelRecipeComponentInput[];
  }): Promise<{ masterProductId: string | null }>;
  validateRecipeTargets(input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ChannelRecipeComponentInput[];
  }): Promise<void>;
  applyPreservingRecipes(input: {
    organizationId: string;
    mutations: readonly ChannelOptionRecipeMutation[];
  }): Promise<ChannelRecipeMutationResult>;
  applyPreservingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      mutations: readonly ChannelOptionRecipeMutation[];
    },
  ): Promise<ChannelRecipeMutationResult>;
  clearListingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ): Promise<ChannelRecipeMutationResult>;
}
