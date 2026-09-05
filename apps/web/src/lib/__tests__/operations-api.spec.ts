import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { operationsApi } from '../operations-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
    post: vi.fn(),
  },
}));

describe('operationsApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.getParsed).mockReset();
  });

  it('starts an operation through the common endpoint with an idempotency header', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      operationKey: 'inventory.refresh_sellpia_snapshot',
      definitionVersion: 1,
      title: 'Sellpia 현재고 수집',
      ownerDomain: 'inventory',
      engineType: 'composite',
      resourceClass: 'default',
      executionTimeoutMs: 60_000,
      status: 'queued',
      triggerSource: 'dashboard',
      parentRunId: null,
      scheduleId: null,
      nativeRunType: null,
      nativeRunId: null,
      progress: null,
      stage: null,
      stageUpdatedAt: null,
      progressCurrent: null,
      progressTotal: null,
      deadlineAt: null,
      result: null,
      error: null,
      requestedBy: null,
      scheduledFor: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    await operationsApi.start('inventory.refresh_sellpia_snapshot', {
      sourceSurface: 'dashboard',
      input: { reason: 'manual_request', scope: 'inventory' },
      idempotencyKey: 'click-1',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/operations/inventory.refresh_sellpia_snapshot/runs',
      { sourceSurface: 'dashboard', input: { reason: 'manual_request', scope: 'inventory' } },
      {
        headers: { 'Idempotency-Key': 'click-1' },
        timeoutMs: 10_000,
      },
    );
  });

});
