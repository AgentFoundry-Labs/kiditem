export const AGENT_MCP_SESSION_PORT = Symbol('AGENT_MCP_SESSION_PORT');

export interface AgentMcpSessionDescriptor {
  name: 'kiditem';
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentMcpSessionPort {
  prepare(input: {
    organizationId: string;
    conversationId: string;
    requestId: string;
    runId: string;
    agentInstanceId: string;
    agentType: string;
    playbookKey: string | null;
    planStepKey: string | null;
    requestedByUserId: string | null;
    homeDirectory: string;
  }): Promise<AgentMcpSessionDescriptor>;
}
