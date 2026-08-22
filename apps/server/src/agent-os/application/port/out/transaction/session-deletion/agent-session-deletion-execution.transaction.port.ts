import type { RuntimeHandle } from '../../runtime/agent-durable-runtime.port';

export const AGENT_SESSION_DELETION_EXECUTION_TRANSACTION = Symbol(
  'AGENT_SESSION_DELETION_EXECUTION_TRANSACTION',
);

export const AGENT_SESSION_DELETION_FAILURE_CODES = [
  'SESSION_DELETION_INVARIANT',
  'SESSION_OPERATION_OWNERSHIP_INVALID',
  'RUNTIME_CLEANUP_UNKNOWN',
  'ARTIFACT_WRITER_NOT_FENCED',
  'STORAGE_DELETE_PRESENT',
  'STORAGE_DELETE_UNKNOWN',
] as const;

export type AgentSessionDeletionFailureCode =
  (typeof AGENT_SESSION_DELETION_FAILURE_CODES)[number];

export interface ScopedDeletionAttempt {
  signal: AbortSignal;
  organizationId: string;
  sessionId: string;
  operationRunId: string;
  attemptToken: string;
}

export type RuntimeCleanupCoordinate =
  | {
      executionId: string;
      attemptId: string;
      runtimeType: string;
      state: 'never_started';
    }
  | {
      executionId: string;
      attemptId: string;
      runtimeType: string;
      state: 'started';
      startIntentId: string;
      handle: RuntimeHandle | null;
    };

export interface OwnedOperationCleanupCoordinate {
  runId: string;
  operationKey: string;
  status: string;
  expectedAttemptToken: string | null;
  nativeRunType: string | null;
  nativeRunId: string | null;
}

export interface MaterializingArtifactDeletionCoordinate {
  artifactId: string;
  materializationOperationRunId: string;
  providerUploadId: string | null;
}

export interface AgentSessionDeletionExecutionSnapshot {
  retryGeneration: number;
  consumedAttempts: number;
  runtimeAttempts: readonly RuntimeCleanupCoordinate[];
  operationRuns: readonly OwnedOperationCleanupCoordinate[];
  /** Derived only for the in-process writer fence; never an authority input. */
  operationRunIds: readonly string[];
  artifacts: readonly MaterializingArtifactDeletionCoordinate[];
  closureDigest: string;
}

export type AgentSessionDeletionSnapshotResult =
  | { kind: 'ready'; snapshot: AgentSessionDeletionExecutionSnapshot }
  | {
      kind: 'retryable';
      code: AgentSessionDeletionFailureCode;
      consumedAttempts: number;
    };

export interface AgentSessionDeletionExecutionTransactionPort {
  loadFencedSnapshot(
    input: ScopedDeletionAttempt,
  ): Promise<AgentSessionDeletionSnapshotResult>;
  terminalizeOwnedRun(
    input: ScopedDeletionAttempt & { ownedOperationRunId: string },
  ): Promise<void>;
}
