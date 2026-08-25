/** Read-only anti-corruption port for Channels-owned Agent capabilities. */
export const SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT = Symbol(
  "SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT",
);

export interface FrozenRegistrationReference {
  organizationId: string;
  initiatingUserId: string;
  executionId: string;
  preparationId: string;
}

/**
 * Server-loaded registration state. It is deliberately returned by Sourcing's
 * read boundary rather than accepted through the Agent capability contract.
 */
export interface ServerFrozenRegistration {
  executionId: string;
  preparationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  submissionKey: string;
  submissionPayloadHash: string;
  submissionPayloadJson: Record<string, unknown>;
  providerSubmissionId: string | null;
  registrationResult: unknown;
  isRetry: boolean;
  providerOutcome:
    "not_attempted" | "uncertain" | "succeeded" | "definitive_failure";
  displayName: string;
  masterProductId?: string;
  optionLinks: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
  expectedProviderAccountId: string | null;
}

export interface SourcingFrozenRegistrationReadCapabilityPort {
  loadSubmission(
    input: FrozenRegistrationReference,
  ): Promise<ServerFrozenRegistration>;
  loadExternalConfirmation(
    input: FrozenRegistrationReference,
  ): Promise<ServerFrozenRegistration>;
}
