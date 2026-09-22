import type { ProductRecipeComponentCandidateListResponse } from '@kiditem/shared/product-operations';

export const CHANNEL_OPTION_RECIPE_CANDIDATE_PORT = Symbol(
  'CHANNEL_OPTION_RECIPE_CANDIDATE_PORT',
);

export interface ChannelOptionRecipeCandidatePort {
  search(
    organizationId: string,
    rawQuery: unknown,
  ): Promise<ProductRecipeComponentCandidateListResponse>;
}
