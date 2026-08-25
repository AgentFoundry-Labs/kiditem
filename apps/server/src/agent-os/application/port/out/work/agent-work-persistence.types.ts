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

export interface AttemptSnapshot {
  input: unknown;
  applicationVersion: string;
  authorizingGitSha: string;
  cliVersion: string;
  reportedModel?: string;
}

export interface AdmitAttemptInput extends AttemptSnapshot {
  organizationId: string;
  sessionId: string;
  taskId: string;
  requestedByUserId: string;
  predecessorAttemptId: string;
  /** Command intent only; never persisted as Task state. */
  intent?: "follow_up" | "retry" | "reopen";
}

export interface AdmitAttemptResult {
  attemptId: string;
  taskId: string;
  sessionId: string;
  ordinal: number;
}

export interface AdmitRootAttemptInput extends AttemptSnapshot {
  organizationId: string;
  createdByUserId: string;
  assignedAgentVersionId: string;
  objective: string;
  completionCriteria: string;
  inputResourceRefs: unknown[];
  sessionId?: string;
}

export interface AdmitRootAttemptResult {
  session: OrganizationScopedId;
  task: OrganizationScopedId & { sessionId: string };
  attempt: { id: string; ordinal: number };
}

export interface DelegateTaskInput extends AttemptSnapshot {
  organizationId: string;
  sessionId: string;
  parentTaskId: string;
  delegatingAttemptId: string;
  requestedByUserId: string;
  targetAgentVersionId: string;
  objective: string;
  completionCriteria: string;
  inputResourceRefs: unknown[];
  idempotencyKey: string;
  requestHash: string;
}

export interface DelegateTaskResult {
  childTaskId: string;
  firstAttemptId: string;
  replayed: boolean;
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
  capabilityContractFingerprint: string;
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
  /** Immutable server-owned Attempt snapshot, never business input. */
  applicationVersion: string;
  authorizingGitSha: string;
  runtimeType: string;
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

/** Completion fence for a process-local read invocation. */
export interface InlineInvocationFinalizeInput {
  organizationId: string;
  invocationId: string;
  outcome: "succeeded" | "failed";
  result?: AgentResultEnvelope;
  error?: { code: string; message: string };
  finishedAt: Date;
}

export interface ReconciliationInput {
  applicationVersion: string;
  authorizingGitSha: string;
  now: Date;
}

export interface ReconciliationResult {
  reconciled: number;
  attemptIds: string[];
}

export interface TerminalSessionDeleteInput {
  organizationId: string;
  sessionId: string;
  deletedByUserId: string;
}

export interface TaskLifecycleTransitionInput {
  organizationId: string;
  sessionId: string;
  taskId: string;
  requestedByUserId: string;
  to: "completed" | "failed" | "cancelled";
  at: Date;
}

export interface AttemptLifecycleTransitionInput {
  attemptId: string;
  from: "starting" | "running";
  to: "running" | "succeeded" | "failed" | "process_interrupted" | "cancelled";
  at: Date;
  result?: AgentResultEnvelope;
  error?: { code: string; message: string };
}

export interface FinalizeTaskFromAttemptInput {
  attemptId: string;
  at: Date;
}
