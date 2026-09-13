import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  type ProductChannelOptionRecipeMutation,
  type ProductChannelOptionRecipeMutationPort,
  type ProductRecipeComponentInput,
} from '../port/in/product-channel-option-recipe-mutation.port';
import {
  PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_REPOSITORY_PORT,
  type ProductChannelOptionRecipeMutationRepositoryPort,
} from '../port/out/repository/product-channel-option-recipe-mutation.repository.port';

@Injectable()
export class ProductChannelOptionRecipeMutationService
implements ProductChannelOptionRecipeMutationPort {
  constructor(
    @Inject(PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_REPOSITORY_PORT)
    private readonly repository: ProductChannelOptionRecipeMutationRepositoryPort,
  ) {}

  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: readonly ProductRecipeComponentInput[];
  }) {
    validateComponents(input.components);
    return this.repository.replaceRecipe(input);
  }

  validateRecipeTargets(input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ProductRecipeComponentInput[];
  }) {
    validateComponents(input.components);
    return this.repository.validateRecipeTargets(input);
  }

  applyPreservingRecipes(input: {
    organizationId: string;
    mutations: readonly ProductChannelOptionRecipeMutation[];
  }) {
    validateMutations(input.mutations);
    return this.repository.applyPreservingRecipes(input);
  }

  applyPreservingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      mutations: readonly ProductChannelOptionRecipeMutation[];
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

  synchronizeListingSummaryInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ) {
    return this.repository.synchronizeListingSummaryInTransaction(transaction, input);
  }
}

function validateMutations(mutations: readonly ProductChannelOptionRecipeMutation[]): void {
  const optionIds = new Set<string>();
  for (const mutation of mutations) {
    if (optionIds.has(mutation.channelListingOptionId)) {
      throw new BadRequestException('Each channel listing option may appear only once');
    }
    optionIds.add(mutation.channelListingOptionId);
    validateComponents(mutation.components);
  }
}

function validateComponents(components: readonly ProductRecipeComponentInput[]): void {
  const skuIds = new Set<string>();
  for (const component of components) {
    if (!Number.isSafeInteger(component.quantity) || component.quantity <= 0) {
      throw new BadRequestException('Every inventory component quantity must be a positive integer');
    }
    if (skuIds.has(component.sellpiaInventorySkuId)) {
      throw new BadRequestException('Inventory component SKU IDs must be distinct');
    }
    skuIds.add(component.sellpiaInventorySkuId);
  }
}
