export const CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT = Symbol(
  'CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT',
);

export type ChannelRecipeSuggestionContext = {
  channelListingOptionId: string;
  productVariantId: string | null;
  masterProductId: string | null;
  options: Array<{
    channelListingOptionId: string;
    listingName: string | null;
    itemName: string | null;
    sellerSku: string | null;
    modelNumber: string | null;
    barcode: string | null;
  }>;
  existingComponents: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    quantity: number;
    source: 'manual' | 'deterministic';
    confirmedBy: string | null;
    confirmedAt: Date | string;
  }>;
};

export interface ChannelRecipeSuggestionContextRepositoryPort {
  getContext(
    organizationId: string,
    channelListingOptionId: string,
  ): Promise<ChannelRecipeSuggestionContext | null>;
}
