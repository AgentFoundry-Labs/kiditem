export const AGENT_SESSION_CONTROL_REPOSITORY = Symbol(
  'AGENT_SESSION_CONTROL_REPOSITORY',
);

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
  operationRunId: string | null;
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

export interface AgentSessionControlRepositoryPort {
  isExecutionCapabilityAllowed(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    capabilityKey: string;
  }): Promise<boolean>;
  loadDelegationContext(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    parentExecutionId: string;
    targetAgentDefinitionKey: string;
  }): Promise<DelegationContextRecord | null>;
  createDelegatedTask(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    fromAgentVersionId: string;
    toAgentVersionId: string;
    objective: string;
    authoritySubset: string[];
    depth: number;
    idempotencyKey: string;
    parentExecutionId?: string;
    targetAgentDefinitionKey?: string;
    maxDepth?: number;
    maxChildrenPerTask?: number;
  }): Promise<DelegatedTaskRecord>;
  reserveAttemptForOperation(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    operationRunId: string;
    idempotencyKey: string;
  }): Promise<ExecutionAttemptRecord>;
  findAttemptForOperation(input: {
    organizationId: string;
    operationRunId: string;
  }): Promise<ExecutionAttemptRecord | null>;
  startAttempt(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    runtimeType: string;
    externalRunId?: string | null;
    encryptedHandleRef?: string | null;
    operationRunId?: string | null;
    idempotencyKey: string;
  }): Promise<ExecutionAttemptRecord>;
  persistAttemptHandle(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    runtimeType: string;
    externalRunId: string;
    encryptedHandleRef: string;
    runtimeGeneration: number;
  }): Promise<ExecutionAttemptRecord>;
  finishAttempt(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    expectedState: string;
    state: 'succeeded' | 'failed' | 'cancelled';
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<ExecutionAttemptRecord>;
  requestApproval(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    attemptId: string;
    capabilityKey: string;
    argumentsHash: string;
    resourceSnapshot: unknown[];
    expiresAt: Date;
    idempotencyKey: string;
  }): Promise<SessionApprovalRecord>;
  decideApproval(input: {
    organizationId: string;
    sessionId: string;
    approvalId: string;
    expectedState: 'pending';
    decision: 'approved' | 'rejected';
    actorType: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<SessionApprovalRecord>;
  loadApproval(input: {
    organizationId: string;
    sessionId: string;
    approvalId: string;
  }): Promise<SessionApprovalDetailRecord | null>;
  expireApproval(input: {
    organizationId: string;
    sessionId: string;
    approvalId: string;
    expectedState: 'pending';
  }): Promise<SessionApprovalRecord>;
  appendArtifact(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    artifactType: string;
    storageReference: string;
    sha256: string;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<SessionArtifactRecord>;
  transitionTask(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    expectedState: string;
    state: string;
  }): Promise<{ id: string; status: string }>;
  transitionSession(input: {
    organizationId: string;
    sessionId: string;
    expectedState: string;
    state: string;
  }): Promise<{ id: string; lifecycle: string }>;
  findTask(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
  }): Promise<{ id: string; status: string } | null>;
  findSession(input: {
    organizationId: string;
    sessionId: string;
  }): Promise<{ id: string; lifecycle: string } | null>;
  loadTaskExecution(input: {
    organizationId: string;
    actorId: string;
    sessionId: string;
    taskId: string;
  }): Promise<SessionTaskExecutionRecord | null>;
  loadCancelableTask(input: {
    organizationId: string;
    actorId: string;
    sessionId: string;
    taskId: string;
    expectedStatus: 'queued' | 'running' | 'waiting_dependency' | 'waiting_approval' | 'paused';
  }): Promise<Pick<SessionTaskExecutionRecord, 'organizationId' | 'sessionId' | 'taskId' | 'operationRunId'> | null>;
  createRetryExecution(input: {
    organizationId: string;
    actorId: string;
    sessionId: string;
    taskId: string;
    expectedStatus: 'failed' | 'paused' | 'waiting_dependency';
    idempotencyKey: string;
  }): Promise<SessionTaskExecutionRecord>;
}
