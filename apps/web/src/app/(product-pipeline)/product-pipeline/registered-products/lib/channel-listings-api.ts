import {
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogStageSchema,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export type CoupangCatalogCollectionLink = {
  attemptId: string;
  channelAccountId: string;
  stage: CoupangCatalogStage;
};

export type CoupangCatalogCollectionLinkResult =
  | CoupangCatalogCollectionLink
  | { invalid: true };

export type CoupangCatalogSearchParams = Pick<URLSearchParams, 'get' | 'has'>;

/**
 * Read an explicit collection handoff without ever starting provider work.
 * Keep malformed links distinguishable from ordinary navigation so a bad
 * account/attempt pair cannot silently turn into a fresh collection.
 */
export function readCoupangCatalogCollectionLink(
  input?: CoupangCatalogSearchParams | string | null,
): CoupangCatalogCollectionLinkResult | null {
  const query = typeof input === 'string'
    ? new URLSearchParams(input)
    : input ?? (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search));
  if (!query) return null;
  const hasLinkParam = ['collectionAttempt', 'channelAccountId', 'collectionStage']
    .some((key) => query.has(key));
  if (!hasLinkParam) return null;
  const parsed = z.object({
    attemptId: CoupangCatalogCollectionRunSchema.shape.attemptId,
    channelAccountId: CoupangCatalogCollectionRunSchema.shape.channelAccountId,
    stage: CoupangCatalogStageSchema.default('full'),
  }).safeParse({
    attemptId: query.get('collectionAttempt'),
    channelAccountId: query.get('channelAccountId'),
    stage: query.get('collectionStage') ?? undefined,
  });
  return parsed.success ? parsed.data : { invalid: true };
}

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
  providerDetail?: RegisteredChannelListingProviderDetail;
}

export interface RegisteredChannelListingProviderDetail {
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
};
