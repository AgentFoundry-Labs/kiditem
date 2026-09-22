import type { PreparedRegistrationRecipe } from '../../../../domain/registration-item-code';
export const CHANNEL_LISTING_REPOSITORY_PORT = Symbol(
  "CHANNEL_LISTING_REPOSITORY_PORT",
);
export const MARKETPLACE_REGISTRATION_REPOSITORY_PORT = Symbol(
  "MARKETPLACE_REGISTRATION_REPOSITORY_PORT",
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
  sourceCandidateId: string | null;
  isActive: boolean;
}

export interface MarketplaceRegistrationRepositoryPort {
  assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{
    channel: string;
    vendorId: string | null;
    externalAccountId: string | null;
  }>;
  findExistingActiveListingBySellerSku(input: {
    organizationId: string;
    channelAccountId: string;
    sellerSku: string;
  }): Promise<{
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null>;
  preflightExactProductLinks(input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: Array<{
      externalOptionId: string;
      sellpiaInventorySkuId: string;
      quantity: number;
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
  preparedRecipe?: PreparedRegistrationRecipe;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
    },
  ): Promise<{
    listingId: string;
    channelAccountId: string;
    channel: string;
    externalId: string;
    status: string | null;
  }>;
  resolveProductRegistrationWithOwnerReceipt(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      submissionKey: string;
  preparedRecipe?: PreparedRegistrationRecipe;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
      ownerCapabilityKey: "channels.register_confirmed_listing";
      ownerIdempotencyKey: string;
      ownerRequestHash: string;
    },
  ): Promise<{
    listingId: string;
    channelAccountId: string;
    channel: string;
    externalId: string;
    status: string | null;
  }>;
}
