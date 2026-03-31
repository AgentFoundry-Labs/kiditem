'use client';

import { API_BASE, getCompanyId } from '@/lib/api';
import type {
  WorkflowTemplate,
  WorkflowRun,
  WorkflowRunWithSteps,
} from '@/lib/workflow-types';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const workflowApi = {
  list: async () => {
    const companyId = await getCompanyId();
    return fetchJson<WorkflowTemplate[]>(`/api/workflows?companyId=${companyId}`);
  },

  get: (id: string) => fetchJson<WorkflowTemplate>(`/api/workflows/${id}`),

  getRuns: (id: string) =>
    fetchJson<WorkflowRun[]>(`/api/workflows/${id}/runs`),

  getRunDetail: (runId: string) =>
    fetchJson<WorkflowRunWithSteps>(`/api/workflow-runs/${runId}`),

  triggerRun: (id: string, context?: Record<string, any>) =>
    fetchJson<WorkflowRun>(`/api/workflows/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context ?? {}),
    }),

  delete: (id: string) =>
    fetchJson<void>(`/api/workflows/${id}`, { method: 'DELETE' }),

  toggleActive: (id: string, isActive: boolean) =>
    fetchJson<WorkflowTemplate>(`/api/workflows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    }),
};
