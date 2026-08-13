export const AGENT_INTERACTION_PORT = Symbol('AGENT_INTERACTION_PORT');

export interface AgentInteractionInput {
  organizationId: string;
  userId: string;
  agentType: 'sourcing';
  surface: 'sourcing_dashboard';
  conversationId?: string | null;
  content: string;
  sourceResourceType: 'sourcing_workspace';
  sourceResourceId: string;
  payload?: Record<string, unknown>;
  executionMode: 'inline';
  maxAttempts: 1;
}

export interface AgentInteractionResult {
  conversationId: string;
  requestId: string;
  runId: string | null;
  status: 'succeeded' | 'failed' | 'cancelled';
  provider: 'claude_cli' | 'codex_cli' | null;
  model: string | null;
  output: Record<string, unknown> | null;
  errorCode: string | null;
}

export interface RecordAgentAssistantMessageInput {
  organizationId: string;
  conversationId: string;
  requestId: string;
  runId: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export interface AgentInteractionPort {
  interact(input: AgentInteractionInput): Promise<AgentInteractionResult>;
  recordAssistantMessage(
    input: RecordAgentAssistantMessageInput,
  ): Promise<void>;
}
