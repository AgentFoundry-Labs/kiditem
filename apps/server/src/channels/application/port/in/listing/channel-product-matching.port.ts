import type {
  ChannelProductMatchingQueueResponse,
  ChannelProductCandidateListResponse,
} from '@kiditem/shared/channel-product-matching';
import type { ChannelProductMatchingQuery } from '../../out/repository/channel-product-matching.repository.port';

export const CHANNEL_PRODUCT_MATCHING_PORT = Symbol(
  'CHANNEL_PRODUCT_MATCHING_PORT',
);

export interface ChannelProductMatchingPort {
  list(
    organizationId: string,
    query?: ChannelProductMatchingQuery,
  ): Promise<ChannelProductMatchingQueueResponse>;
  productCandidates(
    organizationId: string,
    channelListingId: string,
    query: {
      search?: string;
    },
  ): Promise<ChannelProductCandidateListResponse>;
  linkProduct(
    organizationId: string,
    channelListingId: string,
    rawInput: unknown,
  ): Promise<void>;
  autoMatch(
    organizationId: string,
    rawInput: unknown,
  ): Promise<{
    evaluatedListings: number;
    matchedListings: number;
    configuredOptions: number;
  }>;
}
