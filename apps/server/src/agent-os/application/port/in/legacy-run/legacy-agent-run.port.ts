/** Explicit transitional input ports for the retained generic AgentRun lane. */
export const LEGACY_AGENT_APPROVAL_PORT = Symbol('LEGACY_AGENT_APPROVAL_PORT');
export const LEGACY_AGENT_CONVERSATION_PORT = Symbol('LEGACY_AGENT_CONVERSATION_PORT');
export const LEGACY_AGENT_RUN_GRAPH_PORT = Symbol('LEGACY_AGENT_RUN_GRAPH_PORT');
export const LEGACY_AGENT_RUN_EXECUTION_PORT = Symbol('LEGACY_AGENT_RUN_EXECUTION_PORT');
export const LEGACY_AGENT_OBSERVABILITY_PORT = Symbol('LEGACY_AGENT_OBSERVABILITY_PORT');

export interface LegacyAgentApprovalPort {
  listApprovals(input: unknown): Promise<unknown>;
  resolveApproval(input: unknown): Promise<unknown>;
}

export interface LegacyAgentConversationPort {
  listConversations(input: unknown): Promise<unknown>;
  startConversation(input: unknown): Promise<unknown>;
  listMessages(input: unknown): Promise<unknown>;
  sendMessage(input: unknown): Promise<unknown>;
  createOrderDraftFromRecommendation(input: unknown): Promise<unknown>;
}

export interface LegacyAgentRunGraphPort {
  getConversationGraph(input: unknown): Promise<unknown>;
}

export interface LegacyAgentRunExecutionPort {
  executeNext(workerId: string, organizationId?: string): Promise<unknown>;
}

export interface LegacyAgentObservabilityPort {
  listRunEvents(input: unknown): Promise<unknown>;
  listCostEvents(input: unknown): Promise<{
    items: Array<{ costMicros: bigint; [key: string]: unknown }>;
    totalCostMicros: bigint;
  }>;
  listAuthorizationEvents(input: unknown): Promise<unknown>;
  listRuns(input: unknown): Promise<unknown>;
  findRun(input: unknown): Promise<Record<string, unknown> | null>;
  listRequests(input: unknown): Promise<unknown>;
  findRequest(input: unknown): Promise<Record<string, unknown> | null>;
}
