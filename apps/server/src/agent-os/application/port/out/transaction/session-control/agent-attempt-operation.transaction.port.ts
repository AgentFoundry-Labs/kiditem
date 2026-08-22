import type { AgentSessionOperationContinuationRecord, ExecutionAttemptRecord } from '../../repository/session-control/agent-session-control.persistence.types';
export const AGENT_ATTEMPT_OPERATION_TRANSACTION = Symbol('AGENT_ATTEMPT_OPERATION_TRANSACTION');
export interface AgentAttemptOperationTransactionPort {
  findAttemptForOperation(input: { organizationId: string; operationRunId: string }): Promise<ExecutionAttemptRecord | null>;
  activateAttemptForOperation(input: { organizationId: string; sessionId: string; executionId: string; operationRunId: string }): Promise<ExecutionAttemptRecord>;
  startAttempt(input: { organizationId: string; sessionId: string; executionId: string; runtimeType: string; externalRunId?: string | null; encryptedHandleRef?: string | null; idempotencyKey: string }): Promise<ExecutionAttemptRecord>;
  persistAttemptHandle(input: { organizationId: string; sessionId: string; executionId: string; attemptId: string; runtimeType: string; externalRunId: string; encryptedHandleRef: string; runtimeGeneration: number }): Promise<ExecutionAttemptRecord>;
  persistRuntimeStartIntent(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    operationRunId: string;
    attemptToken: string;
    runtimeType: string;
    startIntentId: string;
  }): Promise<{ startIntentId: string; runtimeCredentialGeneration: number }>;
  finishAttempt(input: { organizationId: string; sessionId: string; executionId: string; attemptId: string; expectedState: string; state: 'succeeded' | 'failed' | 'cancelled'; errorCode?: string | null; errorMessage?: string | null }): Promise<ExecutionAttemptRecord>;
  continueOperationAttempt(input: { signal: AbortSignal; organizationId: string; sessionId: string; taskId: string; executionId: string; attemptId: string; predecessorOperationRunId: string; continuationKey: string }): Promise<AgentSessionOperationContinuationRecord>;
}
