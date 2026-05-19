export const AGENT_RUNTIME_PORT = Symbol('AGENT_RUNTIME_PORT');

export interface AgentRuntimeExecutionContext {
  organizationId: string;
  agentInstanceId: string;
  agentType: string;
  requestId: string;
  runId: string;
  taskSessionId: string;
  taskKey: string;
  adapterType: string;
  model: string;
  promptPath: string;
  input: Record<string, unknown>;
  trustLevel: number;
  runtimeConfig: Record<string, unknown>;
}

export interface AgentRuntimeResult {
  output: Record<string, unknown>;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: bigint;
  logExcerpt?: string;
  logRef?: string | null;
  logSha256?: string | null;
  logBytes?: bigint | null;
}

export interface AgentRuntimePort {
  execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult>;
}
