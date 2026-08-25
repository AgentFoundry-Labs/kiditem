import type {
  CapabilityInvocationApprovalStatus,
  CapabilityInvocationStatus,
  CapabilityResultEnvelope,
} from '@kiditem/shared/agent-interaction';

export const CAPABILITY_INVOCATION_PORT = Symbol('CAPABILITY_INVOCATION_PORT');
export const CAPABILITY_APPROVAL_PORT = Symbol('CAPABILITY_APPROVAL_PORT');

/** Transport metadata only; owner business schemas never contain these fields. */
export interface InvokeCapabilityInput {
  organizationId: string;
  initiatingUserId: string;
  /** Live, process-memory provider execution coordinate. */
  executionId: string;
  capabilityKey: string;
  requestKey?: string;
  actingAgentKey?: string;
  input: unknown;
}

export type CapabilityInvocationResult =
  | {
      kind: 'completed';
      invocationId?: string;
      status?: CapabilityInvocationStatus;
      result: CapabilityResultEnvelope;
    }
  | {
      kind: 'input_required';
      invocationId: string;
      status: 'pending';
      approvalStatus: 'pending';
      approvalExpiresAt: Date;
    };

export interface CapabilityInvocationPort extends CapabilityInvocationQueryPort {
  invoke(input: InvokeCapabilityInput): Promise<CapabilityInvocationResult>;
}

export interface GetCapabilityInvocationInput {
  organizationId: string;
  invocationId: string;
}

export interface CapabilityInvocationQueryPort {
  /** Internal capability/MCP status read; never serialize this record to Web. */
  get(input: GetCapabilityInvocationInput): Promise<unknown>;
  /** Allowlisted authenticated Web receipt, with current code-owned approval risk. */
  getReceipt(input: GetCapabilityInvocationInput): Promise<unknown>;
}

export interface DecideCapabilityApprovalInput {
  organizationId: string;
  userId: string;
  invocationId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

export interface CapabilityApprovalPort {
  decide(input: DecideCapabilityApprovalInput): Promise<unknown>;
}

export type CapabilityInvocationApprovalReceipt = {
  id: string;
  status: CapabilityInvocationStatus;
  approvalStatus: CapabilityInvocationApprovalStatus;
  inputHash: string;
};
