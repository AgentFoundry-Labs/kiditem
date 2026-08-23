export const AGENT_OS_MCP_TOOL_EXECUTION_PORT = Symbol('AGENT_OS_MCP_TOOL_EXECUTION_PORT');

export interface AgentOsMcpExecutionContextPort {
  organizationId: string;
  sessionId: string;
  executionId: string;
  attemptId: string;
  startIntentId: string;
  /** Persisted revocation epoch checked against the current attempt row. */
  runtimeCredentialGeneration: number;
}

export interface AgentOsMcpToolExecutionPort {
  execute(input: {
    context: AgentOsMcpExecutionContextPort;
    toolName: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
  listAvailableTools(
    context: AgentOsMcpExecutionContextPort,
  ): Promise<Array<{ name: string }>>;
}
