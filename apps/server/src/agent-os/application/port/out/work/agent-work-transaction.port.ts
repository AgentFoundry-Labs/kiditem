import type {
  AgentCapabilityApprovalStatus,
  AgentCapabilityInvocationStatus,
  AgentResultEnvelope,
  AuthorizationKind,
  CapabilityIdempotency,
} from "@kiditem/shared/agent-interaction";
import type {
  CapabilityApprovalRisk,
  CapabilityEffect,
} from "../../../../domain/capability/capability-definition";
import type { OrganizationScopedId } from "./agent-work-repository.port";

export const AGENT_WORK_TRANSACTION_PORT = Symbol(
  "AGENT_WORK_TRANSACTION_PORT",
);
export interface AdmitRootTaskInput {
  organizationId: string;
  createdByUserId: string;
  assignedAgentVersionId: string;
  objective: string;
  completionCriteria: string;
  inputResourceRefs: unknown[];
  sessionId?: string;
}
export interface AdmitRootTaskResult {
  session: OrganizationScopedId;
  task: OrganizationScopedId & { sessionId: string };
}
export interface InvocationAuthorizationInput {
  organizationId: string;
  sessionId: string;
  taskId: string;
  attemptId: string;
  agentVersionId: string;
  initiatingUserId: string;
  capabilityKey: string;
  ownerDomain: string;
  authorizationKind: AuthorizationKind;
  authorizationExpiresAt: Date;
  inputHash: string;
  canonicalInput?: unknown;
  effects: readonly CapabilityEffect[];
  approvalRisk: CapabilityApprovalRisk;
  idempotencyRequirement: CapabilityIdempotency;
  ownerIdempotencyKey?: string;
  applicationVersion: string;
  authorizingGitSha: string;
  capabilityContractFingerprint: string;
  runtimeType: string;
  reportedModel?: string;
  initialStatus: "authorized" | "approval_pending" | "ready";
  approval?: {
    inputHash: string;
    status: "pending";
    expiresAt: Date;
    createdAt: Date;
  };
}
export interface InvocationAuthorizationResult {
  invocationId: string;
  approvalId: string | null;
  invocationStatus: AgentCapabilityInvocationStatus;
  approvalStatus: AgentCapabilityApprovalStatus | null;
}
export interface ApprovalDecisionInput {
  organizationId: string;
  sessionId: string;
  invocationId: string;
  approvalId: string;
  inputHash: string;
  decision: "approved" | "rejected";
  decidedByUserId: string;
  decisionReason?: string;
  decidedAt: Date;
}
export interface ApprovalDecisionResult {
  approvalStatus: "approved" | "rejected";
  invocationStatus: AgentCapabilityInvocationStatus;
}
export interface ApprovalExpiryInput {
  organizationId: string;
  sessionId: string;
  invocationId: string;
  approvalId: string;
  inputHash: string;
  expiredAt: Date;
}
export interface MutationClaimInput {
  organizationId: string;
  invocationId: string;
  workerId: string;
  claimedAt: Date;
  leaseExpiresAt: Date;
}
export interface MutationWorkSnapshot {
  invocationId: string;
  organizationId: string;
  sessionId: string;
  taskId: string;
  attemptId: string;
  agentVersionId: string;
  initiatingUserId: string;
  capabilityKey: string;
  ownerDomain: string;
  authorizationKind: AuthorizationKind;
  authorizationExpiresAt: Date;
  inputHash: string;
  canonicalInput: unknown;
  effects: readonly CapabilityEffect[];
  approvalRisk: CapabilityApprovalRisk;
  idempotencyRequirement: CapabilityIdempotency;
  ownerIdempotencyKey: string;
  applicationVersion: string;
  authorizingGitSha: string;
  capabilityContractFingerprint: string;
  runtimeType: string;
  reportedModel: string | null;
  attemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}
export interface MutationFinalizeInput {
  organizationId: string;
  invocationId: string;
  leaseOwner: string;
  outcome: "succeeded" | "failed";
  result?: AgentResultEnvelope;
  error?: { code: string; message: string };
  finishedAt: Date;
}
export interface ReconciliationInput {
  organizationId: string;
  applicationVersion: string;
  authorizingGitSha: string;
  now: Date;
}
export interface TerminalSessionDeleteInput {
  organizationId: string;
  sessionId: string;
  deletedByUserId: string;
}

/** Future atomic command shapes; Task 1 intentionally implements admission only. */
export interface AgentWorkTransactionPort {
  admitRootTask(input: AdmitRootTaskInput): Promise<AdmitRootTaskResult>;
  authorizeInvocation(
    input: InvocationAuthorizationInput,
  ): Promise<InvocationAuthorizationResult>;
  decideApproval(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult>;
  expireApproval(input: ApprovalExpiryInput): Promise<{ won: boolean }>;
  claimMutation(
    input: MutationClaimInput,
  ): Promise<MutationWorkSnapshot | null>;
  finalizeMutation(input: MutationFinalizeInput): Promise<{ won: boolean }>;
  reconcile(input: ReconciliationInput): Promise<{ reconciled: number }>;
  deleteTerminalSession(
    input: TerminalSessionDeleteInput,
  ): Promise<{ deleted: boolean }>;
}
