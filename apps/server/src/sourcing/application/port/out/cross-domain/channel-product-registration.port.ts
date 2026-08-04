import type {
  ChannelListingRegistrationResult,
  MarketplaceSubmissionResult,
} from '@kiditem/shared/channel-listing';
import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';
import type { FrozenProductPreparationSubmission } from '../repository/product-preparation.repository.port';

export class DefinitiveChannelProductRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitiveChannelProductRegistrationError';
  }
}

export const CHANNEL_PRODUCT_REGISTRATION_PORT = Symbol(
  'CHANNEL_PRODUCT_REGISTRATION_PORT',
);

export interface ChannelProductRegistrationSubmissionInput {
  executionId: string;
  organizationId: string;
  preparationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  submissionKey: string;
  submissionPayloadHash: string;
  submissionPayloadJson: FrozenProductPreparationSubmission['submissionPayloadJson'];
  providerSubmissionId: string | null;
  registrationResult: FrozenProductPreparationSubmission['registrationResult'];
  isRetry: boolean;
  providerOutcome: FrozenProductPreparationSubmission['providerOutcome'];
  providerCreateAllowed: boolean;
}

export interface ResolveChannelListingInput
  extends ChannelProductRegistrationSubmissionInput {
  externalListingId: string;
  displayName: string;
  masterProductId?: string;
  optionLinks?: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
}

export interface ExternalRegistrationPreflightInput {
  organizationId: string;
  channelAccountId: string;
  sourceCandidateId: string;
  listingName: string;
  itemName: string | null;
  selectedSellpiaInventorySkuId?: string;
  selectedQuantity?: number;
}

export type ExternalRegistrationMatchPreviewInput = Omit<
  ExternalRegistrationPreflightInput,
  'channelAccountId' | 'selectedSellpiaInventorySkuId' | 'selectedQuantity'
>;

export interface ExternalRegistrationMatchPreviewResult {
  status: 'matched' | 'selection_required';
  reason: string;
  sellpiaMatch: ExternalRegistrationPreflightResult['sellpiaMatch'] | null;
  proposals: Array<{
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number;
    recommendedQuantity: number | null;
  }>;
}

export interface ExternalRegistrationPreflightResult {
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

export interface ChannelProductRegistrationPort {
  previewExternalRegistrationMatch(
    input: ExternalRegistrationMatchPreviewInput,
  ): Promise<ExternalRegistrationMatchPreviewResult>;

  preflightExternalRegistration(
    input: ExternalRegistrationPreflightInput,
  ): Promise<ExternalRegistrationPreflightResult>;

  assertExternalRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: 'coupang'; vendorId: string }>;
  reconcile(
    input: ChannelProductRegistrationSubmissionInput,
  ): Promise<MarketplaceSubmissionResult | null>;
  submit(
    input: ChannelProductRegistrationSubmissionInput,
    beforeProviderCreate: () => Promise<void>,
  ): Promise<MarketplaceSubmissionResult>;
  resolveListing(
    tx: SourcingRepositoryTransaction,
    input: ResolveChannelListingInput,
  ): Promise<ChannelListingRegistrationResult>;
}
