/**
 * 실행이 동결한 제출본을 읽는 읽기 전용 경계.
 *
 * 울타리는 Channels 것이고 Agent capability 는 여기서만 그 payload 를 본다
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
export const FROZEN_REGISTRATION_READ_PORT = Symbol(
  "FROZEN_REGISTRATION_READ_PORT",
);

export interface FrozenRegistrationReference {
  organizationId: string;
  initiatingUserId: string;
  executionId: string;
  preparationId: string;
}

/**
 * Server-loaded registration state. It is deliberately returned by the fence's
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

export interface FrozenRegistrationReadPort {
  loadSubmission(
    input: FrozenRegistrationReference,
  ): Promise<ServerFrozenRegistration>;
  loadExternalConfirmation(
    input: FrozenRegistrationReference,
  ): Promise<ServerFrozenRegistration>;
}
