export const CAPABILITY_APPROVAL_EVENT_PORT = Symbol('CAPABILITY_APPROVAL_EVENT_PORT');

export interface CapabilityApprovalEventInput {
  organizationId: string;
  initiatingUserId: string;
  conversationId: string;
  turnId: string;
  invocationId: string;
}

/** Publishes only the safe approval locator into the current interaction stream. */
export interface CapabilityApprovalEventPort {
  publish(input: CapabilityApprovalEventInput): void;
}
