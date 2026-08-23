/** Server-owned action boundary used by the Attempt-local MCP proxy. */
export const ATTEMPT_MCP_ACTIONS_PORT = Symbol('ATTEMPT_MCP_ACTIONS_PORT');

export interface AttemptMcpBinding {
  socketPath: string;
  attemptId: string;
  sessionId: string;
  taskId: string;
  agentVersionId: string;
  organizationId: string;
  userId: string;
  processGroupId: number;
  capabilityKeys: readonly string[];
}

export interface AttemptMcpActionsPort {
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
  delegate(input: {
    binding: AttemptMcpBinding;
    targetAgentKey: string;
    objective: string;
  }): Promise<unknown>;
  child(input: {
    binding: AttemptMcpBinding;
    action: 'status' | 'wait' | 'result' | 'message' | 'interrupt';
    childTaskId: string;
    message?: string;
  }): Promise<unknown>;
}
