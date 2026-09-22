import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ChannelRecipeFactQueries } from '../../port/in/channel-option-recipe.port';
import { ListingException } from '../../exception/listing.exception';
import {
  type ChannelOptionRecipeMutation,
  type ChannelOptionRecipePort,
  type ChannelRecipeComponentInput,
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

  replaceConfirmedCompositionInTransaction(transaction: OwnerTransaction, input: {
    organizationId: string; channelListingOptionId: string; salesProductOptionId: string;
    kidItemCode: string; components: readonly ChannelRecipeComponentInput[];
  }) {
    validateComponents(input.components);
    if (!/^KID[0-9]{8}$/.test(input.kidItemCode)) throw new ListingException('invalid', 'Invalid KID item code');
    return this.repository.replaceConfirmedCompositionInTransaction(transaction, input);
  }

  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: readonly ChannelRecipeComponentInput[];
  }) {
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
      throw new ListingException('invalid', 'Each channel listing option may appear only once');
    }
    optionIds.add(mutation.channelListingOptionId);
    if (mutation.preparedKidItemCode !== undefined && !/^KID[0-9]{8}$/.test(mutation.preparedKidItemCode)) {
      throw new ListingException('invalid', 'Invalid prepared KID item code');
    }
    validateComponents(mutation.components);
  }
}

function validateComponents(components: readonly ChannelRecipeComponentInput[]): void {
  const masterProductIds = new Set<string>();
  for (const component of components) {
    if (!Number.isSafeInteger(component.quantity) || component.quantity <= 0) {
      throw new ListingException('invalid', 'Every inventory component quantity must be a positive integer');
    }
    if (masterProductIds.has(component.masterProductId)) {
      throw new ListingException('invalid', 'Inventory component MasterProduct IDs must be distinct');
    }
    masterProductIds.add(component.masterProductId);
  }
}
