export type ChannelRecipeComponentInput = Readonly<{
  masterProductId: string;
  quantity: number;
}>;

export type ChannelOptionRecipeMutation = Readonly<{
  channelListingOptionId: string;
  expectedMasterProductId?: string;
  /** Code already assigned by a frozen Channels registration execution. */
  preparedKidItemCode?: string;
  components: readonly ChannelRecipeComponentInput[];
}>;

export type ChannelRecipeMutationResult = Readonly<{
  changedOptionCount: number;
  matchedListingCount: number;
  conflictingChannelListingOptionIds: string[];
  mappingChanged: boolean;
}>;

export const CHANNEL_OPTION_RECIPE_PORT = Symbol(
  'CHANNEL_OPTION_RECIPE_PORT',
);

export interface ChannelOptionRecipePort {
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
