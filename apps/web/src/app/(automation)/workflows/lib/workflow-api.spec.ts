import { describe, expect, it, vi, beforeEach } from 'vitest';
import { workflowApi } from './workflow-api';
import { cancelOperation } from '@/lib/operation-cancellation';

const mockCancelOperation = vi.hoisted(() => vi.fn());
const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

vi.mock('@/lib/operation-cancellation', () => ({
  cancelOperation: mockCancelOperation,
}));

describe('workflowApi', () => {
  beforeEach(() => {
    mockCancelOperation.mockReset();
  });

  it('cancels a workflow run through the platform cancellation endpoint', async () => {
    mockCancelOperation.mockResolvedValueOnce({ ok: true, status: 'cancelled' });

    await workflowApi.cancelRun('run-1');

    expect(cancelOperation).toHaveBeenCalledWith({
      targetType: 'workflow_run',
      runId: 'run-1',
      reason: '사용자 요청',
    });
  });
});
