export const AGENT_SESSION_DELETION_EXECUTION_PORT = Symbol(
  "AGENT_SESSION_DELETION_EXECUTION_PORT",
);

export type AgentSessionDeletionExecutionResult =
  | { kind: "ready_for_graph_delete"; closureDigest: string }
  | { kind: "retryable"; code: string; consumedAttempts: number };

export interface AgentSessionDeletionExecutionPort {
  execute(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<AgentSessionDeletionExecutionResult>;
}
