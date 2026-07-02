import type {
  RegisteredMarketplaceListingResult,
  RegisterConfirmedListingInput,
} from '../../out/repository/channel-listing.repository.port';
import type { CoupangSellerProductPayload } from '../../out/provider/coupang-provider.port';

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
  registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedMarketplaceListingCapabilityInput,
  ): Promise<RegisterConfirmedMarketplaceListingCapabilityResult>;

  submitCoupangListing(
    organizationId: string,
    input: SubmitCoupangMarketplaceListingCapabilityInput,
  ): Promise<SubmitCoupangMarketplaceListingCapabilityResult>;
}
