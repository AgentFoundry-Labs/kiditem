'use client';

import { apiClient } from '@/lib/api-client';
import type {
  Agent,
  HeartbeatRun,
  AgentRuntimeState,
  CostAnalytics,
} from '@kiditem/shared/agent';
import {
  AgentTraceSchema,
  AgentTaskListResponseSchema,
  type AgentTrace,
  type AgentTaskListResponse,
} from '@kiditem/shared/agent-trace';
import type { OrgNode } from './agent-types';

// All endpoints are scoped on the backend via `@CurrentCompany()`. The
// client must NOT send `companyId` in query/body — that path is untrusted
// and the backend would ignore it anyway.
export const agentApi = {
  list: () => apiClient.get<Agent[]>('/api/agent-registry'),
  org: () => apiClient.get<OrgNode[]>('/api/agent-registry/org'),
  get: (id: string) => apiClient.get<Agent>(`/api/agent-registry/${id}`),
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

/**
 * AgentTrace 상세. 서버 ↔ FE DTO 드리프트 발생 시 즉시 throw (ADR-0002).
 */
export async function fetchAgentTrace(taskId: string): Promise<AgentTrace> {
  const raw = await apiClient.get<unknown>(`/api/agent-trace/${taskId}`);
  const parsed = AgentTraceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`AgentTraceSchema drift: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * AgentTask 목록 (status/agentType/from/to/page/limit 필터).
 */
export async function fetchAgentTasksList(params: {
  status?: string;
  agentType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<AgentTaskListResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') query.set(k, String(v));
  });
  const qs = query.toString();
  const raw = await apiClient.get<unknown>(`/api/agent-trace${qs ? `?${qs}` : ''}`);
  const parsed = AgentTaskListResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`AgentTaskListResponseSchema drift: ${parsed.error.message}`);
  }
  return parsed.data;
}
