import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { ChannelRecipeFactQueries } from '../../in/channel-option-recipe.port';
import type {
  ChannelOptionRecipeMutation,
  ChannelRecipeComponentInput,
  ChannelRecipeMutationResult,
} from '../../in/channel-option-recipe.port';

export const CHANNEL_OPTION_RECIPE_REPOSITORY_PORT = Symbol(
  'CHANNEL_OPTION_RECIPE_REPOSITORY_PORT',
);

export interface ChannelOptionRecipeRepositoryPort extends ChannelRecipeFactQueries {
  /** Called only by the execution owner after a confirmed external composition transition. */
  replaceConfirmedCompositionInTransaction(transaction: OwnerTransaction, input: {
    organizationId: string; channelListingOptionId: string; salesProductOptionId: string;
    kidItemCode: string; components: readonly ChannelRecipeComponentInput[];
  }): Promise<void>;
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
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      mutations: readonly ChannelOptionRecipeMutation[];
    },
  ): Promise<ChannelRecipeMutationResult>;
  clearListingRecipesInTransaction(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ): Promise<ChannelRecipeMutationResult>;
}
