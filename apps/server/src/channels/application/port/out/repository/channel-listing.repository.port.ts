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

  /**
   * 삭제 대상 후보를 조직 스코프로 읽는다.
   * 소유권 판정에 필요한 최소 필드만 돌려준다.
   */
  findDeletionTarget(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingDeletionTarget | null>;

  authorizeDeletion(input: ChannelListingDeletionAuthorizationInput): Promise<ChannelListingDeletionOperationResult>;
  claimDeletionExecution(input: ChannelListingDeletionOperationLookup): Promise<ChannelListingDeletionExecutionClaim>;
  completeDeletion(input: ChannelListingDeletionCompletionInput): Promise<ChannelListingDeletionCompletionResult>;
  markDeletionUnresolved(input: ChannelListingDeletionUnresolvedInput): Promise<ChannelListingDeletionUnresolvedResult>;
  getDeletionOperation(input: ChannelListingDeletionOperationLookup): Promise<ChannelListingDeletionOperationStatus | null>;
}

export interface ChannelListingDeletionAuthorizationInput {
  organizationId: string;
  userId: string;
  listingId: string;
  idempotencyKey: string;
  requestHash: string;
}

export interface ChannelListingDeletionCompletionInput {
  organizationId: string;
  userId: string;
  listingId: string;
  operationId: string;
}

export interface ChannelListingDeletionExecutionClaim {
  operationId: string;
  listingId: string;
  externalId: string;
  displayName: string;
  expectedVendorId: string;
  executionCapability: string;
  expiresAt: string;
}


export interface ChannelListingDeletionUnresolvedInput {
  organizationId: string;
  userId: string;
  listingId: string;
  operationId: string;
  reason: string;
}

export interface ChannelListingDeletionOperationLookup {
  organizationId: string;
  userId: string;
  listingId: string;
  operationId: string;
}

export interface ChannelListingDeletionOperationResult {
  operationId: string;
  listingId: string;
  channelAccountId: string;
  externalId: string;
  displayName: string;
  channel: string;
  expectedVendorId: string;
  status: 'executing';
  providerOutcome: 'uncertain';
}

export interface ChannelListingDeletionCompletionResult {
  operationId: string;
  listingId: string;
  externalId: string;
  isActive: false;
  status: 'succeeded';
  providerOutcome: 'succeeded';
}

export interface ChannelListingDeletionUnresolvedResult {
  operationId: string;
  status: 'reconciling' | 'succeeded';
  providerOutcome: 'uncertain' | 'succeeded';
}

export interface ChannelListingDeletionOperationStatus {
  operationId: string;
  listingId: string;
  externalId: string;
  status: string;
  providerOutcome: string;
  completedAt: string | null;
  lastErrorCode: string | null;
}

/** 삭제 게이트가 판정에 쓰는 리스팅 사실들. */
export interface ChannelListingDeletionTarget {
  id: string;
  externalId: string;
  displayName: string | null;
  channel: string;
  channelAccountId: string | null;
  /**
   * 우리가 등록해서 생긴 리스팅에만 채워진다(등록 시 immutable provenance).
   * 카탈로그 수집으로 들어온 남의/기존 상품은 `null` 이며 삭제 대상이 아니다.
   */
  sourceCandidateId: string | null;
  isActive: boolean;
}

export interface MarketplaceRegistrationRepositoryPort {
  assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: string; vendorId: string | null; externalAccountId: string | null }>;
  preflightExactProductLinks(input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: Array<{
      externalOptionId: string;
      productVariantId: string;
      providerOptionKey: string;
    }>;
  }): Promise<void>;
  resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      submissionKey: string;
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
