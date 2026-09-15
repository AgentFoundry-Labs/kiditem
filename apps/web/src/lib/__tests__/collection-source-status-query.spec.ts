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

  /**
   * 한 화면이 여러 원천을 읽으면 전역 throttler 에 걸릴 수 있다. 그때 응답이 알려 준
   * 대기 시간을 지키지 않고 짐작한 간격으로 다시 두드리면 창이 열릴 때까지 계속
   * 429 만 받는다(KID-170 D2).
   */
  it('waits the throttled response`s own Retry-After before asking again, and re-reads on that clock', async () => {
    const throttled = new ApiError(429, 'Too Many Requests', '요청이 너무 많습니다.', {
      retryAfterMs: 45_000,
    });
    const queryFn = vi.fn<() => Promise<Status>>().mockRejectedValue(throttled);
    const state = observeStatusQuery(queryFn);

    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    // 짐작한 1초가 아니라 창이 열린다고 한 시각까지 기다린다.
    await advance(44_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await advance(90_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(state()?.status).toBe('error');

    // 오류가 난 뒤의 다시 읽기도 고정 30초가 아니라 같은 시각을 지킨다.
    await advance(29_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
    await advance(16_000);
    expect(queryFn).toHaveBeenCalledTimes(5);
  });

  it('retries a throttled read on the doubling default when the response named no wait', async () => {
    const queryFn = vi.fn<() => Promise<Status>>()
      .mockRejectedValue(new ApiError(429, 'Too Many Requests', '요청이 너무 많습니다.'));
    const state = observeStatusQuery(queryFn);

    await advance(0);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await advance(2_000);
    expect(queryFn).toHaveBeenCalledTimes(3);
    await advance(4_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(state()?.status).toBe('error');
  });

  /**
   * 이미 지난 시각을 가리키는 Retry-After 는 0 밀리초로 읽힌다. 그대로 쓰면 React
   * Query 가 refetchInterval: 0 을 "간격 없음"으로 읽어, 오류가 난 상태 읽기가 다시는
   * 스스로 회복하지 못한다(KID-170).
   */
  it('still re-reads on a clock when the throttled response`s Retry-After has already passed', async () => {
    const queryFn = vi.fn<() => Promise<Status>>().mockRejectedValue(
      new ApiError(429, 'Too Many Requests', '요청이 너무 많습니다.', { retryAfterMs: 0 }),
    );
    const state = observeStatusQuery(queryFn);

    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await advance(999);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(3);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(state()?.status).toBe('error');

    // 오류 뒤의 다시 읽기도 멈추지 않는다.
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(5);
  });

  it('waits at most a minute even when the throttled response asks for longer', async () => {
    const queryFn = vi.fn<() => Promise<Status>>().mockRejectedValue(
      new ApiError(429, 'Too Many Requests', '요청이 너무 많습니다.', { retryAfterMs: 600_000 }),
    );
    observeStatusQuery(queryFn);

    await advance(0);
    await advance(59_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
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
