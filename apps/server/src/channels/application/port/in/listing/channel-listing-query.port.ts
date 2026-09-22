export const CHANNEL_LISTING_QUERY_PORT = Symbol('CHANNEL_LISTING_QUERY_PORT');

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

export interface ChannelListingProviderDetail {
  category: string | null;
  brand: string | null;
  manufacturer: string | null;
  sourceDetail: {
    documents: Array<Record<string, unknown>>;
    options: Array<{
      externalOptionId: string;
      documentIds: string[];
    }>;
  } | null;
  options: Array<{
    externalOptionId: string;
    itemName: string | null;
    vendorItemId: string | null;
    sellerProductItemId: string | null;
    salePrice: number | null;
    sellerSku: string | null;
    barcode: string | null;
    modelNumber: string | null;
    status: string | null;
    attributes: unknown;
  }>;
  media: Array<{
    sourceUrl: string;
    role: string;
    sortOrder: number;
    externalOptionIds: string[];
  }>;
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
  category: string | null;
  brand: string | null;
  manufacturer: string | null;
  channelPrice: number | null;
  sourceCandidateId: string | null;
  contentWorkspaceId: string | null;
  status: string | null;
  exposureStatus: string | null;
  optionCount: number;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review';
  createdAt: string;
  updatedAt: string;
  providerDetail?: ChannelListingProviderDetail;
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

/** Organization-scoped registered-product reads for HTTP and owner consumers. */
export interface ChannelListingQueryPort {
  list(
    organizationId: string,
    query?: ChannelListingQuery,
  ): Promise<ChannelListingListResult>;
  getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary | null>;
}
