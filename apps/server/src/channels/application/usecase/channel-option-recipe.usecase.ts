import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  type ChannelOptionRecipeMutation,
  type ChannelOptionRecipePort,
  type ChannelRecipeComponentInput,
} from '../port/in/channel-option-recipe.port';
import {
  CHANNEL_OPTION_RECIPE_REPOSITORY_PORT,
  type ChannelOptionRecipeRepositoryPort,
} from '../port/out/persistence/channel-option-recipe.repository.port';

@Injectable()
export class ChannelOptionRecipeUseCase
implements ChannelOptionRecipePort {
  constructor(
    @Inject(CHANNEL_OPTION_RECIPE_REPOSITORY_PORT)
    private readonly repository: ChannelOptionRecipeRepositoryPort,
  ) {}

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
    transaction: object,
    input: {
      organizationId: string;
      mutations: readonly ChannelOptionRecipeMutation[];
    },
  ) {
    validateMutations(input.mutations);
    return this.repository.applyPreservingRecipesInTransaction(transaction, input);
  }

  clearListingRecipesInTransaction(
    transaction: object,
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
      throw new BadRequestException('Each channel listing option may appear only once');
    }
    optionIds.add(mutation.channelListingOptionId);
    if (mutation.preparedKidItemCode !== undefined && !/^KID[0-9]{8}$/.test(mutation.preparedKidItemCode)) {
      throw new BadRequestException('Invalid prepared KID item code');
    }
    validateComponents(mutation.components);
  }
}

function validateComponents(components: readonly ChannelRecipeComponentInput[]): void {
  const masterProductIds = new Set<string>();
  for (const component of components) {
    if (!Number.isSafeInteger(component.quantity) || component.quantity <= 0) {
      throw new BadRequestException('Every inventory component quantity must be a positive integer');
    }
    if (masterProductIds.has(component.masterProductId)) {
      throw new BadRequestException('Inventory component MasterProduct IDs must be distinct');
    }
    masterProductIds.add(component.masterProductId);
  }
}
