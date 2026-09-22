import { describe, expect, it, vi } from "vitest";
import { canonicalOwnerInputHash } from "../../../../common/owner-idempotency-key";
import { ownerTransaction } from "../../../../prisma/owner-transaction";
import { ChannelsFinalCapabilityAdapter } from "./channels-final-capability.adapter";

const confirmationInput = {
  registrationExecutionId: "00000000-0000-4000-8000-000000000004",
  preparationId: "00000000-0000-4000-8000-000000000005",
  externalListingId: "wing-listing",
  confirmationEvidence: {
    wingVendorId: "vendor-1",
    wingIdentitySource: "dom:data-vendor-id" as const,
  },
};

const frozen = {
  executionId: confirmationInput.registrationExecutionId,
  preparationId: confirmationInput.preparationId,
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
  expectedProviderAccountId: "vendor-1",
};

function context(input: typeof confirmationInput) {
  return {
    organizationId: "00000000-0000-4000-8000-000000000001",
    initiatingUserId: "00000000-0000-4000-8000-000000000002",
    executionId: "execution-1",
    ownerIdempotencyKey:
      "capability-invocation:00000000-0000-4000-8000-000000000099",
    ownerInputHash: canonicalOwnerInputHash(input),
  };
}

function makeAdapter() {
  const registrations = {
    resolveProductRegistrationWithOwnerReceipt: vi.fn().mockResolvedValue({
      listingId: "00000000-0000-4000-8000-000000000008",
    }),
    assertExternalProductRegistrationAccount: vi
      .fn()
      .mockResolvedValue({ channel: "coupang", vendorId: "vendor-1" }),
  };
  const provenance = {
    loadExternalConfirmation: vi.fn().mockResolvedValue(frozen),
  };
  const prismaTransaction = { tx: true };
  const issuedOwnerTransaction = ownerTransaction(prismaTransaction as never);
  const prisma = {
    $transaction: vi.fn(async (work: (tx: object) => unknown) =>
      work(prismaTransaction),
    ),
  };
  return {
    adapter: new ChannelsFinalCapabilityAdapter(
      registrations as never,
      provenance as never,
      prisma as never,
    ),
    registrations,
    provenance,
    issuedOwnerTransaction,
  };
}

describe("ChannelsFinalCapabilityAdapter", () => {
  it("validates external confirmation against server provenance and resolves it behind a Channels receipt", async () => {
    const { adapter, registrations, provenance, issuedOwnerTransaction } = makeAdapter();
    const executionContext = context(confirmationInput);

    await expect(
      adapter.registerConfirmedListing({
        context: executionContext,
        input: confirmationInput,
      }),
    ).resolves.toEqual({
      preparationId: confirmationInput.preparationId,
      listingId: "00000000-0000-4000-8000-000000000008",
      status: "registered",
    });

    expect(provenance.loadExternalConfirmation).toHaveBeenCalledWith({
      organizationId: executionContext.organizationId,
      initiatingUserId: executionContext.initiatingUserId,
      executionId: confirmationInput.registrationExecutionId,
      preparationId: confirmationInput.preparationId,
    });
    expect(registrations.assertExternalProductRegistrationAccount).toHaveBeenCalledWith({
      organizationId: executionContext.organizationId,
      channelAccountId: frozen.channelAccountId,
    });
    expect(registrations.resolveProductRegistrationWithOwnerReceipt).toHaveBeenCalledWith(
      issuedOwnerTransaction,
      expect.objectContaining({
        externalListingId: confirmationInput.externalListingId,
        displayName: frozen.displayName,
        ownerCapabilityKey: "channels.register_confirmed_listing",
        ownerIdempotencyKey: executionContext.ownerIdempotencyKey,
        ownerRequestHash: canonicalOwnerInputHash(confirmationInput),
      }),
    );
  });

  it("rejects changed confirmed-listing input before loading or resolving it", async () => {
    const { adapter, registrations, provenance } = makeAdapter();
    const original = context(confirmationInput);
    const changed = { ...confirmationInput, externalListingId: "changed" };

    await expect(
      adapter.registerConfirmedListing({
        context: original,
        input: changed,
      }),
    ).rejects.toThrow("owner_idempotency_key_conflict");

    expect(provenance.loadExternalConfirmation).not.toHaveBeenCalled();
    expect(registrations.resolveProductRegistrationWithOwnerReceipt).not.toHaveBeenCalled();
  });
});
