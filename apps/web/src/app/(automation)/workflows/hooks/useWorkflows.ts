'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { workflowApi } from '../lib/workflow-api';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { WorkflowTemplate } from '@kiditem/shared/workflow';

export function useWorkflows(options?: Partial<UseQueryOptions<WorkflowTemplate[]>>) {
  return useQuery({
    queryKey: queryKeys.workflows.list(),
    queryFn: () => workflowApi.list(),
    ...options,
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
