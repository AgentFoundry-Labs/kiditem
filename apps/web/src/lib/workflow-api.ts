'use client';

import { getCompanyId } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import type { WorkflowTemplate, WorkflowRun } from '@kiditem/shared';
import type { WorkflowRunWithSteps } from '@/lib/workflow-types';

export const workflowApi = {
  list: async () => {
    const companyId = await getCompanyId();
    return apiClient.get<WorkflowTemplate[]>(`/api/workflows?companyId=${companyId}`);
  },

  get: (id: string) => apiClient.get<WorkflowTemplate>(`/api/workflows/${id}`),

  getRuns: (id: string) =>
    apiClient.get<WorkflowRun[]>(`/api/workflows/${id}/runs`),

  getRunDetail: (runId: string) =>
    apiClient.get<WorkflowRunWithSteps>(`/api/workflow-runs/${runId}`),

  triggerRun: (id: string, context?: Record<string, any>) =>
    apiClient.post<WorkflowRun>(`/api/workflows/${id}/run`, context ?? {}),

  delete: (id: string) =>
    apiClient.delete<void>(`/api/workflows/${id}`),

  toggleActive: (id: string, isActive: boolean) =>
    apiClient.put<WorkflowTemplate>(`/api/workflows/${id}`, { isActive }),
};
