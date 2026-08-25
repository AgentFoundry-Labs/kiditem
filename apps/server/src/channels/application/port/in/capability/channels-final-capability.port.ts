/** Channels owns provider submission and ChannelListing mutation. */
export const CHANNELS_FINAL_CAPABILITY_PORT = Symbol(
  "CHANNELS_FINAL_CAPABILITY_PORT",
);

export interface ChannelsOwnerExecutionContext {
  organizationId: string;
  initiatingUserId: string;
  /** Process-memory execution binding; never a business or persistence id. */
  executionId: string;
  /** Invocation-derived opaque owner key, passed unchanged to Channels. */
  ownerIdempotencyKey: string;
  /** Exact SHA-256 of canonical parsed business input. */
  ownerInputHash: string;
}

/** Minimal Agent-facing business reference; all provider state loads server-side. */
export interface ChannelsRegistrationReference {
  /** Frozen ProductRegistrationExecution business coordinate, not the live execution binding. */
  registrationExecutionId: string;
  preparationId: string;
}

export interface ChannelsConfirmationEvidence {
  wingVendorId: string;
  wingIdentitySource:
    | "dom:data-vendor-id"
    | "meta:vendor-id"
    | "url:vendorId"
    | "dom:vendor-code-label"
    | "dom:inline-script";
}

export interface ChannelsConfirmedListingInput extends ChannelsRegistrationReference {
  externalListingId: string;
  confirmationEvidence: ChannelsConfirmationEvidence;
}

export interface ChannelsFinalCapabilityPort {
  submitCoupangListing(request: {
    context: ChannelsOwnerExecutionContext;
    input: ChannelsRegistrationReference;
  }): Promise<{
    preparationId: string;
    listingId: string | null;
    status: "registered" | "failed";
  }>;
  registerConfirmedListing(request: {
    context: ChannelsOwnerExecutionContext;
    input: ChannelsConfirmedListingInput;
  }): Promise<{
    preparationId: string;
    listingId: string | null;
    status: "registered" | "failed";
  }>;
}
