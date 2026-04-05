'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { workflowApi } from '../lib/workflow-api';
import { queryKeys } from '@/lib/query-keys';
import type { WorkflowTemplate, WorkflowRun } from '@kiditem/shared';
import type { WorkflowRunWithSteps } from '../lib/workflow-types';

export function useWorkflows(options?: Partial<UseQueryOptions<WorkflowTemplate[]>>) {
  return useQuery({
    queryKey: queryKeys.workflows.list(),
    queryFn: () => workflowApi.list(),
    ...options,
  });
}

export function useWorkflow(id: string, options?: Partial<UseQueryOptions<WorkflowTemplate>>) {
  return useQuery({
    queryKey: queryKeys.workflows.detail(id),
    queryFn: () => workflowApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useWorkflowRuns(id: string, options?: Partial<UseQueryOptions<WorkflowRun[]>>) {
  return useQuery({
    queryKey: queryKeys.workflows.runs(id),
    queryFn: () => workflowApi.getRuns(id),
    enabled: !!id,
    ...options,
  });
}

export function useWorkflowRunDetail(runId: string, options?: Partial<UseQueryOptions<WorkflowRunWithSteps>>) {
  return useQuery({
    queryKey: queryKeys.workflows.runDetail(runId),
    queryFn: () => workflowApi.getRunDetail(runId),
    enabled: !!runId,
    ...options,
  });
}

export function useTriggerWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, context }: { id: string; context?: Record<string, any> }) =>
      workflowApi.triggerRun(id, context),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workflows.all }),
  });
}

export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      workflowApi.toggleActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workflows.all }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workflows.all }),
  });
}
