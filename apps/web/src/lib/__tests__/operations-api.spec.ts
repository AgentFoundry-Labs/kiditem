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

function browserRun() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    operationKey: 'sourcing.collect_wing_catalog_batch',
    definitionVersion: 1,
    title: 'Wing 카탈로그 수집',
    ownerDomain: 'sourcing',
    engineType: 'browser',
    resourceClass: 'extension_coupang',
    executionTimeoutMs: 900_000,
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
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  };
}

describe('operationsApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.getParsed).mockReset();
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
    vi.mocked(apiClient.post).mockResolvedValue(browserRun());

    await expect(operationsApi.retryBrowserRun('11111111-1111-1111-1111-111111111111'))
      .resolves.toEqual(browserRun());

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/operation-runtime/browser/runs/11111111-1111-1111-1111-111111111111/retry',
    );
  });

  it('rejects a malformed replacement run instead of leaving the panel on an unknown response', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'not-an-operation-run' });

    await expect(operationsApi.retryBrowserRun('11111111-1111-1111-1111-111111111111'))
      .rejects.toThrow();
  });

  it('reads only a matching reconnectable run and never starts work during reload', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ run: browserRun() });

    const reconnect = operationsApi as unknown as {
      findReconnectable(operationKey: string, input: Record<string, unknown>): Promise<unknown>;
    };
    await expect(reconnect.findReconnectable(
      'sourcing.collect_wing_catalog_batch',
      { keywords: ['스티커'], maxPages: 1, purpose: 'catalog_search' },
    )).resolves.toEqual(browserRun());

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/operations/sourcing.collect_wing_catalog_batch/runs/reconnect?input=%7B%22keywords%22%3A%5B%22%EC%8A%A4%ED%8B%B0%EC%BB%A4%22%5D%2C%22maxPages%22%3A1%2C%22purpose%22%3A%22catalog_search%22%7D',
      expect.anything(),
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
