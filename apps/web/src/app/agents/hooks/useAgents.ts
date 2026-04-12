'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { agentApi } from '../lib/agent-api';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { Agent, HeartbeatRun, AgentRuntimeState, CostAnalytics } from '@kiditem/shared';
import type { OrgNode } from '../lib/agent-types';

export function useAgents(options?: Partial<UseQueryOptions<Agent[]>>) {
  return useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => agentApi.list(),
    ...options,
  });
}

export function useAgentOrg(options?: Partial<UseQueryOptions<OrgNode[]>>) {
  return useQuery({
    queryKey: queryKeys.agents.org(),
    queryFn: () => agentApi.org(),
    ...options,
  });
}

export function useAgent(id: string, options?: Partial<UseQueryOptions<Agent>>) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => agentApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useAgentRuns(id: string, limit?: number, options?: Partial<UseQueryOptions<HeartbeatRun[]>>) {
  return useQuery({
    queryKey: queryKeys.agents.runs(id),
    queryFn: () => agentApi.getRuns(id, limit),
    enabled: !!id,
    ...options,
  });
}

export function useAgentRuntimeState(id: string, options?: Partial<UseQueryOptions<AgentRuntimeState>>) {
  return useQuery({
    queryKey: queryKeys.agents.runtimeState(id),
    queryFn: () => agentApi.getRuntimeState(id),
    enabled: !!id,
    ...options,
  });
}

export function useAgentCostAnalytics(
  params?: { from?: string; to?: string; agentId?: string },
  options?: Partial<UseQueryOptions<CostAnalytics>>,
) {
  return useQuery({
    queryKey: queryKeys.agents.costAnalytics(params),
    queryFn: () => agentApi.getCostAnalytics(params),
    ...options,
  });
}

export function useInvokeAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentApi.invoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents.all }),
  });
}

export function usePauseAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => agentApi.pause(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents.all }),
  });
}

export function useResumeAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentApi.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents.all }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
      qc.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}

export function useResetAgentSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentApi.resetSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents.all }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => agentApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents.all }),
  });
}
