/** Server-owned action boundary used by the Attempt-local MCP proxy. */
export const ATTEMPT_MCP_ACTIONS_PORT = Symbol('ATTEMPT_MCP_ACTIONS_PORT');

export interface AttemptMcpBinding {
  attemptId: string;
  sessionId: string;
  taskId: string;
  agentVersionId: string;
  organizationId: string;
  userId: string;
  capabilityKeys: readonly string[];
}

export interface AttemptMcpActionsPort {
  /** Revalidates the exact durable Attempt coordinate before MCP server creation. */
  assertBinding(binding: AttemptMcpBinding): Promise<void>;
  catalog(input: { binding: AttemptMcpBinding; query?: string }): Promise<Array<{
    key: string; ownerDomain: string; description: string; inputSchema: unknown;
    effects: readonly string[]; approvalRisk: string; idempotency: string;
  }>>;
  invoke(input: {
    invocationId: string;
    binding: AttemptMcpBinding;
    capabilityKey: string;
    input: Record<string, unknown>;
  }): Promise<unknown>;
  /** Bounded durable result lookup for a live Attempt awaiting HITL/worker work. */
  invocation(input: {
    binding: AttemptMcpBinding;
    action: 'status' | 'wait' | 'result';
    invocationId: string;
  }): Promise<unknown>;
  delegate(input: {
    binding: AttemptMcpBinding;
    targetAgentKey: string;
    objective: string;
    /**
     * A cross-domain mutation is never an implicit delegation. The caller
     * selects both the owning capability and its exact strict input so the
     * child admission and durable invocation fence the same canonical work.
     */
    capabilityKey?: string;
    input?: Record<string, unknown>;
  }): Promise<unknown>;
  child(input: {
    binding: AttemptMcpBinding;
    action: 'status' | 'wait' | 'result' | 'message' | 'interrupt';
    childTaskId: string;
    message?: string;
  }): Promise<unknown>;
}
