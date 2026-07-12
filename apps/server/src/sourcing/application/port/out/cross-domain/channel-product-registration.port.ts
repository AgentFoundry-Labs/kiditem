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
}

export interface ChannelProductRegistrationPort {
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
