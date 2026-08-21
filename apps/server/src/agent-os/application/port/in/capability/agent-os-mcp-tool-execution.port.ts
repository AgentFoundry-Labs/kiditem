export const AGENT_OS_MCP_TOOL_EXECUTION_PORT = Symbol('AGENT_OS_MCP_TOOL_EXECUTION_PORT');

export interface AgentOsMcpExecutionContextPort {
  organizationId: string;
  conversationId: string;
  requestId: string;
  runId: string;
  agentInstanceId: string;
  agentType: string;
  playbookKey: string | null;
  planStepKey: string | null;
  requestedByUserId?: string | null;
}

export interface AgentOsMcpToolExecutionPort {
  execute(input: {
    context: AgentOsMcpExecutionContextPort;
    toolName: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
  listAvailableTools(context: AgentOsMcpExecutionContextPort): Array<{ name: string }>;
}
