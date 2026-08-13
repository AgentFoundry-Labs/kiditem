import {
  OperationCatalogResponseSchema,
  OperationRunListResponseSchema,
  OperationRunSchema,
  OperationScheduleListResponseSchema,
  OperationScheduleSchema,
  type CreateOperationRunRequest,
  type OperationRun,
  type UpsertOperationScheduleRequest,
} from '@kiditem/shared/operations';
import { apiClient } from './api-client';

export type StartOperationInput = CreateOperationRunRequest & {
  idempotencyKey?: string;
};

export const operationsApi = {
  listCatalog: () =>
    apiClient.getParsed('/api/operations', OperationCatalogResponseSchema),

  listRuns: () =>
    apiClient.getParsed('/api/operations/runs', OperationRunListResponseSchema),

  getRun: (runId: string) =>
    apiClient.getParsed(`/api/operations/runs/${runId}`, OperationRunSchema),

  async start(operationKey: string, input: StartOperationInput): Promise<OperationRun> {
    const raw = await apiClient.post<unknown>(
      `/api/operations/${encodeURIComponent(operationKey)}/runs`,
      { sourceSurface: input.sourceSurface, input: input.input },
      {
        timeoutMs: 10_000,
        ...(input.idempotencyKey
          ? { headers: { 'Idempotency-Key': input.idempotencyKey } }
          : {}),
      },
    );
    return OperationRunSchema.parse(raw);
  },

  async cancel(runId: string): Promise<OperationRun> {
    const raw = await apiClient.post<unknown>(`/api/operations/runs/${runId}/cancel`);
    return OperationRunSchema.parse(raw);
  },

  retryBrowserRun: (runId: string) =>
    apiClient.post<unknown>(`/api/operation-runtime/browser/runs/${runId}/retry`),

  listSchedules: () =>
    apiClient.getParsed('/api/operation-schedules', OperationScheduleListResponseSchema),

  async upsertSchedule(
    operationKey: string,
    request: UpsertOperationScheduleRequest,
  ) {
    const raw = await apiClient.put<unknown>(
      `/api/operation-schedules/${encodeURIComponent(operationKey)}`,
      request,
    );
    return OperationScheduleSchema.parse(raw);
  },

  async disableSchedule(operationKey: string) {
    const raw = await apiClient.delete<unknown>(
      `/api/operation-schedules/${encodeURIComponent(operationKey)}`,
    );
    return OperationScheduleSchema.parse(raw);
  },
};
