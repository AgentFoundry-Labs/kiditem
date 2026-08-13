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
  state: string;
}

export interface ExecutionAttemptRecord {
  id: string;
  executionId: string;
  attemptNumber: number;
  runtimeType: string;
  state: string;
}

export interface SessionApprovalRecord {
  id: string;
  state: string;
  decisionIdempotencyKey: string | null;
}

export interface SessionArtifactRecord {
  id: string;
  sha256: string;
  lifecycle: string;
}

export interface AgentSessionControlRepositoryPort {
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
  }): Promise<DelegatedTaskRecord>;
  startAttempt(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    runtimeType: string;
    externalRunId?: string | null;
    encryptedHandleRef?: string | null;
    idempotencyKey: string;
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
}
