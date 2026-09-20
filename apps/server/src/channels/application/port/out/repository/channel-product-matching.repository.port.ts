import type {
  ChannelProductMatchingCounts,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import type { ChannelProductCandidate } from '../../../../domain/channel-product-candidate-ranking';

export type ChannelProductMatchingQuery = Readonly<{
  channelAccountId?: string;
  search?: string;
}>;

export type ChannelProductCandidateContext = Readonly<{
  listingId: string;
  externalId: string;
  masterProductId: string | null;
  displayName: string | null;
  explicitCode: string | null;
  barcode: string | null;
  aiSuggestion: {
    masterProductId: string;
    explanation: string;
    score: number | null;
  } | null;
  candidates: readonly ChannelProductCandidate[];
}>;

export type ChannelAvailabilityRepositoryRow = Readonly<{
  channelAccount: { id: string; channel: string; name: string };
  listing: {
    id: string;
    externalId: string;
    channelName: string | null;
    displayName: string | null;
    status: string | null;
    masterProductId: string | null;
  };
  option: {
    id: string;
    externalOptionId: string;
    sellerSku: string | null;
    itemName: string | null;
    barcode: string | null;
    modelNumber: string | null;
    salePrice: number | null;
    status: string | null;
    updatedAt: Date;
  };
  inventoryComponents: ReadonlyArray<{
    sellpiaInventorySkuId: string;
    code: string | null;
    name: string | null;
    optionName: string | null;
    barcode: string | null;
    purchasePrice: number | null;
    quantity: number;
  }>;
}>;

export type ChannelOptionMatchingRepositoryRow = Readonly<{
  channelAccount: { id: string; channel: string; name: string };
  listing: {
    id: string;
    externalId: string;
    masterProductId: string | null;
  };
  option: {
    id: string;
    externalOptionId: string;
    itemName: string | null;
    sellerSku: string | null;
    barcode: string | null;
    updatedAt: Date;
    inventoryComponents: ReadonlyArray<{
      id: string;
      sellpiaInventorySkuId: string;
      code: string | null;
      name: string | null;
      optionName: string | null;
      barcode: string | null;
      quantity: number;
    }>;
  };
}>;

export type ChannelProductMatchingRepositoryQueue = Readonly<{
  products: ChannelProductMatchingQueueRow[];
  options: ChannelOptionMatchingRepositoryRow[];
  counts: ChannelProductMatchingCounts;
}>;

export const CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT = Symbol(
  'CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT',
);

export interface ChannelProductMatchingRepositoryPort {
  listQueue(
    organizationId: string,
    query: ChannelProductMatchingQuery,
  ): Promise<ChannelProductMatchingRepositoryQueue>;
  getProductCandidateContext(
    organizationId: string,
    channelListingId: string,
    search?: string,
  ): Promise<ChannelProductCandidateContext | null>;
  linkProduct(input: {
    organizationId: string;
    channelListingId: string;
    masterProductId: string | null;
  }): Promise<void>;
  autoMatch(input: {
    organizationId: string;
    channelAccountId?: string;
  }): Promise<{
    evaluatedListings: number;
    matchedListings: number;
    configuredOptions: number;
  }>;
  listAvailabilityRows(
    organizationId: string,
    query: {
      channelAccountId?: string;
      search?: string;
      optionIds?: string[];
      listingIds?: string[];
    },
  ): Promise<ChannelAvailabilityRepositoryRow[]>;
}

export type {
  ChannelProductMatchingQueueRow,
};
