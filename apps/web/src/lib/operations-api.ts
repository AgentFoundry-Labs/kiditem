import {
  OperationRunSchema,
  type CreateOperationRunRequest,
  type OperationRun,
} from '@kiditem/shared/operations';
import { apiClient } from './api-client';

export type StartOperationInput = CreateOperationRunRequest & {
  idempotencyKey?: string;
};

export const operationsApi = {
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
};
