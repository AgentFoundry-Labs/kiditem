'use client';

import { apiClient } from '@/lib/api-client';
import type {
  AgentApprovalRequestSummary,
  AgentApprovalStatus,
  AgentAuthorizationDecision,
  AgentAuthorizationEventSummary,
  AgentConversationSummary,
  AgentCostEventSummary,
  AgentInstanceSummary,
  AgentMessage,
  AgentRunGraph,
  AgentRunRequestSummary,
  AgentRunRequestStatus,
  AgentRunEventSummary,
  AgentRunStatus,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';

export interface AgentApprovalResolutionResponse {
  approvalRequestId: string;
  requestId: string | null;
  status: Extract<AgentApprovalStatus, 'approved' | 'rejected'>;
}

// All endpoints are scoped on the backend via `@CurrentOrganization()`. The
// client must NOT send `organizationId` — it is dropped by the controller DTO.
export const agentOsApi = {
  listInstances: () =>
    apiClient.get<AgentInstanceSummary[]>('/api/agent-os/instances'),

  listConversations: () =>
    apiClient.get<{ items: AgentConversationSummary[] }>(
      '/api/agent-os/conversations',
    ),

  createConversation: (input: { content: string }) =>
    apiClient.post<{
      conversation: AgentConversationSummary;
      message: AgentMessage;
      rootRequestId: string | null;
    }>('/api/agent-os/conversations', input),

  listRuns: (params: { status?: AgentRunStatus[]; agentInstanceId?: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.status?.length) qs.set('status', params.status.join(','));
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentRunSummary[] }>(`/api/agent-os/runs${q ? `?${q}` : ''}`);
  },

  listRequests: (params: {
    status?: AgentRunRequestStatus[];
    agentInstanceId?: string;
    source?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.status?.length) qs.set('status', params.status.join(','));
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.source) qs.set('source', params.source);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentRunRequestSummary[] }>(`/api/agent-os/requests${q ? `?${q}` : ''}`);
  },

  listMessages: (conversationId: string) =>
    apiClient.get<{ items: AgentMessage[] }>(
      `/api/agent-os/conversations/${conversationId}/messages`,
    ),

  sendMessage: (conversationId: string, input: { content: string }) =>
    apiClient.post<{
      conversation: AgentConversationSummary;
      message: AgentMessage;
      rootRequestId: string | null;
    }>(`/api/agent-os/conversations/${conversationId}/messages`, input),

  getConversationGraph: (conversationId: string) =>
    apiClient.get<AgentRunGraph>(
      `/api/agent-os/conversations/${conversationId}/graph`,
    ),

  listApprovals: (params: {
    status?: AgentApprovalStatus[];
    agentInstanceId?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.status?.length) qs.set('status', params.status.join(','));
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentApprovalRequestSummary[] }>(
      `/api/agent-os/approvals${q ? `?${q}` : ''}`,
    );
  },

  resolveApproval: (
    approvalRequestId: string,
    input: { status: 'approved' | 'rejected'; decisionReason?: string },
  ) =>
    apiClient.post<AgentApprovalResolutionResponse>(
      `/api/agent-os/approvals/${approvalRequestId}/resolve`,
      input,
    ),

  listCostEvents: (params: {
    agentInstanceId?: string;
    provider?: string;
    model?: string;
    fromOccurredAt?: string;
    toOccurredAt?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.provider) qs.set('provider', params.provider);
    if (params.model) qs.set('model', params.model);
    if (params.fromOccurredAt) qs.set('fromOccurredAt', params.fromOccurredAt);
    if (params.toOccurredAt) qs.set('toOccurredAt', params.toOccurredAt);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{
      items: AgentCostEventSummary[];
      totalCostMicros: string;
    }>(`/api/agent-os/cost-events${q ? `?${q}` : ''}`);
  },

  listAuthorizationEvents: (params: {
    agentInstanceId?: string;
    decision?: AgentAuthorizationDecision[];
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.decision?.length) qs.set('decision', params.decision.join(','));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentAuthorizationEventSummary[] }>(
      `/api/agent-os/authorization-events${q ? `?${q}` : ''}`,
    );
  },

  getRun: (runId: string) => apiClient.get<AgentRunSummary>(`/api/agent-os/runs/${runId}`),
  listRunEvents: (runId: string, params?: { cursorSeq?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.cursorSeq !== undefined) qs.set('cursorSeq', String(params.cursorSeq));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentRunEventSummary[] }>(`/api/agent-os/runs/${runId}/events${q ? `?${q}` : ''}`);
  },
};
