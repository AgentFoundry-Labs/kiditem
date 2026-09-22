import { describe, expect, it, vi } from "vitest";
import { FrozenRegistrationReadAdapter } from "./frozen-registration-read.adapter";

const organizationId = "00000000-0000-4000-8000-000000000001";
const preparationId = "00000000-0000-4000-8000-000000000002";
const candidateId = "00000000-0000-4000-8000-000000000003";
const executionId = "00000000-0000-4000-8000-000000000004";
const accountId = "00000000-0000-4000-8000-000000000005";
const userId = "00000000-0000-4000-8000-000000000006";

const reference = {
  organizationId,
  initiatingUserId: userId,
  executionId,
  preparationId,
};
const frozen = {
  executionId,
  preparationId,
  sourceCandidateId: candidateId,
  channelAccountId: accountId,
  submissionKey: "frozen-submission",
  submissionPayloadHash: "a".repeat(64),
  submissionPayloadJson: {
    registrationInput: {
      masterProductId: "00000000-0000-4000-8000-000000000007",
      optionLinks: [
        {
          externalOptionId: "option-1",
          sellpiaInventorySkuId: "00000000-0000-4000-8000-000000000008",
          quantity: 1,
        },
      ],
    },
  },
  providerSubmissionId: null,
  registrationResult: null,
  isRetry: false,
  providerOutcome: "not_attempted",
  displayName: "Toy",
};

describe("FrozenRegistrationReadAdapter", () => {
  it("loads frozen payload, provider state, and product links from the registration execution fence instead of accepting them from an Agent", async () => {
    const executions = {
      loadFrozenSubmission: vi.fn().mockResolvedValue(frozen),
      get: vi.fn().mockResolvedValue({
        executionId,
        preparationId,
        status: "executing",
        providerOutcome: "uncertain",
        expectedProviderAccountId: "vendor-1",
      }),
    };
    const adapter = new FrozenRegistrationReadAdapter(
      executions as never,
    );

    await expect(adapter.loadSubmission(reference)).resolves.toEqual({
      ...frozen,
      masterProductId: "00000000-0000-4000-8000-000000000007",
      optionLinks: [
        {
          externalOptionId: "option-1",
          sellpiaInventorySkuId: "00000000-0000-4000-8000-000000000008",
          quantity: 1,
        },
      ],
      expectedProviderAccountId: null,
    });
    expect(executions.loadFrozenSubmission).toHaveBeenCalledWith(
      organizationId,
      preparationId,
      executionId,
    );
    expect(executions.get).toHaveBeenCalledWith({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
    });

    await expect(adapter.loadExternalConfirmation(reference)).resolves.toEqual({
      ...frozen,
      masterProductId: "00000000-0000-4000-8000-000000000007",
      optionLinks: [
        {
          externalOptionId: "option-1",
          sellpiaInventorySkuId: "00000000-0000-4000-8000-000000000008",
          quantity: 1,
        },
      ],
      expectedProviderAccountId: "vendor-1",
    });
  });

  it("rejects an execution that is not the actor-bound frozen preparation", async () => {
    const executions = {
      loadFrozenSubmission: vi.fn().mockResolvedValue(frozen),
      get: vi.fn().mockResolvedValue({
        executionId,
        preparationId: "00000000-0000-4000-8000-000000000099",
        status: "executing",
        providerOutcome: "uncertain",
        expectedProviderAccountId: "vendor-1",
      }),
    };
    const adapter = new FrozenRegistrationReadAdapter(
      executions as never,
    );

    await expect(adapter.loadExternalConfirmation(reference)).rejects.toThrow(
      "frozen_submission_mismatch:execution",
    );
  });
});
