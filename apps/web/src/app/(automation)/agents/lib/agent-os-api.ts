'use client';

import { apiClient } from '@/lib/api-client';
import type {
  AgentInstanceSummary,
  AgentRunRequestSummary,
  AgentRunRequestStatus,
  AgentRunStatus,
  AgentRunSummary,
  AgentRunEventSummary,
} from '@kiditem/shared/agent-os';

// All endpoints are scoped on the backend via `@CurrentOrganization()`. The
// client must NOT send `organizationId` — it is dropped by the controller DTO.
export const agentOsApi = {
  listInstances: () =>
    apiClient.get<AgentInstanceSummary[]>('/api/agent-os/instances'),

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

  getRun: (runId: string) => apiClient.get<AgentRunSummary>(`/api/agent-os/runs/${runId}`),
  listRunEvents: (runId: string, params?: { cursorSeq?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.cursorSeq !== undefined) qs.set('cursorSeq', String(params.cursorSeq));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentRunEventSummary[] }>(`/api/agent-os/runs/${runId}/events${q ? `?${q}` : ''}`);
  },
};
