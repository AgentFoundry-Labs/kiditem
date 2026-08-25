import type {
  ApprovalDecisionInput,
  ApprovalDecisionResult,
  ApprovalExpiryInput,
  InlineInvocationFinalizeInput,
  InvocationAuthorizationInput,
  InvocationAuthorizationResult,
} from "./agent-work-persistence.types";

export const AGENT_WORK_INVOCATION_APPROVAL_PORT = Symbol(
  "AGENT_WORK_INVOCATION_APPROVAL_PORT",
);

/**
 * Durable capability invocation and human-approval seam. It owns immutable
 * authorization snapshots and every approval/inline-completion transition.
 */
export interface AgentWorkInvocationApprovalPort {
  authorizeInvocation(
    input: InvocationAuthorizationInput,
  ): Promise<InvocationAuthorizationResult>;
  decideApproval(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult>;
  expireApproval(input: ApprovalExpiryInput): Promise<{ won: boolean }>;
  /** Reads run live, while this seam keeps their result terminally durable. */
  finalizeInlineInvocation(
    input: InlineInvocationFinalizeInput,
  ): Promise<{ won: boolean }>;
}
