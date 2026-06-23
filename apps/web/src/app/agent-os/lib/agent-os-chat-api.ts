import type {
  AgentApprovalRequestSummary,
  AgentAuthorizationEventSummary,
  AgentConversationSummary,
  AgentCostEventSummary,
  AgentOsLiveReadinessResponse,
  AgentInstanceToolPolicySummary,
  AgentToolPolicyApprovalMode,
  AgentToolPolicyDryRunMode,
  AgentToolPolicyEffect,
  AgentMessage,
  AgentRunEventSummary,
  AgentRunSummary,
  AgentRunGraph,
  AgentRunnerResult,
  ResolveAgentApproval,
} from '@kiditem/shared/agent-os';
import { apiClient } from '@/lib/api-client';

export const agentOsChatKeys = {
  conversations: ['agent-os', 'conversations'] as const,
  messages: (conversationId: string) =>
    ['agent-os', 'conversations', conversationId, 'messages'] as const,
  graph: (conversationId: string) =>
    ['agent-os', 'conversations', conversationId, 'graph'] as const,
  costEvents: ['agent-os', 'cost-events'] as const,
  authorizationEvents: ['agent-os', 'authorization-events'] as const,
  approvals: ['agent-os', 'approvals'] as const,
  runs: ['agent-os', 'runs'] as const,
  runEvents: (runId: string) => ['agent-os', 'runs', runId, 'events'] as const,
  liveReadiness: ['agent-os', 'live-readiness'] as const,
  instanceToolPolicies: (agentInstanceId: string) =>
    ['agent-os', 'instances', agentInstanceId, 'tool-policies'] as const,
};

export interface AgentConversationCreateResult {
  conversation: AgentConversationSummary;
  message?: AgentMessage;
  rootRequestId: string | null;
}

export function listAgentConversations() {
  return apiClient.get<{ items: AgentConversationSummary[] }>(
    '/api/agent-os/conversations',
  );
}

export function createAgentConversation(content: string) {
  return apiClient.post<AgentConversationCreateResult>(
    '/api/agent-os/conversations',
    { content },
  );
}

export function sendAgentMessage(conversationId: string, content: string) {
  return apiClient.post<AgentConversationCreateResult>(
    `/api/agent-os/conversations/${conversationId}/messages`,
    { content },
  );
}

export function listAgentMessages(conversationId: string) {
  return apiClient.get<{ items: AgentMessage[] }>(
    `/api/agent-os/conversations/${conversationId}/messages`,
  );
}

export function getAgentConversationGraph(conversationId: string) {
  return apiClient.get<AgentRunGraph>(
    `/api/agent-os/conversations/${conversationId}/graph`,
  );
}

export function createOrderDraftFromRecommendation(
  conversationId: string,
  artifactId: string,
) {
  return apiClient.post<AgentRunnerResult>(
    `/api/agent-os/conversations/${conversationId}/recommendations/${artifactId}/order-draft`,
    {},
  );
}

export function resolveAgentApproval(
  approvalRequestId: string,
  status: ResolveAgentApproval['status'],
) {
  return apiClient.post<{
    approvalRequestId: string;
    requestId: string | null;
    status: ResolveAgentApproval['status'];
  }>(`/api/agent-os/approvals/${approvalRequestId}/resolve`, { status });
}

export function listAgentCostEvents(limit = 50) {
  return apiClient.get<{
    items: AgentCostEventSummary[];
    totalCostMicros: string;
  }>(`/api/agent-os/cost-events?limit=${limit}`);
}

export function listAgentAuthorizationEvents(limit = 50) {
  return apiClient.get<{ items: AgentAuthorizationEventSummary[] }>(
    `/api/agent-os/authorization-events?limit=${limit}`,
  );
}

export function listAgentApprovals(limit = 50) {
  return apiClient.get<{ items: AgentApprovalRequestSummary[] }>(
    `/api/agent-os/approvals?limit=${limit}`,
  );
}

export function listAgentRuns(limit = 20) {
  return apiClient.get<{ items: AgentRunSummary[] }>(
    `/api/agent-os/runs?limit=${limit}`,
  );
}

export function listAgentRunEvents(runId: string, limit = 50) {
  return apiClient.get<{ items: AgentRunEventSummary[] }>(
    `/api/agent-os/runs/${runId}/events?limit=${limit}`,
  );
}

export function getAgentOsLiveReadiness() {
  return apiClient.get<AgentOsLiveReadinessResponse>(
    '/api/readiness/agent-os-live',
  );
}

export function listAgentInstanceToolPolicies(agentInstanceId: string) {
  return apiClient.get<{ items: AgentInstanceToolPolicySummary[] }>(
    `/api/agent-os/instances/${agentInstanceId}/tool-policies`,
  );
}

export function upsertAgentInstanceToolPolicy(
  agentInstanceId: string,
  toolKey: string,
  policy: {
    effect: AgentToolPolicyEffect;
    approvalMode: AgentToolPolicyApprovalMode;
    dryRunMode: AgentToolPolicyDryRunMode;
    constraints: Record<string, unknown>;
  },
) {
  return apiClient.put<{ ok: true }>(
    `/api/agent-os/instances/${agentInstanceId}/tool-policies/${encodeURIComponent(toolKey)}`,
    policy,
  );
}
