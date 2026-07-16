export const CHANNEL_LISTING_REPOSITORY_PORT = Symbol('CHANNEL_LISTING_REPOSITORY_PORT');
export const MARKETPLACE_REGISTRATION_REPOSITORY_PORT = Symbol(
  'MARKETPLACE_REGISTRATION_REPOSITORY_PORT',
);

export type ChannelListingSort = 'newest' | 'oldest' | 'name_asc';

export interface ChannelListingQuery {
  page?: number;
  limit?: number;
  sort?: ChannelListingSort;
  channel?: string | null;
  channelAccountId?: string | null;
  search?: string | null;
  createdSince?: string | null;
  includeDeleted?: boolean;
  tab?: 'registered' | 'deleted';
}

export interface ChannelListingSummary {
  id: string;
  listingName: string;
  thumbnailUrl: string | null;
  detailPageArtifactId: string | null;
  detailPageRevisionId: string | null;
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  externalId: string;
  channelName: string | null;
  channelPrice: number | null;
  sourceCandidateId: string | null;
  contentWorkspaceId: string | null;
  status: string | null;
  exposureStatus: string | null;
  optionCount: number;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review';
  createdAt: string;
  updatedAt: string;
}

export interface ChannelListingMarketCount {
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  count: number;
}

export interface ChannelListingListResult {
  items: ChannelListingSummary[];
  total: number;
  page: number;
  limit: number;
  marketCounts: ChannelListingMarketCount[];
}

export interface ChannelListingRepositoryPort {
  list(
    organizationId: string,
    query?: ChannelListingQuery,
  ): Promise<ChannelListingListResult>;

  getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary>;
}

export interface MarketplaceRegistrationRepositoryPort {
  assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: string }>;
  resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        productVariantId: string;
      }>;
    },
  ): Promise<{
    listingId: string;
    channelAccountId: string;
    channel: string;
    externalId: string;
    status: string | null;
  }>;
}
