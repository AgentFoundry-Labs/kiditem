'use client';

import { API_BASE } from '@/lib/api';
import type { WorkflowCatalogItem, AgentCatalogItem } from '@/lib/marketplace-types';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const marketplaceApi = {
  // Workflows
  listWorkflows: (query?: { module?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (query?.module) qs.set('module', query.module);
    if (query?.category) qs.set('category', query.category);
    const q = qs.toString();
    return fetchJson<WorkflowCatalogItem[]>(`/api/marketplace/workflows${q ? `?${q}` : ''}`);
  },
  getWorkflow: (id: string) =>
    fetchJson<WorkflowCatalogItem>(`/api/marketplace/workflows/${id}`),
  installWorkflow: (id: string, body: { companyId?: string; params?: Record<string, any> }) =>
    fetchJson<any>(`/api/marketplace/workflows/${id}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // Agents
  listAgents: (query?: { role?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (query?.role) qs.set('role', query.role);
    if (query?.category) qs.set('category', query.category);
    const q = qs.toString();
    return fetchJson<AgentCatalogItem[]>(`/api/marketplace/agents${q ? `?${q}` : ''}`);
  },
  getAgent: (id: string) =>
    fetchJson<AgentCatalogItem>(`/api/marketplace/agents/${id}`),
  installAgent: (id: string, body: { companyId?: string; params?: Record<string, any> }) =>
    fetchJson<any>(`/api/marketplace/agents/${id}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
