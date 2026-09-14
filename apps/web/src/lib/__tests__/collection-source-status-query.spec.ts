import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { makeQueryClient } from '@/components/providers/query-client';
import { ApiError } from '../api-error';
import {
  collectionSourceStatusQueryOptions,
  collectionSourceStatusRead,
} from '../collection-source-status-query';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

type Status = { state: 'RUNNING' | 'COMPLETE' };

const queryKey = ['collection-source-status-rule'];
const running: Status = { state: 'RUNNING' };
const complete: Status = { state: 'COMPLETE' };

/**
 * Mounts one observed status query (its observer owns retries and polling)
 * and reads the cached query state, which updates as soon as a read settles.
 */
function observeStatusQuery(
  queryFn: () => Promise<Status>,
  // Route specs default queries to `retry: false`; the shared rule must still own retries.
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  renderHook(() => useQuery(collectionSourceStatusQueryOptions({
    queryKey,
    queryFn,
    refetchInterval: (query) => (query.state.data?.state === 'RUNNING' ? 2_000 : false),
  })), { wrapper });
  return () => client.getQueryState<Status>(queryKey);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('collection source-status query rule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['a network failure', new ApiError(0, 'network_error', 'offline')],
    ['a request timeout', new ApiError(0, 'request_timeout', 'slow')],
    ['a 5xx response', new ApiError(503, 'SERVICE_UNAVAILABLE', 'unavailable')],
  ])('retries %s three times with growing delays before reporting it', async (_label, error) => {
    const queryFn = vi.fn<() => Promise<Status>>().mockRejectedValue(error);
    const state = observeStatusQuery(queryFn);

    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(state()?.status).toBe('pending');
    await advance(4_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(state()?.status).toBe('error');
    await advance(8_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['an expired session', new ApiError(401, 'auth_required', 'expired')],
    ['a missing organization', new ApiError(401, 'no_organization_context', 'no organization')],
    ['another 4xx response', new ApiError(404, null, 'missing')],
    ['schema drift', new ZodError([])],
    ['an unclassified error', new Error('unexpected')],
  ])('reports %s at once without retrying', async (_label, error) => {
    const queryFn = vi.fn<() => Promise<Status>>().mockRejectedValue(error);
    const state = observeStatusQuery(queryFn);

    await advance(0);
    expect(state()?.status).toBe('error');
    await advance(10_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('reads again every 30 seconds after a failed first read until the status recovers', async () => {
    const queryFn = vi.fn<() => Promise<Status>>()
      .mockRejectedValueOnce(new ApiError(404, null, 'missing'))
      .mockResolvedValue(complete);
    const state = observeStatusQuery(queryFn);

    await advance(0);
    expect(state()).toMatchObject({ status: 'error', data: undefined });
    await advance(29_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(state()).toMatchObject({ status: 'success', data: complete });

    // A recovered idle status goes back to the caller's own cadence (no polling here).
    await advance(60_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the faster RUNNING poll while reads succeed and reads every 30 seconds while they fail', async () => {
    const queryFn = vi.fn<() => Promise<Status>>().mockResolvedValue(running);
    const state = observeStatusQuery(queryFn);

    await advance(0);
    await advance(2_000);
    expect(queryFn).toHaveBeenCalledTimes(2);

    queryFn.mockRejectedValue(new ApiError(403, null, 'denied'));
    await advance(2_000);
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(state()).toMatchObject({ status: 'error', data: running });
    await advance(10_000);
    expect(queryFn).toHaveBeenCalledTimes(3);

    queryFn.mockResolvedValue(running);
    await advance(20_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(state()?.status).toBe('success');
    await advance(2_000);
    expect(queryFn).toHaveBeenCalledTimes(5);
  });

  it('toasts a failing status read once per failure streak across 30-second re-reads', async () => {
    const offline = new ApiError(0, 'network_error', 'API 서버에 연결하지 못했습니다.');
    const queryFn = vi.fn<() => Promise<Status>>().mockRejectedValue(offline);
    const state = observeStatusQuery(queryFn, makeQueryClient());

    await advance(7_000);
    expect(state()?.status).toBe('error');
    expect(toast.error).toHaveBeenCalledTimes(1);

    // Three more 30-second re-reads, each with its retries, fail the same way.
    await advance(111_000);
    expect(queryFn).toHaveBeenCalledTimes(16);
    expect(toast.error).toHaveBeenCalledTimes(1);

    queryFn.mockResolvedValue(running);
    await advance(30_000);
    expect(state()?.status).toBe('success');

    // A read that succeeded ends the streak, so the next failure toasts again.
    queryFn.mockRejectedValue(offline);
    await advance(9_000);
    expect(state()?.status).toBe('error');
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['loading', { data: undefined, isError: false }],
    ['unavailable', { data: undefined, isError: true }],
    ['rechecking', { data: complete, isError: true }],
    ['current', { data: complete, isError: false }],
  ] as const)('classifies a status read as %s', (expected, query) => {
    expect(collectionSourceStatusRead(query)).toBe(expected);
  });
});
