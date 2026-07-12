import type {
  RegisteredMarketplaceListingResult,
  RegisterConfirmedListingInput,
} from '../../out/repository/channel-listing.repository.port';
import type { CoupangSellerProductPayload } from '../../out/provider/coupang-provider.port';
import type {
  ChannelListingRegistrationResult,
  MarketplaceSubmissionResult,
} from '@kiditem/shared/channel-listing';

export interface ProductRegistrationSubmissionCapabilityInput {
  organizationId: string;
  preparationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  submissionKey: string;
  submissionPayloadHash: string;
  submissionPayloadJson: unknown;
  providerSubmissionId: string | null;
  registrationResult: unknown;
  isRetry?: boolean;
}

export interface ResolveProductRegistrationCapabilityInput
  extends ProductRegistrationSubmissionCapabilityInput {
  externalListingId: string;
  displayName: string;
}

export const CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT = Symbol(
  'CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT',
);

export interface RegisterConfirmedMarketplaceListingCapabilityInput
  extends RegisterConfirmedListingInput {
  productBarcode?: string | null;
}

export type RegisterConfirmedMarketplaceListingCapabilityResult =
  RegisteredMarketplaceListingResult;

export interface SubmitCoupangMarketplaceListingCapabilityInput {
  masterId: string;
  channelAccountId: string;
  productBarcode?: string | null;
  listingPayload: CoupangSellerProductPayload;
}

export interface SubmitCoupangMarketplaceListingCapabilityResult {
  listingId: string;
  sellerProductId: string;
  masterId: string;
  channel: string;
  channelAccountId: string | null;
  externalId: string;
  status: string | null;
}

export interface ChannelsMarketplaceRegistrationCapabilityPort {
  reconcileProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
  ): Promise<MarketplaceSubmissionResult | null>;

  submitProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
  ): Promise<MarketplaceSubmissionResult>;

  resolveProductRegistration(
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult>;

  registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedMarketplaceListingCapabilityInput,
  ): Promise<RegisterConfirmedMarketplaceListingCapabilityResult>;

  submitCoupangListing(
    organizationId: string,
    input: SubmitCoupangMarketplaceListingCapabilityInput,
  ): Promise<SubmitCoupangMarketplaceListingCapabilityResult>;
}
