import type { AgentSessionOperationDefinitionSnapshot } from '../../operation/agent-session-operation-platform.port';

export const AGENT_SESSION_OWNED_OPERATION_TRANSACTION = Symbol(
  'AGENT_SESSION_OWNED_OPERATION_TRANSACTION',
);

export interface AgentSessionOwnedOperationTransactionPort {
  createExecutionRun(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
  }): Promise<{ operationRunId: string; attemptId: string }>;

  createCapabilityRun(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
  }): Promise<{ operationRunId: string }>;
}
