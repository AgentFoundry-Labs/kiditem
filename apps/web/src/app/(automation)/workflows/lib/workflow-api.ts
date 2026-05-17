'use client';

import { apiClient } from '@/lib/api-client';
import { cancelOperation } from '@/lib/operation-cancellation';
import type { WorkflowTemplate, WorkflowRun } from '@kiditem/shared/workflow';
import type { WorkflowRunWithSteps } from './workflow-types';

// All endpoints are scoped on the backend via `@CurrentOrganization()`. The
// client must NOT send `organizationId` in query/body — that path is untrusted
// and the backend would ignore it anyway.
export const workflowApi = {
  list: () => apiClient.get<WorkflowTemplate[]>('/api/workflows'),

  get: (id: string) => apiClient.get<WorkflowTemplate>(`/api/workflows/${id}`),

  getRuns: (id: string) =>
    apiClient.get<WorkflowRun[]>(`/api/workflows/${id}/runs`),

  getRunDetail: (runId: string) =>
    apiClient.get<WorkflowRunWithSteps>(`/api/workflow-runs/${runId}`),

  triggerRun: (id: string, context?: Record<string, any>) =>
    apiClient.post<WorkflowRun>(`/api/workflows/${id}/run`, context ?? {}),

  cancelRun: (runId: string) =>
    cancelOperation({ targetType: 'workflow_run', runId, reason: '사용자 요청' }),

  delete: (id: string) =>
    apiClient.delete<void>(`/api/workflows/${id}`),

  toggleActive: (id: string, isActive: boolean) =>
    apiClient.put<WorkflowTemplate>(`/api/workflows/${id}`, { isActive }),
};
