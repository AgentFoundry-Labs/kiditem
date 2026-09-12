import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSellpiaSalesSummary } from '@/lib/sellpia-sales-api';
import { collectSellpiaSaleSummaryFromExtension } from '@/lib/sellpia-sales-collection';
import {
  sellpiaMonthRange,
  sellpiaPeriodRange,
  useSellpiaChannelSales,
  useSellpiaKnownThrough,
} from './useSellpiaChannelSales';

vi.mock('@/lib/sellpia-sales-api', () => ({
  fetchSellpiaSalesSummary: vi.fn(),
  sellpiaSalesErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : '판매현황 수집에 실패했습니다.',
}));

vi.mock('@/lib/sellpia-sales-collection', () => ({
  collectSellpiaSaleSummaryFromExtension: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useSellpiaChannelSales synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-18T10:00:00.000Z'));
    vi.clearAllMocks();
    vi.mocked(fetchSellpiaSalesSummary).mockResolvedValue({} as never);
    vi.mocked(collectSellpiaSaleSummaryFromExtension).mockResolvedValue({
      success: true,
      terminalState: 'COMPLETE',
      attemptId: '11111111-1111-4111-8111-111111111111',
      state: 'COMPLETE',
      sourceType: 'sellpia_sales_daily',
      expiresAt: '2099-01-01T00:00:00.000Z',
      plan: {} as never,
      actualCutoffAt: '2026-07-18T00:00:00.000Z',
      completedAt: '2026-07-18T10:00:00.000Z',
      contentChecksum: 'a'.repeat(64),
      contentByteCount: 100,
      rowCount: 2,
      sellerCount: 1,
      businessDates: ['2026-07-17', '2026-07-18'],
      errorCode: null,
      errorMessage: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start provider collection while the dashboard only reads data', async () => {
    renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(makeQueryClient()) },
    );

    await waitFor(() => expect(fetchSellpiaSalesSummary).toHaveBeenCalledTimes(1));
    expect(collectSellpiaSaleSummaryFromExtension).not.toHaveBeenCalled();
  });

  it('uses the server response as the closed-date clock', async () => {
    vi.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));
    vi.mocked(fetchSellpiaSalesSummary).mockResolvedValueOnce({
      knownThrough: '2026-07-17',
    } as never);

    const { result } = renderHook(() => useSellpiaKnownThrough(), {
      wrapper: wrapper(makeQueryClient()),
    });

    await waitFor(() => expect(result.current).toBe('2026-07-17'));
  });

  it('starts the frozen source owner only on explicit sync and invalidates reads', async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await result.current.sync();
    });

    expect(collectSellpiaSaleSummaryFromExtension).toHaveBeenCalledTimes(1);
    expect(collectSellpiaSaleSummaryFromExtension).toHaveBeenCalledWith();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'sellpia-sales'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['readiness'] });
    expect(result.current.syncing).toBe(false);
  });

  it('keeps failed owner publication hidden from dashboard invalidation', async () => {
    vi.mocked(collectSellpiaSaleSummaryFromExtension).mockResolvedValueOnce({
      success: false,
      terminalState: 'FAILED',
      errorMessage: '로그인이 필요합니다.',
    } as never);
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await result.current.sync();
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(result.current.syncing).toBe(false);
  });
});

describe('sellpiaMonthRange', () => {
  it('uses the server cutoff as the end of the current KST month', () => {
    expect(sellpiaMonthRange('2026-07', '2026-07-25')).toEqual({
      from: '2026-07-01',
      to: '2026-07-25',
    });
  });

  it('uses the calendar month end for a completed month', () => {
    expect(sellpiaMonthRange('2024-02', '2026-07-25')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });
});

describe('sellpiaPeriodRange', () => {
  it('keeps the current calendar month empty on its first KST day', () => {
    expect(sellpiaPeriodRange('month', '', '', '2026-08-31')).toBeNull();
    expect(sellpiaPeriodRange('month', '', '', '2026-09-01')).toEqual({
      from: '2026-09-01',
      to: '2026-09-01',
    });
  });
});
