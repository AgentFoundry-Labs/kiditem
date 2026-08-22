export const AGENT_SESSION_DELETION_EXECUTION_TRANSACTION = Symbol(
  "AGENT_SESSION_DELETION_EXECUTION_TRANSACTION",
);

export interface AgentSessionDeletionRuntimeAttempt {
  executionId: string;
  attemptId: string;
  runtimeType: string;
  state: "never_started" | "started";
  startIntentId?: string;
  handle?: {
    runtimeType: string; executionId: string; attemptId: string;
    externalRunId: string; encryptedHandleRef: string; generation: number;
  } | null;
}

export interface AgentSessionDeletionExecutionSnapshot {
  retryGeneration: number;
  consumedAttempts: number;
  runtimeAttempts: AgentSessionDeletionRuntimeAttempt[];
  operationRuns: unknown[];
  operationRunIds: string[];
  artifacts: Array<{ artifactId: string; materializationOperationRunId: string; providerUploadId: string | null; key?: string }>;
  closureDigest: string;
}

export interface AgentSessionDeletionExecutionTransactionPort {
  loadFencedSnapshot(input: {
    signal: AbortSignal; organizationId: string; sessionId: string;
    operationRunId: string; attemptToken: string;
  }): Promise<AgentSessionDeletionExecutionSnapshot | { kind: "retryable"; code: string; consumedAttempts: number }>;
  terminalizeOwnedRun(input: {
    organizationId: string; sessionId: string; operationRunId: string;
    deletionOperationRunId: string; attemptToken: string;
  }): Promise<void>;
}
