export const AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION = Symbol(
  'AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION',
);

export interface DeletionFinalizerCandidate {
  organizationId: string;
  sessionId: string;
  currentOperationRunId: string;
}

export interface InterruptedDeletionCandidate {
  organizationId: string;
  sessionId: string;
  currentOperationRunId: string;
  retryGeneration: number;
  consumedAttempts: number;
}

export interface AgentSessionDeletionFinalizationTransactionPort {
  purgeGraphDeletedLineage(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    currentOperationRunId: string;
    expectedAttemptToken: string | null;
  }): Promise<void>;
  listGraphDeletedFinalizers(input: {
    limit: number;
  }): Promise<readonly DeletionFinalizerCandidate[]>;
  listInterruptedDeletions(input: {
    limit: number;
  }): Promise<readonly InterruptedDeletionCandidate[]>;
  continueInterruptedDeletion(
    input: InterruptedDeletionCandidate,
  ): Promise<'continued' | 'failed'>;
}
