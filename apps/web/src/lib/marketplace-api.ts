'use client';

import { API_BASE, getCompanyId } from '@/lib/api';
import type { WorkflowCatalogItem, AgentCatalogItem } from '@/lib/marketplace-types';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const marketplaceApi = {
  // Workflows
  listWorkflows: async (query?: { module?: string; category?: string }) => {
    const companyId = await getCompanyId();
    const qs = new URLSearchParams();
    qs.set('companyId', companyId);
    if (query?.module) qs.set('module', query.module);
    if (query?.category) qs.set('category', query.category);
    return fetchJson<WorkflowCatalogItem[]>(`/api/marketplace/workflows?${qs}`);
  },
  getWorkflow: (id: string) =>
    fetchJson<WorkflowCatalogItem>(`/api/marketplace/workflows/${id}`),
  installWorkflow: async (id: string, body: { params?: Record<string, any> }) => {
    const companyId = await getCompanyId();
    return fetchJson<any>(`/api/marketplace/workflows/${id}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...body }),
    });
  },
  uninstallWorkflow: async (id: string) => {
    const companyId = await getCompanyId();
    return fetchJson<{ ok: boolean }>(`/api/marketplace/workflows/${id}/uninstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    });
  },

  // Agents
  listAgents: async (query?: { role?: string; category?: string }) => {
    const companyId = await getCompanyId();
    const qs = new URLSearchParams();
    qs.set('companyId', companyId);
    if (query?.role) qs.set('role', query.role);
    if (query?.category) qs.set('category', query.category);
    return fetchJson<AgentCatalogItem[]>(`/api/marketplace/agents?${qs}`);
  },
  getAgent: (id: string) =>
    fetchJson<AgentCatalogItem>(`/api/marketplace/agents/${id}`),
  installAgent: async (id: string, body: { params?: Record<string, any> }) => {
    const companyId = await getCompanyId();
    return fetchJson<any>(`/api/marketplace/agents/${id}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...body }),
    });
  },
  uninstallAgent: async (id: string) => {
    const companyId = await getCompanyId();
    return fetchJson<{ ok: boolean }>(`/api/marketplace/agents/${id}/uninstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    });
  },
};
