/** Read-only anti-corruption port for Channels-owned Agent capabilities. */
export const SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT = Symbol(
  'SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT',
);

export interface FrozenRegistrationSubmissionInput {
  organizationId: string;
  initiatingUserId: string;
  executionId: string;
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
  masterProductId?: string;
  optionLinks: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
}

export interface FrozenRegistrationConfirmationInput
  extends FrozenRegistrationSubmissionInput {
  externalListingId: string;
  displayName: string;
  confirmationEvidence: {
    wingVendorId: string;
    wingIdentitySource: string;
  };
}

export interface FrozenRegistrationProvenance {
  displayName: string;
  expectedProviderAccountId: string | null;
}

export interface SourcingFrozenRegistrationReadCapabilityPort {
  validateSubmission(
    input: FrozenRegistrationSubmissionInput,
  ): Promise<FrozenRegistrationProvenance>;
  validateExternalConfirmation(
    input: FrozenRegistrationConfirmationInput,
  ): Promise<FrozenRegistrationProvenance>;
}
