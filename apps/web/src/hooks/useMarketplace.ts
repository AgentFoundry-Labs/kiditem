'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { marketplaceApi } from '@/lib/marketplace-api';
import { queryKeys } from '@/lib/query-keys';
import type { WorkflowCatalogItem, AgentCatalogItem } from '@kiditem/shared';

export function useMarketplaceWorkflows(
  query?: { module?: string; category?: string },
  options?: Partial<UseQueryOptions<WorkflowCatalogItem[]>>,
) {
  return useQuery({
    queryKey: queryKeys.marketplace.workflows(query),
    queryFn: () => marketplaceApi.listWorkflows(query),
    ...options,
  });
}

export function useMarketplaceAgents(
  query?: { role?: string; category?: string },
  options?: Partial<UseQueryOptions<AgentCatalogItem[]>>,
) {
  return useQuery({
    queryKey: queryKeys.marketplace.agents(query),
    queryFn: () => marketplaceApi.listAgents(query),
    ...options,
  });
}

export function useInstallWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params?: Record<string, any> }) =>
      marketplaceApi.installWorkflow(id, { params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplace.all });
      qc.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
}

export function useUninstallWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceApi.uninstallWorkflow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplace.all });
      qc.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
}

export function useInstallAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params?: Record<string, any> }) =>
      marketplaceApi.installAgent(id, { params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplace.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}

export function useUninstallAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceApi.uninstallAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplace.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}
