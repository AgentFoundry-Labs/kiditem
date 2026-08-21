export const AGENT_SESSION_OWNED_OPERATION_PORT = Symbol(
  'AGENT_SESSION_OWNED_OPERATION_PORT',
);

/** The only API-composed entrypoint for session-originated Operation runs. */
export interface AgentSessionOwnedOperationPort {
  startExecution(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    operationKey: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; attemptId: string }>;

  startCapability(input: {
    organizationId: string;
    sessionId: string;
    operationKey: string;
    requestedByUserId: string | null;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string }>;
}
