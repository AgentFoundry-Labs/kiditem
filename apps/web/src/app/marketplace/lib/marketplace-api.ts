'use client';

import { getCompanyId } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import type { WorkflowCatalogItem, AgentCatalogItem } from '@kiditem/shared/marketplace';

export const marketplaceApi = {
  // Workflows
  listWorkflows: async (query?: { module?: string; category?: string }) => {
    const companyId = await getCompanyId();
    const qs = new URLSearchParams();
    qs.set('companyId', companyId);
    if (query?.module) qs.set('module', query.module);
    if (query?.category) qs.set('category', query.category);
    return apiClient.get<WorkflowCatalogItem[]>(`/api/marketplace/workflows?${qs}`);
  },
  getWorkflow: (id: string) =>
    apiClient.get<WorkflowCatalogItem>(`/api/marketplace/workflows/${id}`),
  installWorkflow: async (id: string, body: { params?: Record<string, any> }) => {
    const companyId = await getCompanyId();
    return apiClient.post<any>(`/api/marketplace/workflows/${id}/install`, { companyId, ...body });
  },
  uninstallWorkflow: async (id: string) => {
    const companyId = await getCompanyId();
    return apiClient.post<{ ok: boolean }>(`/api/marketplace/workflows/${id}/uninstall`, { companyId });
  },

  // Agents
  listAgents: async (query?: { role?: string; category?: string }) => {
    const companyId = await getCompanyId();
    const qs = new URLSearchParams();
    qs.set('companyId', companyId);
    if (query?.role) qs.set('role', query.role);
    if (query?.category) qs.set('category', query.category);
    return apiClient.get<AgentCatalogItem[]>(`/api/marketplace/agents?${qs}`);
  },
  getAgent: (id: string) =>
    apiClient.get<AgentCatalogItem>(`/api/marketplace/agents/${id}`),
  installAgent: async (id: string, body: { params?: Record<string, any> }) => {
    const companyId = await getCompanyId();
    return apiClient.post<any>(`/api/marketplace/agents/${id}/install`, { companyId, ...body });
  },
  uninstallAgent: async (id: string) => {
    const companyId = await getCompanyId();
    return apiClient.post<{ ok: boolean }>(`/api/marketplace/agents/${id}/uninstall`, { companyId });
  },
};
