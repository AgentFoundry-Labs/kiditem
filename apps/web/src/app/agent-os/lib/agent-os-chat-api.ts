import type {
  AgentConversationSummary,
  AgentMessage,
  AgentRunGraph,
  AgentRunnerResult,
} from '@kiditem/shared/agent-os';
import { apiClient } from '@/lib/api-client';

export const agentOsChatKeys = {
  conversations: ['agent-os', 'conversations'] as const,
  messages: (conversationId: string) =>
    ['agent-os', 'conversations', conversationId, 'messages'] as const,
  graph: (conversationId: string) =>
    ['agent-os', 'conversations', conversationId, 'graph'] as const,
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
