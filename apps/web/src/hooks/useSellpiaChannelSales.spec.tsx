import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSellpiaSalesSummary } from '@/lib/sellpia-sales-api';
import {
  sellpiaMonthRange,
  sellpiaPeriodRange,
  useSellpiaChannelSales,
  useSellpiaKnownThrough,
} from './useSellpiaChannelSales';

vi.mock('@/lib/sellpia-sales-api', () => ({
  fetchSellpiaSalesSummary: vi.fn(),
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

describe('useSellpiaChannelSales reads', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-18T10:00:00.000Z'));
    vi.clearAllMocks();
    vi.mocked(fetchSellpiaSalesSummary).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only reads Sellpia sales; collection belongs to the shared source control', async () => {
    const { result } = renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(makeQueryClient()) },
    );

    await waitFor(() => expect(fetchSellpiaSalesSummary).toHaveBeenCalledTimes(1));
    expect(result.current).not.toHaveProperty('sync');
    expect(result.current).not.toHaveProperty('syncing');
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
});

describe('sellpiaMonthRange', () => {
  it('keeps the anchor month empty on day one and rejects future months', () => {
    expect(sellpiaMonthRange('2026-09', '2026-08-31')).toBeNull();
    expect(sellpiaMonthRange('2026-08', '2026-08-31')).toEqual({
      from: '2026-08-01', to: '2026-08-31',
    });
    expect(sellpiaMonthRange('2026-09', '2026-09-01')).toEqual({
      from: '2026-09-01', to: '2026-09-01',
    });
    expect(sellpiaMonthRange('2026-10', '2026-09-01')).toBeNull();
    expect(sellpiaMonthRange('invalid', '2026-09-01')).toBeNull();
  });

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
