import type { OwnerTransaction } from '../../../../common/owner-transaction';
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

/** One frozen channel option moving to its confirmed SalesProductOption and KID. */
export type ConfirmedCompositionTransition = Readonly<{
  channelListingOptionId: string;
  salesProductOptionId: string;
  kidItemCode: string;
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

export interface ChannelRecipeFactQueries {
  readListingProductSummaries(transaction: OwnerTransaction, input: { organizationId: string; listingIds: readonly string[] }): Promise<Map<string, string | null>>;
  readConfirmedCompositions(transaction: OwnerTransaction, input: { organizationId: string; accountIds?: readonly string[]; optionIds?: readonly string[]; listingIds?: readonly string[]; activeOnly?: boolean }): Promise<Array<{ optionId: string; listingId: string; accountId: string; components: Array<{ masterProductId: string; quantity: number }> }>>;
  findListingsBySourceProducts(transaction: OwnerTransaction, input: { organizationId: string; masterProductIds: readonly string[]; activeOnly: boolean }): Promise<Array<{ listingId: string; masterProductId: string | null }>>;
}

/**
 * The only writer of channel option recipes, their SalesProductOption link and KID.
 *
 * Failure semantics — a failure changes no state, so no hold marker is stored:
 * - Manual replace rolls back on any failure; an `expectedComponents` mismatch is 409.
 * - Automatic matching skips a conflicting option and reports it in
 *   `conflictingChannelListingOptionIds`; confirmed recipes are never rewritten.
 * - A registration confirmation that conflicts fails its execution transaction with 409.
 * - An uncertain provider outcome leaves recipes untouched; readers hold those options
 *   through `compositionUnconfirmed` until the execution resolves.
 * Use `applyPreservingRecipes` without a caller transaction and the `…InTransaction`
 * methods inside an owner transaction.
 */
export interface ChannelOptionRecipePort extends ChannelRecipeFactQueries {
  /**
   * Called only by the execution owner after a confirmed external composition change.
   * Every transition applies or none does; the mapping generation advances at most once.
   */
  replaceConfirmedCompositionsInTransaction(transaction: OwnerTransaction, input: {
    organizationId: string; transitions: readonly ConfirmedCompositionTransition[];
  }): Promise<void>;
  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    /** The recipe the caller loaded; a different current recipe is a conflict. */
    expectedComponents: readonly ChannelRecipeComponentInput[];
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
