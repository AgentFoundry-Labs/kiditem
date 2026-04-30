export const AGENT_RUNNER_PORT = Symbol('AGENT_RUNNER_PORT');

export interface AgentRunnerInput {
  companyId?: string;
  dryRun?: boolean;
  extra?: Record<string, unknown>;
  workflowRunId?: string;
  workflowNodeId?: string;
  sourceDataId?: string;
}

export interface AgentRunnerResult {
  ok: boolean;
  taskId?: string;
  agentType?: string;
}

export interface AgentRunnerPort {
  runByType(type: string, input?: AgentRunnerInput): Promise<AgentRunnerResult>;
}
