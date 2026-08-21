export class AgentSessionControlRepositoryError extends Error {
  constructor(
    readonly code:
      | 'AGENT_SESSION_CONTROL_SCOPE_INVALID'
      | 'AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT'
      | 'AGENT_SESSION_CONTROL_STATE_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'AgentSessionControlRepositoryError';
  }
}

export interface DelegatedTaskRecord {
  delegationId: string;
  childTaskId: string;
  childExecutionId: string;
  state: string;
}

export interface DelegationContextRecord {
  sessionLifecycle: string;
  taskStatus: string;
  parentAgentVersionId: string;
  parentExecutionId: string;
  parentDepth: number;
  childCount: number;
  parentManifest: unknown;
  targetAgentVersionId: string;
  targetDefinitionKey: string;
  targetCapabilityKeys: unknown;
  activeTarget: boolean;
  parentPolicyCapabilityKeys: unknown;
}

export interface ExecutionAttemptRecord {
  id: string;
  executionId: string;
  attemptNumber: number;
  runtimeType: string;
  externalRunId: string | null;
  encryptedHandleRef: string | null;
  runtimeGeneration: number;
  state: string;
}

export interface SessionApprovalRecord {
  id: string;
  state: string;
  decisionIdempotencyKey: string | null;
  changed: boolean;
}

export interface SessionApprovalDetailRecord {
  id: string;
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  attemptId: string;
  operationBindingId: string;
  operationRunId: string | null;
  capabilityKey: string;
  argumentsHash: string;
  resourceSnapshot: unknown[];
  state: string;
  decisionIdempotencyKey: string | null;
  expiresAt: Date;
  requestedByUserId: string;
  runtimeType: string;
  externalRunId: string | null;
  encryptedHandleRef: string | null;
  runtimeGeneration: number;
}

export interface AgentSessionApprovalContinuationRecord {
  approvalId: string;
  operationRunId: string;
  attemptId: string;
  runtimeType: string;
  executionId: string;
  externalRunId: string;
  encryptedHandleRef: string;
  runtimeGeneration: number;
  state: 'successor_created' | 'interrupt_delivered';
}

export interface IncompleteApprovalContinuationRecord {
  organizationId: string;
  sessionId: string;
  approvalId: string;
}

export interface SessionTaskExecutionRecord {
  organizationId: string;
  sessionId: string;
  taskId: string;
  taskStatus: string;
  executionId: string;
  executionStatus: string;
  runtimeType: string;
  requestedByUserId: string;
  operationRunId: string | null;
}

export interface SessionArtifactRecord {
  id: string;
  sha256: string;
  lifecycle: string;
}

export interface AgentSessionOperationContinuationRecord {
  operationRunId: string;
  attemptId: string;
}

export interface AgentSessionLifecycleRecoveryRecord {
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  attemptId: string;
  predecessorOperationRunId: string;
}
