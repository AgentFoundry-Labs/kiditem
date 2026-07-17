import type {
  ChannelListingRegistrationResult,
  MarketplaceSubmissionResult,
} from '@kiditem/shared/channel-listing';

export class DefinitiveMarketplaceRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitiveMarketplaceRegistrationError';
  }
}

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
  providerOutcome?: string;
  providerCreateAllowed?: boolean;
}

export interface ResolveProductRegistrationCapabilityInput
  extends ProductRegistrationSubmissionCapabilityInput {
  externalListingId: string;
  displayName: string;
  masterProductId?: string;
  optionLinks?: Array<{
    externalOptionId: string;
    productVariantId: string;
  }>;
}

export const CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT = Symbol(
  'CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT',
);

export interface ChannelsMarketplaceRegistrationCapabilityPort {
  reconcileProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
  ): Promise<MarketplaceSubmissionResult | null>;

  submitProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
    beforeProviderCreate: () => Promise<void>,
  ): Promise<MarketplaceSubmissionResult>;

  resolveProductRegistration(
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult>;

}
