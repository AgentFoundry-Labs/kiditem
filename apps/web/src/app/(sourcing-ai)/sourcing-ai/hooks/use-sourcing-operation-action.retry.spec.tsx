import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OperationRun } from '@kiditem/shared/operations';
import { queryKeys } from '@/lib/query-keys';
import { useSourcingOperationAction } from './use-sourcing-operation-action';

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  retryBrowserRun: vi.fn(),
  wake: vi.fn(),
}));

vi.mock('@/lib/operations-api', () => ({
  operationsApi: {
    getRun: mocks.getRun,
    retryBrowserRun: mocks.retryBrowserRun,
    start: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('@/lib/extension-bridge', () => ({
  wakeBrowserOperationRuntime: mocks.wake,
}));

const OLD_RUN_ID = '11111111-1111-4111-8111-111111111111';
const REPLACEMENT_RUN_ID = '22222222-2222-4222-8222-222222222222';

function operationRun(id: string, status: OperationRun['status']): OperationRun {
  return {
    id,
    operationKey: 'sourcing.collect_wing_catalog_batch',
    definitionVersion: 1,
    title: 'Wing 카탈로그 수집',
    ownerDomain: 'sourcing',
    engineType: 'browser',
    resourceClass: 'extension_coupang',
    executionTimeoutMs: 900_000,
    status,
    triggerSource: 'domain_screen',
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe('useSourcingOperationAction retry adoption', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('adopts and wakes the replacement before a stale old-run invalidation settles or fails', async () => {
    const oldRun = operationRun(OLD_RUN_ID, 'attention_required');
    const replacement = operationRun(REPLACEMENT_RUN_ID, 'queued');
    const client = makeClient();
    client.setQueryData(queryKeys.operations.run(OLD_RUN_ID), oldRun);
    mocks.retryBrowserRun.mockResolvedValueOnce(replacement);
    mocks.wake.mockResolvedValueOnce(true);

    const staleInvalidation = deferred<void>();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) => {
      return JSON.stringify(filters.queryKey) === JSON.stringify(queryKeys.operations.run(OLD_RUN_ID))
        ? staleInvalidation.promise
        : Promise.resolve();
    });
    const view = renderHook(
      () => useSourcingOperationAction({
        operationKey: oldRun.operationKey,
        input: { keywords: ['스티커'], maxPages: 1, purpose: 'catalog_search' },
        snapshotQueryKey: ['sourcing', 'wing-catalog', '스티커'],
        initialRunId: OLD_RUN_ID,
      }),
      { wrapper: wrapper(client) },
    );

    let retry: Promise<OperationRun | null> | undefined;
    let retryResult: OperationRun | null | undefined;
    let retryError: unknown;
    try {
      await act(async () => {
        retry = view.result.current.retryAttention();
        void retry.then(
          (result) => { retryResult = result; },
          (error: unknown) => { retryError = error; },
        );
      });

      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.operations.run(OLD_RUN_ID),
      }));
      await waitFor(() => {
        expect(view.result.current.runId).toBe(REPLACEMENT_RUN_ID);
        expect(view.result.current.run?.id).toBe(REPLACEMENT_RUN_ID);
        expect(retryResult).toEqual(replacement);
        expect(mocks.wake).toHaveBeenCalledTimes(1);
      });
      expect(retryError).toBeUndefined();
      expect(client.getQueryData(queryKeys.operations.run(REPLACEMENT_RUN_ID))).toEqual(replacement);

      await act(async () => {
        staleInvalidation.reject(new Error('old_run_refetch_failed'));
        await Promise.resolve();
      });
      expect(view.result.current.runId).toBe(REPLACEMENT_RUN_ID);
      expect(retryError).toBeUndefined();
    } finally {
      staleInvalidation.reject(new Error('test_cleanup'));
      await retry?.catch(() => undefined);
    }
  });
});
