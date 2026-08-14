import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSourcingOperationAction } from './use-sourcing-operation-action';
import type { OperationRun } from '@kiditem/shared/operations';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  run: undefined as unknown,
  observedRunId: null as string | null,
  wake: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => ({
  wakeBrowserOperationRuntime: mocks.wake,
}));

vi.mock('@/hooks/useOperationRun', () => ({
  useStartOperation: () => ({ mutateAsync: mocks.start, isPending: false }),
  useCancelOperationRun: () => ({ mutateAsync: mocks.cancel, isPending: false }),
  useRetryBrowserOperationRun: () => ({ mutateAsync: mocks.retry, isPending: false }),
  useOperationRun: (runId: string | null) => {
    mocks.observedRunId = runId;
    return { data: mocks.run, isLoading: false, isError: false };
  },
}));

const RUN_A = '11111111-1111-4111-8111-111111111111';
const RUN_B = '22222222-2222-4222-8222-222222222222';

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
    progress: status === 'succeeded' ? 1 : null,
    stage: status === 'succeeded' ? 'completed' : null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: null,
    result: status === 'succeeded'
      ? {
          outcome: 'complete',
          summary: { discovered: 2, accepted: 2, duplicate: 0, unchanged: 0, failed: 0 },
          sources: [],
        }
      : null,
    error: null,
    requestedBy: null,
    scheduledFor: null,
    startedAt: null,
    finishedAt: status === 'succeeded' ? '2026-08-14T00:01:00.000Z' : null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:01:00.000Z',
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const options = {
  operationKey: 'sourcing.collect_wing_catalog_batch',
  input: {
    keywords: ['스티커'],
    maxPages: 1,
    purpose: 'catalog_search',
  },
  snapshotQueryKey: ['sourcing', 'wing-catalog', '스티커'] as const,
  idempotencyKey: 'wing-search-1',
};

describe('useSourcingOperationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run = undefined;
    mocks.observedRunId = null;
    mocks.wake.mockResolvedValue(true);
  });

  it('starts the exact operation with strict input and owns its returned run ID', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    const client = makeClient();
    const { result } = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.start();
    });

    expect(mocks.start).toHaveBeenCalledWith({
      operationKey: options.operationKey,
      input: {
        sourceSurface: 'domain_screen',
        input: options.input,
        idempotencyKey: options.idempotencyKey,
      },
    });
    expect(result.current.runId).toBe(RUN_A);
    expect(mocks.wake).toHaveBeenCalledTimes(1);
  });

  it('keeps the durable server run successful when the extension nudge fails', async () => {
    const run = operationRun(RUN_A, 'queued');
    mocks.start.mockResolvedValueOnce(run);
    mocks.wake.mockRejectedValueOnce(new Error('extension unavailable'));
    const client = makeClient();
    const { result } = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    let started: OperationRun | undefined;
    await act(async () => {
      started = await result.current.start();
    });
    expect(started).toEqual(run);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.wake).toHaveBeenCalledTimes(1);
  });

  it('does not wake a browser provider for a server-only operation lane', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    const client = makeClient();
    const { result } = renderHook(() => useSourcingOperationAction({
      ...options,
      operationKey: 'sourcing.detect_rising_products',
      wakeBrowserRuntime: false,
    }), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.start({ windowDays: 14 });
    });

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.wake).not.toHaveBeenCalled();
  });

  it('invalidates the snapshot exactly once after its latest run succeeds', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await view.result.current.start();
    });
    mocks.run = operationRun(RUN_A, 'succeeded');
    view.rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: options.snapshotQueryKey,
    }));

    view.rerender();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('invalidates the snapshot key captured by the run even if form input changes later', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(
      ({ searchKeyword }: { searchKeyword: string }) =>
        useSourcingOperationAction({
          ...options,
          input: { ...options.input, keywords: [searchKeyword] },
          snapshotQueryKey: ['sourcing', 'wing-catalog', searchKeyword] as const,
        }),
      {
        initialProps: { searchKeyword: '스티커' },
        wrapper: wrapper(client),
      },
    );

    await act(async () => {
      await view.result.current.start();
    });
    view.rerender({ searchKeyword: '클레이' });
    mocks.run = operationRun(RUN_A, 'succeeded');
    view.rerender({ searchKeyword: '클레이' });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['sourcing', 'wing-catalog', '스티커'],
    }));
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ['sourcing', 'wing-catalog', '클레이'],
    });
  });

  it('starts with the event-time input and captures its matching snapshot key', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });
    const eventInput = {
      keywords: ['클레이'],
      maxPages: 1,
      purpose: 'catalog_search',
    } as const;
    const eventSnapshotKey = ['sourcing', 'wing-catalog', '클레이'] as const;

    await act(async () => {
      await view.result.current.start(eventInput, [eventSnapshotKey]);
    });

    expect(mocks.start).toHaveBeenCalledWith({
      operationKey: options.operationKey,
      input: {
        sourceSurface: 'domain_screen',
        input: eventInput,
        idempotencyKey: options.idempotencyKey,
      },
    });

    mocks.run = operationRun(RUN_A, 'succeeded');
    view.rerender();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: eventSnapshotKey,
    }));
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: options.snapshotQueryKey,
    });
  });

  it('ignores a terminal notification from an older run after a newer start', async () => {
    mocks.start
      .mockResolvedValueOnce(operationRun(RUN_A, 'queued'))
      .mockResolvedValueOnce(operationRun(RUN_B, 'queued'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await view.result.current.start();
      await view.result.current.start();
    });
    expect(view.result.current.runId).toBe(RUN_B);

    mocks.run = operationRun(RUN_A, 'succeeded');
    view.rerender();
    await act(async () => Promise.resolve());
    expect(invalidate).not.toHaveBeenCalled();

    mocks.run = operationRun(RUN_B, 'succeeded');
    view.rerender();
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });

  it('invalidates every owner snapshot key exactly once for the latest successful run', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const productKey = ['sourcing', 'wing-tracked-products'] as const;
    const historyKey = ['sourcing', 'wing-tracked-products', 'history', 30] as const;
    const view = renderHook(() => useSourcingOperationAction({
      ...options,
      snapshotQueryKeys: [productKey, historyKey],
    }), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await view.result.current.start();
    });
    mocks.run = operationRun(RUN_A, 'succeeded');
    view.rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: productKey });
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: historyKey });

    view.rerender();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('cancels and retries only the latest owned run', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    mocks.retry.mockResolvedValueOnce(operationRun(RUN_B, 'queued'));
    const client = makeClient();
    const { result } = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.start();
      await result.current.cancel();
      await result.current.retryAttention();
    });

    expect(mocks.cancel).toHaveBeenCalledWith(RUN_A);
    expect(mocks.retry).toHaveBeenCalledWith(RUN_A);
  });

  it('adopts the replacement run from one attention retry so polling leaves the old run', async () => {
    mocks.start.mockResolvedValueOnce(operationRun(RUN_A, 'queued'));
    mocks.retry.mockResolvedValueOnce(operationRun(RUN_B, 'queued'));
    const client = makeClient();
    const { result } = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.start();
      await result.current.retryAttention();
    });

    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(mocks.retry).toHaveBeenCalledWith(RUN_A);
    expect(result.current.runId).toBe(RUN_B);
    expect(mocks.observedRunId).toBe(RUN_B);
  });

  it('does not let a stale attention retry replace a newer started run', async () => {
    let resolveRetry!: (run: OperationRun) => void;
    const retry = new Promise<OperationRun>((resolve) => {
      resolveRetry = resolve;
    });
    mocks.start
      .mockResolvedValueOnce(operationRun(RUN_A, 'queued'))
      .mockResolvedValueOnce(operationRun(RUN_B, 'queued'));
    mocks.retry.mockReturnValueOnce(retry);
    const client = makeClient();
    const { result } = renderHook(() => useSourcingOperationAction(options), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.start();
    });
    const pendingRetry = result.current.retryAttention();
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      resolveRetry(operationRun('33333333-3333-4333-8333-333333333333', 'queued'));
      await pendingRetry;
    });

    expect(result.current.runId).toBe(RUN_B);
    expect(mocks.observedRunId).toBe(RUN_B);
  });
});
