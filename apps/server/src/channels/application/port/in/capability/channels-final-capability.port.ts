/** Channels-owned final input contract; Sourcing provenance is an adapter concern. */
export const CHANNELS_FINAL_CAPABILITY_PORT = Symbol('CHANNELS_FINAL_CAPABILITY_PORT');

export interface ChannelsOwnerExecutionContext {
  organizationId: string;
  initiatingUserId: string;
  sessionId: string;
  taskId: string;
  attemptId: string;
  agentVersionId: string;
  ownerIdempotencyKey?: string;
  applicationVersion: string;
  authorizingGitSha: string;
  runtimeType: string;
}

export interface ChannelsFrozenSubmissionInput {
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
  providerOutcome: 'not_attempted' | 'uncertain' | 'succeeded' | 'definitive_failure';
  providerCreateAllowed: boolean;
  masterProductId?: string;
  optionLinks: Array<{ externalOptionId: string; sellpiaInventorySkuId: string; quantity: number }>;
}

export interface ChannelsFrozenConfirmationInput extends ChannelsFrozenSubmissionInput {
  externalListingId: string;
  displayName: string;
  confirmationEvidence: {
    wingVendorId: string;
    wingIdentitySource: 'dom:data-vendor-id' | 'meta:vendor-id' | 'url:vendorId' | 'dom:vendor-code-label' | 'dom:inline-script';
  };
}

export interface ChannelsFinalCapabilityPort {
  submitCoupangListing(request: { context: ChannelsOwnerExecutionContext; input: ChannelsFrozenSubmissionInput }): Promise<{ preparationId: string; listingId: string | null; status: 'registered' | 'failed' }>;
  registerConfirmedListing(request: { context: ChannelsOwnerExecutionContext; input: ChannelsFrozenConfirmationInput }): Promise<{ preparationId: string; listingId: string | null; status: 'registered' | 'failed' }>;
}
