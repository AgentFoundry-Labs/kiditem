'use client';

import { apiClient } from '@/lib/api-client';
import type { WorkflowCatalogItem, AgentCatalogItem } from '@kiditem/shared/marketplace';

// All endpoints are scoped on the backend via `@CurrentOrganization()`. The
// client must NOT send `organizationId` in query/body — that path is untrusted
// and the backend would ignore it anyway.
export const marketplaceApi = {
  // Workflows
  listWorkflows: (query?: { module?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (query?.module) qs.set('module', query.module);
    if (query?.category) qs.set('category', query.category);
    const suffix = qs.toString();
    return apiClient.get<WorkflowCatalogItem[]>(`/api/marketplace/workflows${suffix ? `?${suffix}` : ''}`);
  },
  getWorkflow: (id: string) =>
    apiClient.get<WorkflowCatalogItem>(`/api/marketplace/workflows/${id}`),
  installWorkflow: (id: string, body: { params?: Record<string, any> }) =>
    apiClient.post<any>(`/api/marketplace/workflows/${id}/install`, body),
  uninstallWorkflow: (id: string) =>
    apiClient.post<{ ok: boolean }>(`/api/marketplace/workflows/${id}/uninstall`, {}),

  // Agents
  listAgents: (query?: { role?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (query?.role) qs.set('role', query.role);
    if (query?.category) qs.set('category', query.category);
    const suffix = qs.toString();
    return apiClient.get<AgentCatalogItem[]>(`/api/marketplace/agents${suffix ? `?${suffix}` : ''}`);
  },
  getAgent: (id: string) =>
    apiClient.get<AgentCatalogItem>(`/api/marketplace/agents/${id}`),
  installAgent: (id: string, body: { params?: Record<string, any> }) =>
    apiClient.post<any>(`/api/marketplace/agents/${id}/install`, body),
  uninstallAgent: (id: string) =>
    apiClient.post<{ ok: boolean }>(`/api/marketplace/agents/${id}/uninstall`, {}),
};
