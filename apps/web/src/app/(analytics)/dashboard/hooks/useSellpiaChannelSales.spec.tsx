import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { fetchSellpiaSalesSummary, ingestSellpiaSales } from '@/lib/sellpia-sales-api';
import {
  clearSellpiaSalesCacheFromExtension,
  collectSellpiaSaleSummaryFromExtension,
  readSellpiaSalesCacheFromExtension,
} from '@/lib/sellpia-sales-collection';
import { useSellpiaChannelSales } from './useSellpiaChannelSales';

vi.mock('@/lib/browser-storage', () => ({
  safeStorageGet: vi.fn(),
  safeStorageSet: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ status: 'ready', user: { organizationId: 'org-1' } }),
}));

vi.mock('@/lib/sellpia-sales-api', () => ({
  fetchSellpiaSalesSummary: vi.fn(),
  ingestSellpiaSales: vi.fn(),
}));

vi.mock('@/lib/sellpia-sales-collection', () => ({
  clearSellpiaSalesCacheFromExtension: vi.fn(),
  collectSellpiaSaleSummaryFromExtension: vi.fn(),
  readSellpiaSalesCacheFromExtension: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const payload = {
  range: { from: '2026-07-18', to: '2026-07-18' },
  sellers: [],
  provenance: {
    source: 'sellpia_sale_summary' as const,
    mode: 'selldate' as const,
    sellerScope: 'all' as const,
    responseShape: 'empty_object' as const,
    explicitEmpty: true as const,
  },
  capturedAt: '2026-07-18T10:00:00.000Z',
};

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
    vi.mocked(ingestSellpiaSales).mockResolvedValue({
      upserted: 0,
      businessDates: ['2026-07-17'],
      sellerCount: 0,
    });
    vi.mocked(clearSellpiaSalesCacheFromExtension).mockResolvedValue(undefined);
    vi.mocked(collectSellpiaSaleSummaryFromExtension).mockResolvedValue(payload);
    vi.mocked(readSellpiaSalesCacheFromExtension).mockResolvedValue(null);
    vi.mocked(safeStorageGet).mockReturnValue('2026-07-18');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes a cached payload once and skips the duplicate live 93-day collection', async () => {
    vi.mocked(safeStorageGet).mockReturnValue(null);
    vi.mocked(readSellpiaSalesCacheFromExtension).mockResolvedValue({
      payload,
      capturedAt: Date.now(),
    });
    const queryClient = makeQueryClient();

    renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(ingestSellpiaSales).toHaveBeenCalledTimes(1));
    expect(ingestSellpiaSales).toHaveBeenCalledWith(payload);
    expect(clearSellpiaSalesCacheFromExtension).toHaveBeenCalledTimes(1);
    expect(safeStorageSet).toHaveBeenCalledWith(
      'local',
      'kiditem-sellpia-sales-autosync:org-1',
      '2026-07-18',
    );
    expect(collectSellpiaSaleSummaryFromExtension).not.toHaveBeenCalled();
  });

  it('keeps a successful cache ingest single even when cache cleanup fails', async () => {
    vi.mocked(safeStorageGet).mockReturnValue(null);
    vi.mocked(readSellpiaSalesCacheFromExtension).mockResolvedValue({
      payload,
      capturedAt: Date.now(),
    });
    vi.mocked(clearSellpiaSalesCacheFromExtension).mockRejectedValueOnce(
      new Error('extension worker restarted'),
    );

    renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(makeQueryClient()) },
    );

    await waitFor(() => expect(ingestSellpiaSales).toHaveBeenCalledTimes(1));
    expect(collectSellpiaSaleSummaryFromExtension).not.toHaveBeenCalled();
  });

  it('persists an old cache and then collects today instead of marking the day complete', async () => {
    const stalePayload = {
      ...payload,
      range: { from: '2026-07-17', to: '2026-07-17' },
    };
    vi.mocked(safeStorageGet).mockReturnValue(null);
    vi.mocked(readSellpiaSalesCacheFromExtension).mockResolvedValue({
      payload: stalePayload,
      capturedAt: Date.now() - 24 * 60 * 60 * 1000,
    });

    renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(makeQueryClient()) },
    );

    await waitFor(() => expect(ingestSellpiaSales).toHaveBeenCalledTimes(2));
    expect(ingestSellpiaSales).toHaveBeenNthCalledWith(1, stalePayload);
    expect(ingestSellpiaSales).toHaveBeenNthCalledWith(2, payload);
    expect(collectSellpiaSaleSummaryFromExtension).toHaveBeenCalledTimes(1);
  });

  it('manual sync invalidates both dashboard sales and readiness state', async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useSellpiaChannelSales({ from: '2026-07-01', to: '2026-07-18' }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(readSellpiaSalesCacheFromExtension).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.sync();
    });

    expect(collectSellpiaSaleSummaryFromExtension).toHaveBeenCalledTimes(1);
    expect(ingestSellpiaSales).toHaveBeenCalledWith(payload);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'sellpia-sales'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['readiness'] });
    expect(result.current.syncing).toBe(false);
  });
});
