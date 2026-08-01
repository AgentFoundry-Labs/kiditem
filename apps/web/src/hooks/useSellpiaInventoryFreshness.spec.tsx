import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api-error';
const api = vi.hoisted(() => ({
  getState: vi.fn(),
  getCurrentBasis: vi.fn(),
  listHistory: vi.fn(),
  requestRefresh: vi.fn(),
  confirmSourceBinding: vi.fn(),
  importManual: vi.fn(),
}));
const operations = vi.hoisted(() => ({
  startSellpiaInventoryRefreshAction: vi.fn(),
}));

vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: api,
}));

vi.mock('@/lib/manual-operation-actions', () => operations);

import {
  getSellpiaFreshnessPollInterval,
  shouldRetrySellpiaFreshness,
  useSellpiaInventoryFreshness,
} from './useSellpiaInventoryFreshness';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useSellpiaInventoryFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getState.mockResolvedValue({ status: 'fresh' });
    api.getCurrentBasis.mockResolvedValue(null);
    api.listHistory.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    operations.startSellpiaInventoryRefreshAction.mockResolvedValue({ id: 'run-1' });
  });

  it('polls active synchronization every 15 seconds and idle state every 60 seconds', () => {
    expect(getSellpiaFreshnessPollInterval(false, 'syncing', false)).toBe(false);
    expect(getSellpiaFreshnessPollInterval(true, 'syncing', false)).toBe(15_000);
    expect(getSellpiaFreshnessPollInterval(true, 'refresh_required', false)).toBe(15_000);
    expect(getSellpiaFreshnessPollInterval(true, 'fresh', false)).toBe(60_000);
    expect(getSellpiaFreshnessPollInterval(true, 'failed', false)).toBe(60_000);
    expect(getSellpiaFreshnessPollInterval(true, null, true)).toBe(60_000);
  });

  it('retries transient freshness reads once without retrying ordinary API errors', () => {
    expect(shouldRetrySellpiaFreshness(0, new Error('network reset'))).toBe(true);
    expect(shouldRetrySellpiaFreshness(1, new Error('network reset'))).toBe(false);
    expect(shouldRetrySellpiaFreshness(0, new ApiError(503, null, 'unavailable')))
      .toBe(true);
    expect(shouldRetrySellpiaFreshness(1, new ApiError(503, null, 'unavailable')))
      .toBe(false);
    expect(shouldRetrySellpiaFreshness(
      0,
      new ApiError(500, 'sellpia_schema_missing', 'schema missing'),
    )).toBe(false);
    expect(shouldRetrySellpiaFreshness(0, new ZodError([]))).toBe(false);
  });

  it('does not poll until authenticated coordination is enabled', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderHook(
      ({ enabled }) => useSellpiaInventoryFreshness({ enabled }),
      { initialProps: { enabled: false }, wrapper: wrapper(client) },
    );
    expect(api.getState).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(api.getState).toHaveBeenCalledTimes(1));
  });

  it('does not load drawer-only history or current-basis data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(
      () => useSellpiaInventoryFreshness({ enabled: true }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(api.getState).toHaveBeenCalledTimes(1));
    expect(api.listHistory).not.toHaveBeenCalled();
    expect(api.getCurrentBasis).not.toHaveBeenCalled();
  });

  it('uses the latest shared state to retry a failed sync from any trigger surface', async () => {
    api.getState.mockResolvedValue({ status: 'failed' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useSellpiaInventoryFreshness({
        enabled: true,
        sourceSurface: 'dashboard',
      }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await result.current.requestRefresh();
    });

    expect(operations.startSellpiaInventoryRefreshAction).toHaveBeenCalledWith({
      sourceSurface: 'dashboard',
      reason: 'retry',
    });
  });

});
