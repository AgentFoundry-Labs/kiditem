import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  ListingTrafficWindowFacts,
  ListingStateFact,
  ListingSaleStatusFact,
} from '../../../../domain/listing/observation-facts';
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
  /** 우리 작업공간의 현재 대표이미지 자산(Content). */
  thumbnailUrl: string | null;
  /** 몰이 보고한 대표이미지(`ChannelListing.imageUrl`, 수집마다 갱신). 리스팅 대표이미지 평가는 이것을 본다(KID-313 결정, 2026-09-23 14:46). */
  imageUrl: string | null;
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
  sourceRecordId: string | null;
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
export interface ChannelCatalogFact {
  id: string;
  externalId: string;
  accountId: string;
  channel: string;
  channelName: string | null;
  displayName: string | null;
  category: string | null;
  createdAt: Date;
  /** 이 몰 상품을 만든 판매상품 초안. KidItem 이 등록해 만든 줄인지 가른다(KID-310). */
  salesProductId: string | null;
  sourceRecordId: string | null;
  isActive: boolean;
  status: string | null;
  rawJson: unknown;
  options: Array<{
    id: string;
    externalOptionId: string;
    itemName: string | null;
    sellerSku: string | null;
    status: string | null;
    isActive: boolean;
    salePrice: number | null;
    createdAt: Date;
    updatedAt: Date;
    components: Array<{ masterProductId: string; quantity: number }>;
  }>;
}

export interface ChannelListingFactQueries {
  readOptionCandidates(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      channel: string;
      externalOptionIds: readonly string[];
      activeOnly?: boolean;
    },
  ): Promise<
    Array<{
      externalOptionId: string;
      optionId: string;
      listingId: string;
      accountId: string;
      itemName: string | null;
    }>
  >;
  readCatalogFacts(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      accountIds?: readonly string[];
      listingIds?: readonly string[];
      channels?: readonly string[];
      activeAccountsOnly?: boolean;
      activeOnly?: boolean;
    },
  ): Promise<ChannelCatalogFact[]>;
  readRegistrationFailureCounts(
    transaction: OwnerTransaction,
    input: { organizationId: string },
  ): Promise<Array<{ channel: string; mallName: string; count: number }>>;
  readExternalIdentities(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      accountId: string;
      listingExternalIds?: readonly string[];
      optionExternalIds?: readonly string[];
      activeOnly: boolean;
    },
  ): Promise<
    Array<{
      listingId: string;
      externalId: string;
      optionId: string | null;
      externalOptionId: string | null;
    }>
  >;
  readOptionIdentities(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      optionIds: readonly string[];
      activeOnly?: boolean;
      channel?: string;
    },
  ): Promise<
    Array<{
      optionId: string;
      listingId: string;
      accountId: string;
      externalOptionId: string;
      listingExternalId: string;
      channelName: string | null;
      displayName: string | null;
      itemName: string | null;
    }>
  >;
  readDisplayFacts(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      listingIds: readonly string[];
      activeOnly?: boolean;
    },
  ): Promise<
    Array<{
      id: string;
      externalId: string;
      accountId: string;
      displayName: string | null;
      channelName: string | null;
      category: string | null;
      imageUrl: string | null;
      firstActiveSellerSku: string | null;
    }>
  >;
  readTrafficWindow(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      from?: Date;
      to?: Date;
      listingIds?: readonly string[];
      requireMasterProductLink?: boolean;
    },
  ): Promise<ListingTrafficWindowFacts>;
  readLatestState(
    transaction: OwnerTransaction,
    input: { organizationId: string; listingIds: readonly string[] },
  ): Promise<readonly ListingStateFact[]>;
  readLatestSaleStatus(
    transaction: OwnerTransaction,
    input: { organizationId: string; listingIds: readonly string[] },
  ): Promise<readonly ListingSaleStatusFact[]>;
  lockActiveOwner(
    transaction: OwnerTransaction,
    input: { organizationId: string; listingId: string },
  ): Promise<{
    id: string;
    sourceRecordId: string | null;
    accountId: string;
  }>;
  assertOwnedIds(
    transaction: OwnerTransaction,
    input: { organizationId: string; listingIds: readonly string[] },
  ): Promise<void>;
}

export interface ChannelListingQueryPort extends ChannelListingFactQueries {
  list(
    organizationId: string,
    query?: ChannelListingQuery,
  ): Promise<ChannelListingListResult>;
  getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary | null>;
}
