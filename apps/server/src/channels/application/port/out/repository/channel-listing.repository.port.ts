export const CHANNEL_LISTING_REPOSITORY_PORT = Symbol(
  "CHANNEL_LISTING_REPOSITORY_PORT",
);

export interface ChannelListingRepositoryPort {
  /**
   * 삭제 대상 후보를 조직 스코프로 읽는다.
   * 소유권 판정에 필요한 최소 필드만 돌려준다.
   */
  findDeletionTarget(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingDeletionTarget | null>;

  markDeletionUnresolved(
    input: ChannelListingDeletionUnresolvedInput,
  ): Promise<ChannelListingDeletionUnresolvedResult>;
  getDeletionOperation(
    input: ChannelListingDeletionOperationLookup,
  ): Promise<ChannelListingDeletionOperationStatus | null>;
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

export interface ChannelListingDeletionUnresolvedResult {
  operationId: string;
  status: "reconciling" | "succeeded";
  providerOutcome: "uncertain" | "succeeded";
}

export interface ChannelListingDeletionOperationStatus {
  operationId: string;
  listingId: string;
  channelAccountId: string;
  expectedVendorId: string;
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
  sourceRecordId: string | null;
  isActive: boolean;
}
