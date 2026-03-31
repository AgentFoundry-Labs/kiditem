'use client';

import { API_BASE } from '@/lib/api';
import type { Agent, OrgNode, HeartbeatRun, AgentRuntimeState } from '@/lib/agent-types';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const agentApi = {
  list: () => fetchJson<Agent[]>('/api/agent-registry'),
  org: () => fetchJson<OrgNode[]>('/api/agent-registry/org'),
  get: (id: string) => fetchJson<Agent>(`/api/agent-registry/${id}`),
  update: (id: string, data: Record<string, unknown>) =>
    fetchJson<Agent>(`/api/agent-registry/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  invoke: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/agent-registry/${id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  pause: (id: string, reason?: string) =>
    fetchJson<{ ok: boolean }>(`/api/agent-registry/${id}/pause`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  resume: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/agent-registry/${id}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  resetSession: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/agent-registry/${id}/reset-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  getRuns: (id: string, limit = 20) =>
    fetchJson<HeartbeatRun[]>(`/api/agent-registry/${id}/runs?limit=${limit}`),
  getRuntimeState: (id: string) =>
    fetchJson<AgentRuntimeState | null>(`/api/agent-registry/${id}/runtime-state`),
};
