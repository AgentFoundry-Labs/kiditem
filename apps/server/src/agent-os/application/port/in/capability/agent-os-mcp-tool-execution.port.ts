export const AGENT_OS_MCP_TOOL_EXECUTION_PORT = Symbol('AGENT_OS_MCP_TOOL_EXECUTION_PORT');

export interface AgentOsMcpExecutionContextPort {
  credential: string;
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
