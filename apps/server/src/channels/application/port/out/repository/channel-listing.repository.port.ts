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
  masterId: string;
  masterCode: string;
  masterName: string;
  thumbnailUrl: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface ChannelListingMarketCount {
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  count: number;
}

export interface RegisteredProductGroupSummary {
  masterId: string;
  masterCode: string;
  masterName: string;
  thumbnailUrl: string | null;
  listingCount: number;
  listings: ChannelListingSummary[];
  updatedAt: string;
}

export interface ChannelListingListResult {
  items: ChannelListingSummary[];
  total: number;
  page: number;
  limit: number;
  marketCounts: ChannelListingMarketCount[];
}

export interface ChannelListingGroupResult {
  items: RegisteredProductGroupSummary[];
  total: number;
  page: number;
  limit: number;
  marketCounts: ChannelListingMarketCount[];
}

export interface RegisterConfirmedListingInput {
  masterId: string;
  channelAccountId: string;
  externalId: string;
  channelName?: string | null;
  channelPrice?: number | null;
}

export interface RegisteredMarketplaceListingResult {
  id: string;
  masterId: string;
  channel: string;
  channelAccountId: string | null;
  externalId: string;
  channelName: string | null;
  channelPrice: number | null;
  status: string | null;
}

export interface ChannelListingRepositoryPort {
  list(
    organizationId: string,
    query?: ChannelListingQuery,
  ): Promise<ChannelListingListResult>;

  listGrouped(
    organizationId: string,
    query?: ChannelListingQuery,
  ): Promise<ChannelListingGroupResult>;

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
    },
  ): Promise<{
    listingId: string;
    channelAccountId: string;
    channel: string;
    externalId: string;
    status: string | null;
  }>;
  registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedListingInput,
  ): Promise<RegisteredMarketplaceListingResult>;
}
