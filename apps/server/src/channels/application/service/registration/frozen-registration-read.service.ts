import {
  type FrozenRegistrationSubmission,
  type RegistrationExecutionRepositoryPort,
} from "../../port/out/repository/registration-execution.repository.port";
import type {
  FrozenRegistrationReference,
  ServerFrozenRegistration,
  FrozenRegistrationReadPort,
} from "../../port/in/capability/frozen-registration-read.port";

/**
 * Read-only provenance guard over the registration execution fence. It loads
 * the immutable frozen submission for Agent capabilities but never submits a
 * provider request or finalizes a listing.
 */
export class FrozenRegistrationReadService implements FrozenRegistrationReadPort {
  constructor(
    private readonly executions: RegistrationExecutionRepositoryPort,
  ) {}

  async loadSubmission(
    input: FrozenRegistrationReference,
  ): Promise<ServerFrozenRegistration> {
    const { frozen } = await this.loadActorBoundFrozen(input);
    return toServerFrozenRegistration(frozen, null);
  }

  async loadExternalConfirmation(
    input: FrozenRegistrationReference,
  ): Promise<ServerFrozenRegistration> {
    const { frozen, execution } = await this.loadActorBoundFrozen(input);
    if (!["executing", "reconciling", "succeeded"].includes(execution.status)) {
      throw new Error("frozen_submission_mismatch:execution");
    }
    return toServerFrozenRegistration(
      frozen,
      execution.expectedProviderAccountId,
    );
  }

  private async loadActorBoundFrozen(input: FrozenRegistrationReference) {
    const frozen = await this.executions.loadFrozenSubmission(
      input.organizationId,
      input.preparationId,
      input.executionId,
    );
    if (
      frozen.executionId !== input.executionId ||
      frozen.preparationId !== input.preparationId
    ) {
      throw new Error("frozen_submission_mismatch:execution");
    }
    const execution = await this.executions.get({
      organizationId: input.organizationId,
      sourceCandidateId: frozen.sourceCandidateId,
      executionId: input.executionId,
      requestedByUserId: input.initiatingUserId,
    });
    if (
      execution.executionId !== frozen.executionId ||
      execution.preparationId !== frozen.preparationId
    ) {
      throw new Error("frozen_submission_mismatch:execution");
    }
    return { frozen, execution };
  }
}

function toServerFrozenRegistration(
  frozen: FrozenRegistrationSubmission,
  expectedProviderAccountId: string | null,
): ServerFrozenRegistration {
  const submissionPayloadJson = requiredRecord(
    frozen.submissionPayloadJson,
    "payload",
  );
  const registrationInput = record(submissionPayloadJson.registrationInput);
  const optionLinks = Array.isArray(registrationInput.optionLinks)
    ? registrationInput.optionLinks.map(toFrozenOptionLink)
    : [];
  const masterProductId = optionalText(registrationInput.masterProductId);
  const providerOutcome = frozen.providerOutcome;
  if (
    !["not_attempted", "uncertain", "succeeded", "definitive_failure"].includes(
      providerOutcome,
    )
  ) {
    throw new Error("frozen_submission_mismatch:provider_outcome");
  }
  return {
    executionId: frozen.executionId,
    preparationId: frozen.preparationId,
    sourceCandidateId: frozen.sourceCandidateId,
    salesProductId: frozen.salesProductId,
    channelAccountId: frozen.channelAccountId,
    submissionKey: frozen.submissionKey,
    submissionPayloadHash: frozen.submissionPayloadHash,
    submissionPayloadJson,
    providerSubmissionId: frozen.providerSubmissionId,
    registrationResult: frozen.registrationResult,
    isRetry: frozen.isRetry,
    providerOutcome,
    displayName: frozen.displayName,
    ...(masterProductId ? { masterProductId } : {}),
    optionLinks,
    expectedProviderAccountId: optionalText(expectedProviderAccountId),
  };
}

function toFrozenOptionLink(value: unknown): {
  externalOptionId: string;
  sellpiaInventorySkuId: string;
  quantity: number;
} {
  const link = requiredRecord(value, "links");
  const externalOptionId = optionalText(link.externalOptionId);
  const sellpiaInventorySkuId = optionalText(link.sellpiaInventorySkuId);
  const quantity = link.quantity;
  if (
    !externalOptionId ||
    !sellpiaInventorySkuId ||
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    throw new Error("frozen_submission_mismatch:links");
  }
  return { externalOptionId, sellpiaInventorySkuId, quantity };
}

function requiredRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  const item = record(value);
  if (Object.keys(item).length === 0) {
    throw new Error(`frozen_submission_mismatch:${field}`);
  }
  return item;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
