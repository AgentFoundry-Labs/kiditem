export const AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT = Symbol(
  "AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT",
);

export interface AgentSessionOwnedOperationControlPort {
  fenceAndCancel(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }): Promise<{ state: "fenced" } | { state: "unknown"; code: "SESSION_OPERATION_OWNERSHIP_INVALID" }>;
}
