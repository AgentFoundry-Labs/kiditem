'use client';

import { getCompanyId } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import type { Agent, HeartbeatRun, AgentRuntimeState, CostAnalytics } from '@kiditem/shared';
import type { OrgNode } from './agent-types';

export const agentApi = {
  list: async () => {
    const companyId = await getCompanyId();
    return apiClient.get<Agent[]>(`/api/agent-registry?companyId=${companyId}`);
  },
  org: async () => {
    const companyId = await getCompanyId();
    return apiClient.get<OrgNode[]>(`/api/agent-registry/org?companyId=${companyId}`);
  },
  get: async (id: string) => {
    const companyId = await getCompanyId();
    return apiClient.get<Agent>(`/api/agent-registry/${id}?companyId=${companyId}`);
  },
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Agent>(`/api/agent-registry/${id}`, data),
  invoke: (id: string) =>
    apiClient.post<{ ok: boolean }>(`/api/agent-registry/${id}/run`, {}),
  pause: (id: string, reason?: string) =>
    apiClient.post<{ ok: boolean }>(`/api/agent-registry/${id}/pause`, { reason }),
  resume: (id: string) =>
    apiClient.post<{ ok: boolean }>(`/api/agent-registry/${id}/resume`, {}),
  delete: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/api/agent-registry/${id}`),
  resetSession: (id: string) =>
    apiClient.post<{ ok: boolean }>(`/api/agent-registry/${id}/reset-session`, {}),
  getRuns: (id: string, limit = 20) =>
    apiClient.get<HeartbeatRun[]>(`/api/agent-registry/${id}/runs?limit=${limit}`),
  getRuntimeState: (id: string) =>
    apiClient.get<AgentRuntimeState>(`/api/agent-registry/${id}/runtime-state`),
  getCostAnalytics: (params?: { from?: string; to?: string; agentId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.agentId) qs.set('agentId', params.agentId);
    const query = qs.toString();
    return apiClient.get<CostAnalytics>(`/api/agent-registry/cost-analytics${query ? `?${query}` : ''}`);
  },
};
