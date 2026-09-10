import type { ChannelListingRegistrationResult } from "@kiditem/shared/channel-listing";

export interface ResolveProductRegistrationCapabilityInput {
  organizationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  submissionKey: string;
  externalListingId: string;
  displayName: string;
  masterProductId?: string;
  optionLinks?: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
}

/**
 * Channels-owned local listing resolution. Provider payload/state is never
 * carried through this receipt boundary.
 */
export interface ResolveProductRegistrationWithOwnerReceiptInput {
  organizationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  submissionKey: string;
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
}

export interface ExternalProductRegistrationPreflightInput {
  organizationId: string;
  channelAccountId: string;
  sourceCandidateId: string;
  listingName: string;
  itemName: string | null;
  selectedSellpiaInventorySkuId?: string;
  selectedQuantity?: number;
}

export type ExternalProductRegistrationMatchPreviewInput = Omit<
  ExternalProductRegistrationPreflightInput,
  "channelAccountId" | "selectedSellpiaInventorySkuId" | "selectedQuantity"
>;

export interface ExternalProductRegistrationMatchProposal {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
  recommendedQuantity: number | null;
}

export interface ExternalProductRegistrationMatchPreviewResult {
  status: "matched" | "selection_required";
  reason: string;
  sellpiaMatch:
    ExternalProductRegistrationPreflightResult["sellpiaMatch"] | null;
  proposals: ExternalProductRegistrationMatchProposal[];
}

export interface ExternalProductRegistrationPreflightResult {
  sellpiaMatch: {
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number;
    quantity: number;
  };
  existingListing: {
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null;
}

export const CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT = Symbol(
  "CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT",
);

export interface ChannelsMarketplaceRegistrationCapabilityPort {
  previewExternalProductRegistrationMatch(
    input: ExternalProductRegistrationMatchPreviewInput,
  ): Promise<ExternalProductRegistrationMatchPreviewResult>;

  preflightExternalProductRegistration(
    input: ExternalProductRegistrationPreflightInput,
  ): Promise<ExternalProductRegistrationPreflightResult>;

  assertExternalProductRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: "coupang"; vendorId: string }>;

  resolveProductRegistration(
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult>;

  resolveProductRegistrationWithOwnerReceipt(
    transaction: object,
    input: ResolveProductRegistrationWithOwnerReceiptInput,
  ): Promise<ChannelListingRegistrationResult>;
}
