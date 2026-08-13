import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';
import { operationsApi } from '../operations-api';

describe('operationsApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('starts an operation through the common endpoint with an idempotency header', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      operationKey: 'sourcing.collect_daily_trends',
      definitionVersion: 1,
      title: '일일 트렌드 수집',
      ownerDomain: 'sourcing',
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

    await operationsApi.start('sourcing.collect_daily_trends', {
      sourceSurface: 'dashboard',
      input: { sources: ['naver'] },
      idempotencyKey: 'click-1',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/operations/sourcing.collect_daily_trends/runs',
      { sourceSurface: 'dashboard', input: { sources: ['naver'] } },
      {
        headers: { 'Idempotency-Key': 'click-1' },
        timeoutMs: 10_000,
      },
    );
  });

  it('retries browser work only through the fenced runtime endpoint', async () => {
    await operationsApi.retryBrowserRun('11111111-1111-1111-1111-111111111111');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/operation-runtime/browser/runs/11111111-1111-1111-1111-111111111111/retry',
    );
  });
});
