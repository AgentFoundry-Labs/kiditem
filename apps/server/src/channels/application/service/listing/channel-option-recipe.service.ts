import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ChannelRecipeFactQueries } from '../../port/in/channel-option-recipe.port';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  type ChannelOptionRecipeMutation,
  type ChannelOptionRecipePort,
  type ChannelRecipeComponentInput,
  type ConfirmedCompositionTransition,
} from '../../port/in/channel-option-recipe.port';
import {
  type ChannelOptionRecipeRepositoryPort,
} from '../../port/out/persistence/channel-option-recipe.repository.port';

export class ChannelOptionRecipeService
implements ChannelOptionRecipePort {
  constructor(
    private readonly repository: ChannelOptionRecipeRepositoryPort,
  ) {}

  readListingProductSummaries(transaction: OwnerTransaction, input: Parameters<ChannelRecipeFactQueries['readListingProductSummaries']>[1]) {
    return this.repository.readListingProductSummaries(transaction, input);
  }

  readConfirmedCompositions(transaction: OwnerTransaction, input: Parameters<ChannelRecipeFactQueries['readConfirmedCompositions']>[1]) {
    return this.repository.readConfirmedCompositions(transaction, input);
  }

  findListingsBySourceProducts(transaction: OwnerTransaction, input: Parameters<ChannelRecipeFactQueries['findListingsBySourceProducts']>[1]) {
    return this.repository.findListingsBySourceProducts(transaction, input);
  }

  replaceConfirmedCompositionsInTransaction(transaction: OwnerTransaction, input: {
    organizationId: string; transitions: readonly ConfirmedCompositionTransition[];
  }) {
    const optionIds = new Set<string>();
    for (const transition of input.transitions) {
      if (optionIds.has(transition.channelListingOptionId)) {
        throw new KiditemInvalidValueError('CHANNELS_OPTION_RECIPE_INVALID', { details: { reason: 'DUPLICATE_OPTION' } });
      }
      optionIds.add(transition.channelListingOptionId);
      validateComponents(transition.components);
      if (!/^KID[0-9]{8}$/.test(transition.kidItemCode)) throw new KiditemInvalidValueError('CHANNELS_OPTION_RECIPE_INVALID', { details: { reason: 'KID_CODE_INVALID' } });
    }
    return this.repository.replaceConfirmedCompositionsInTransaction(transaction, input);
  }

  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    /** The recipe the caller loaded; a different current recipe is a conflict. */
    expectedComponents: readonly ChannelRecipeComponentInput[];
    components: readonly ChannelRecipeComponentInput[];
  }) {
    validateComponents(input.expectedComponents);
    validateComponents(input.components);
    return this.repository.replaceRecipe(input);
  }

  validateRecipeTargets(input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ChannelRecipeComponentInput[];
  }) {
    validateComponents(input.components);
    return this.repository.validateRecipeTargets(input);
  }

  applyPreservingRecipes(input: {
    organizationId: string;
    mutations: readonly ChannelOptionRecipeMutation[];
  }) {
    validateMutations(input.mutations);
    return this.repository.applyPreservingRecipes(input);
  }

  applyPreservingRecipesInTransaction(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      mutations: readonly ChannelOptionRecipeMutation[];
    },
  ) {
    validateMutations(input.mutations);
    return this.repository.applyPreservingRecipesInTransaction(transaction, input);
  }

  clearListingRecipesInTransaction(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ) {
    return this.repository.clearListingRecipesInTransaction(transaction, input);
  }

}

function validateMutations(mutations: readonly ChannelOptionRecipeMutation[]): void {
  const optionIds = new Set<string>();
  for (const mutation of mutations) {
    if (optionIds.has(mutation.channelListingOptionId)) {
      throw new KiditemInvalidValueError('CHANNELS_OPTION_RECIPE_INVALID', { details: { reason: 'DUPLICATE_OPTION' } });
    }
    optionIds.add(mutation.channelListingOptionId);
    if (mutation.preparedKidItemCode !== undefined && !/^KID[0-9]{8}$/.test(mutation.preparedKidItemCode)) {
      throw new KiditemInvalidValueError('CHANNELS_OPTION_RECIPE_INVALID', { details: { reason: 'PREPARED_KID_CODE_INVALID' } });
    }
    validateComponents(mutation.components);
  }
}

function validateComponents(components: readonly ChannelRecipeComponentInput[]): void {
  const masterProductIds = new Set<string>();
  for (const component of components) {
    if (!Number.isSafeInteger(component.quantity) || component.quantity <= 0) {
      throw new KiditemInvalidValueError('CHANNELS_OPTION_RECIPE_INVALID', { details: { reason: 'COMPONENT_QUANTITY_INVALID' } });
    }
    if (masterProductIds.has(component.masterProductId)) {
      throw new KiditemInvalidValueError('CHANNELS_OPTION_RECIPE_INVALID', { details: { reason: 'COMPONENT_DUPLICATE' } });
    }
    masterProductIds.add(component.masterProductId);
  }
}
