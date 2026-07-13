import { apiClient } from '@/lib/api-client';
import type {
  CoupangCatalogCollectionRun,
  StartCoupangCatalogCollectionRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';

export type RegisteredListingSort = 'newest' | 'oldest' | 'name_asc';

export interface RegisteredChannelListing {
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

export interface RegisteredMarketCount {
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  count: number;
}

export interface RegisteredChannelListingResponse {
  items: RegisteredChannelListing[];
  total: number;
  page: number;
  limit: number;
  marketCounts: RegisteredMarketCount[];
}

export interface ChannelAccountOption {
  id: string;
  channel: string;
  name: string;
  externalAccountId: string | null;
  vendorId?: string | null;
  sellerId?: string | null;
  isPrimary?: boolean | null;
}

export const channelListingsApi = {
  list(params?: {
    page?: number;
    limit?: number;
    sort?: RegisteredListingSort;
    channel?: string | null;
    channelAccountId?: string | null;
    search?: string | null;
    createdSince?: string | null;
    tab?: 'registered' | 'deleted';
  }): Promise<RegisteredChannelListingResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page ?? 1),
      limit: String(params?.limit ?? 20),
    });
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.channelAccountId) qs.set('channelAccountId', params.channelAccountId);
    if (params?.search?.trim()) qs.set('search', params.search.trim());
    if (params?.createdSince) qs.set('createdSince', params.createdSince);
    if (params?.tab) qs.set('tab', params.tab);
    return apiClient.get<RegisteredChannelListingResponse>(`/api/channels/listings?${qs}`);
  },
  getWorkspace(listingId: string): Promise<RegisteredChannelListing> {
    return apiClient.get<RegisteredChannelListing>(
      `/api/channels/listings/${encodeURIComponent(listingId)}/workspace`,
    );
  },
  listAccounts(): Promise<ChannelAccountOption[]> {
    return apiClient.get<ChannelAccountOption[]>('/api/channels/accounts');
  },
  startCoupangCatalogCollection(
    channelAccountId: string,
    request: StartCoupangCatalogCollectionRequest,
  ): Promise<CoupangCatalogCollectionRun> {
    return apiClient.post<CoupangCatalogCollectionRun>(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        '/catalog-imports/coupang-wing/runs',
      request,
    );
  },
  getCoupangCatalogCollection(
    channelAccountId: string,
    runId: string,
  ): Promise<CoupangCatalogCollectionRun> {
    return apiClient.get<CoupangCatalogCollectionRun>(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        `/catalog-imports/coupang-wing/runs/${encodeURIComponent(runId)}`,
    );
  },
};
