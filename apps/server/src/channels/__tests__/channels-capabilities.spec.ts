import { describe, expect, it } from "vitest";
import { CHANNELS_CAPABILITIES } from "../domain/capability/channels.capabilities";

describe("Channels final capability definitions", () => {
  it("owns only browser-confirmed marketplace mutations with real strict schemas", () => {
    expect(CHANNELS_CAPABILITIES.map((capability) => capability.key)).toEqual([
      "channels.register_confirmed_listing",
      "channels.submit_wing_thumbnail",
    ]);
    for (const capability of CHANNELS_CAPABILITIES) {
      expect(capability.ownerDomain).toBe("channels");
      expect(
        capability.inputSchema.safeParse({ organizationId: "forged" }).success,
      ).toBe(false);
      expect(capability.outputSchema.safeParse({}).success).toBe(false);
      expect(capability.idempotency).toBe("required");
    }
  });

  it("accepts only the minimal registration reference and user confirmation evidence", () => {
    const confirmation = CHANNELS_CAPABILITIES.find(
      (item) => item.key === "channels.register_confirmed_listing",
    )!;
    const reference = {
      registrationExecutionId: "00000000-0000-4000-8000-000000000011",
      preparationId: "00000000-0000-4000-8000-000000000012",
    };

    expect(
      confirmation.inputSchema.safeParse({
        ...reference,
        externalListingId: "external-listing-1",
        confirmationEvidence: {
          wingVendorId: "vendor-1",
          wingIdentitySource: "dom:data-vendor-id",
        },
      }).success,
    ).toBe(true);

    for (const [field, value] of Object.entries({
      sourceCandidateId: "00000000-0000-4000-8000-000000000013",
      channelAccountId: "00000000-0000-4000-8000-000000000014",
      submissionKey: "submission-key",
      submissionPayloadHash: "b".repeat(64),
      submissionPayloadJson: { sellerProductName: "Toy" },
      providerSubmissionId: "provider-submission",
      registrationResult: { externalListingId: "provider-listing" },
      isRetry: true,
      providerOutcome: "succeeded",
      providerCreateAllowed: true,
      masterProductId: "00000000-0000-4000-8000-000000000015",
      optionLinks: [],
      displayName: "Toy",
    })) {
      expect(
        confirmation.inputSchema.safeParse({
          ...reference,
          externalListingId: "external-listing-1",
          confirmationEvidence: {
            wingVendorId: "vendor-1",
            wingIdentitySource: "dom:data-vendor-id",
          },
          [field]: value,
        }).success,
      ).toBe(false);
    }
  });
});
