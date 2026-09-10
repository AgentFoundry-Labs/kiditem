/** Channels owns browser-confirmed ChannelListing mutation. */
export const CHANNELS_FINAL_CAPABILITY_PORT = Symbol(
  "CHANNELS_FINAL_CAPABILITY_PORT",
);

export interface ChannelsOwnerExecutionContext {
  organizationId: string;
  initiatingUserId: string;
  /** Server-derived correlation: a live-turn ID or admitted Invocation ID, never business authority. */
  executionId: string;
  /** Invocation-derived opaque owner key, passed unchanged to Channels. */
  ownerIdempotencyKey: string;
  /** Exact SHA-256 of canonical parsed business input. */
  ownerInputHash: string;
}

/** Minimal Agent-facing business reference; all provider state loads server-side. */
export interface ChannelsRegistrationReference {
  /** Frozen ProductRegistrationExecution business coordinate, not a live turn coordinate. */
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
  registerConfirmedListing(request: {
    context: ChannelsOwnerExecutionContext;
    input: ChannelsConfirmedListingInput;
  }): Promise<{
    preparationId: string;
    listingId: string | null;
    status: "registered" | "failed";
  }>;
}
