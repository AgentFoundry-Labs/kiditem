import { describe, expect, it, vi } from "vitest";
import {
  canonicalOwnerInputHash,
  deriveOwnerIdempotencyKey,
} from "../../../../common/owner-idempotency-key";
import { ChannelsFinalCapabilityAdapter } from "./channels-final-capability.adapter";

const submissionInput = {
  executionId: "00000000-0000-4000-8000-000000000004",
  preparationId: "00000000-0000-4000-8000-000000000005",
};

const confirmationInput = {
  ...submissionInput,
  externalListingId: "provider-listing",
  confirmationEvidence: {
    wingVendorId: "vendor-1",
    wingIdentitySource: "dom:data-vendor-id" as const,
  },
};

const frozen = {
  ...submissionInput,
  sourceCandidateId: "00000000-0000-4000-8000-000000000006",
  channelAccountId: "00000000-0000-4000-8000-000000000007",
  submissionKey: "frozen-submission",
  submissionPayloadHash: "a".repeat(64),
  submissionPayloadJson: { registrationInput: { optionLinks: [] } },
  providerSubmissionId: null,
  registrationResult: null,
  isRetry: false,
  providerOutcome: "not_attempted" as const,
  masterProductId: undefined,
  optionLinks: [],
  displayName: "Toy",
  expectedProviderAccountId: null,
};

function context(
  capabilityKey:
    "channels.submit_coupang_listing" | "channels.register_confirmed_listing",
  input: typeof submissionInput | typeof confirmationInput,
) {
  const attemptId = "attempt-1";
  return {
    organizationId: "00000000-0000-4000-8000-000000000001",
    initiatingUserId: "00000000-0000-4000-8000-000000000002",
    sessionId: "session-1",
    taskId: "task-1",
    attemptId,
    agentVersionId: "version-1",
    ownerIdempotencyKey: deriveOwnerIdempotencyKey({
      attemptId,
      capabilityKey,
      input,
    }),
    applicationVersion: "0.25.0",
    authorizingGitSha: "a".repeat(40),
    runtimeType: "codex_cli",
  };
}

describe("ChannelsFinalCapabilityAdapter", () => {
  it("loads the frozen submission server-side before Channels owns provider submission and listing resolution", async () => {
    const executionContext = context(
      "channels.submit_coupang_listing",
      submissionInput,
    );
    const registrations = {
      reconcileProductRegistration: vi.fn().mockResolvedValue(null),
      submitProductRegistration: vi
        .fn()
        .mockResolvedValue({ externalListingId: "provider-hidden" }),
      resolveProductRegistrationWithOwnerReceipt: vi
        .fn()
        .mockResolvedValue({
          listingId: "00000000-0000-4000-8000-000000000008",
        }),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const executions = {
      claimProviderWrite: vi
        .fn()
        .mockResolvedValue({ mode: "create", leaseToken: "lease-1" }),
      finalizeProviderWrite: vi.fn().mockResolvedValue(undefined),
      markProviderWriteUncertain: vi.fn().mockResolvedValue(undefined),
      markProviderWriteDefinitiveFailure: vi.fn().mockResolvedValue(undefined),
    };
    const provenance = {
      loadSubmission: vi.fn().mockResolvedValue(frozen),
      loadExternalConfirmation: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: object) => unknown) =>
        work({ tx: true }),
      ),
    };
    const adapter = new ChannelsFinalCapabilityAdapter(
      registrations as never,
      provenance as never,
      prisma as never,
      executions as never,
    );

    await expect(
      adapter.submitCoupangListing({
        context: executionContext,
        input: submissionInput,
      }),
    ).resolves.toEqual({
      preparationId: submissionInput.preparationId,
      listingId: "00000000-0000-4000-8000-000000000008",
      status: "registered",
    });

    expect(provenance.loadSubmission).toHaveBeenCalledWith({
      organizationId: executionContext.organizationId,
      initiatingUserId: executionContext.initiatingUserId,
      ...submissionInput,
    });
    expect(registrations.submitProductRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionPayloadJson: frozen.submissionPayloadJson,
        providerSubmissionId: frozen.providerSubmissionId,
        registrationResult: frozen.registrationResult,
        ownerIdempotencyKey: executionContext.ownerIdempotencyKey,
      }),
      expect.any(Function),
    );
    expect(executions.claimProviderWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: executionContext.organizationId,
        executionId: frozen.executionId,
        preparationId: frozen.preparationId,
        channelAccountId: frozen.channelAccountId,
        sourceCandidateId: frozen.sourceCandidateId,
        idempotencyKey: frozen.submissionKey,
        requestHash: frozen.submissionPayloadHash,
        ownerIdempotencyKey: executionContext.ownerIdempotencyKey,
      }),
    );
    expect(executions.finalizeProviderWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseToken: "lease-1",
        externalListingId: "provider-hidden",
      }),
    );
    expect(
      registrations.resolveProductRegistrationWithOwnerReceipt,
    ).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        externalListingId: "provider-hidden",
        sourceCandidateId: frozen.sourceCandidateId,
        channelAccountId: frozen.channelAccountId,
        ownerCapabilityKey: "channels.submit_coupang_listing",
        ownerIdempotencyKey: executionContext.ownerIdempotencyKey,
        ownerRequestHash: canonicalOwnerInputHash(submissionInput),
      }),
    );
  });

  it("replays the completed Channels provider execution without another provider create", async () => {
    const executionContext = context(
      "channels.submit_coupang_listing",
      submissionInput,
    );
    const registrations = {
      reconcileProductRegistration: vi.fn(),
      submitProductRegistration: vi.fn(),
      resolveProductRegistrationWithOwnerReceipt: vi
        .fn()
        .mockResolvedValue({
          listingId: "00000000-0000-4000-8000-000000000008",
        }),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const executions = {
      claimProviderWrite: vi.fn().mockResolvedValue({
        mode: "replay",
        leaseToken: null,
        providerSubmissionId: "provider-submission",
        externalListingId: "provider-listing",
      }),
      finalizeProviderWrite: vi.fn(),
      markProviderWriteUncertain: vi.fn(),
      markProviderWriteDefinitiveFailure: vi.fn(),
    };
    const provenance = {
      loadSubmission: vi.fn().mockResolvedValue(frozen),
      loadExternalConfirmation: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: object) => unknown) =>
        work({ tx: true }),
      ),
    };
    const adapter = new ChannelsFinalCapabilityAdapter(
      registrations as never,
      provenance as never,
      prisma as never,
      executions as never,
    );

    await adapter.submitCoupangListing({
      context: executionContext,
      input: submissionInput,
    });

    expect(registrations.reconcileProductRegistration).not.toHaveBeenCalled();
    expect(registrations.submitProductRegistration).not.toHaveBeenCalled();
    expect(executions.finalizeProviderWrite).not.toHaveBeenCalled();
  });

  it("requires the exact derived owner key before loading or claiming a provider submission", async () => {
    const registrations = {
      reconcileProductRegistration: vi.fn(),
      submitProductRegistration: vi.fn(),
      resolveProductRegistrationWithOwnerReceipt: vi.fn(),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const executions = {
      claimProviderWrite: vi.fn(),
      finalizeProviderWrite: vi.fn(),
      markProviderWriteUncertain: vi.fn(),
      markProviderWriteDefinitiveFailure: vi.fn(),
    };
    const provenance = {
      loadSubmission: vi.fn(),
      loadExternalConfirmation: vi.fn(),
    };
    const prisma = { $transaction: vi.fn() };
    const adapter = new ChannelsFinalCapabilityAdapter(
      registrations as never,
      provenance as never,
      prisma as never,
      executions as never,
    );

    await expect(
      adapter.submitCoupangListing({
        context: {
          ...context("channels.submit_coupang_listing", submissionInput),
          ownerIdempotencyKey: "f".repeat(64),
        },
        input: submissionInput,
      }),
    ).rejects.toThrow("owner_idempotency_key_conflict");

    expect(provenance.loadSubmission).not.toHaveBeenCalled();
    expect(executions.claimProviderWrite).not.toHaveBeenCalled();
    expect(registrations.submitProductRegistration).not.toHaveBeenCalled();
  });

  it("validates external confirmation against server-loaded frozen provenance and resolves it behind a Channels receipt", async () => {
    const executionContext = context(
      "channels.register_confirmed_listing",
      confirmationInput,
    );
    const registrations = {
      reconcileProductRegistration: vi.fn(),
      submitProductRegistration: vi.fn(),
      resolveProductRegistrationWithOwnerReceipt: vi
        .fn()
        .mockResolvedValue({
          listingId: "00000000-0000-4000-8000-000000000008",
        }),
      assertExternalProductRegistrationAccount: vi
        .fn()
        .mockResolvedValue({ channel: "coupang", vendorId: "vendor-1" }),
    };
    const executions = {
      claimProviderWrite: vi.fn(),
      finalizeProviderWrite: vi.fn(),
      markProviderWriteUncertain: vi.fn(),
      markProviderWriteDefinitiveFailure: vi.fn(),
    };
    const provenance = {
      loadSubmission: vi.fn(),
      loadExternalConfirmation: vi.fn().mockResolvedValue({
        ...frozen,
        expectedProviderAccountId: "vendor-1",
      }),
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: object) => unknown) =>
        work({ tx: true }),
      ),
    };
    const adapter = new ChannelsFinalCapabilityAdapter(
      registrations as never,
      provenance as never,
      prisma as never,
      executions as never,
    );

    await expect(
      adapter.registerConfirmedListing({
        context: executionContext,
        input: confirmationInput,
      }),
    ).resolves.toEqual({
      preparationId: submissionInput.preparationId,
      listingId: "00000000-0000-4000-8000-000000000008",
      status: "registered",
    });

    expect(provenance.loadExternalConfirmation).toHaveBeenCalledWith({
      organizationId: executionContext.organizationId,
      initiatingUserId: executionContext.initiatingUserId,
      ...submissionInput,
    });
    expect(
      registrations.assertExternalProductRegistrationAccount,
    ).toHaveBeenCalledWith({
      organizationId: executionContext.organizationId,
      channelAccountId: frozen.channelAccountId,
    });
    expect(
      registrations.resolveProductRegistrationWithOwnerReceipt,
    ).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        externalListingId: confirmationInput.externalListingId,
        displayName: frozen.displayName,
        ownerCapabilityKey: "channels.register_confirmed_listing",
        ownerIdempotencyKey: executionContext.ownerIdempotencyKey,
        ownerRequestHash: canonicalOwnerInputHash(confirmationInput),
      }),
    );
  });

  it("rejects a changed confirmed-listing input with the original owner key before listing resolution", async () => {
    const registrations = {
      reconcileProductRegistration: vi.fn(),
      submitProductRegistration: vi.fn(),
      resolveProductRegistrationWithOwnerReceipt: vi.fn(),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const executions = {
      claimProviderWrite: vi.fn(),
      finalizeProviderWrite: vi.fn(),
      markProviderWriteUncertain: vi.fn(),
      markProviderWriteDefinitiveFailure: vi.fn(),
    };
    const provenance = {
      loadSubmission: vi.fn(),
      loadExternalConfirmation: vi.fn(),
    };
    const prisma = { $transaction: vi.fn() };
    const adapter = new ChannelsFinalCapabilityAdapter(
      registrations as never,
      provenance as never,
      prisma as never,
      executions as never,
    );
    const changed = {
      ...confirmationInput,
      externalListingId: "provider-listing-changed",
    };

    await expect(
      adapter.registerConfirmedListing({
        context: context(
          "channels.register_confirmed_listing",
          confirmationInput,
        ),
        input: changed,
      }),
    ).rejects.toThrow("owner_idempotency_key_conflict");

    expect(provenance.loadExternalConfirmation).not.toHaveBeenCalled();
    expect(
      registrations.resolveProductRegistrationWithOwnerReceipt,
    ).not.toHaveBeenCalled();
  });
});
