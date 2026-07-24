import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
const api = vi.hoisted(() => ({
  getState: vi.fn(),
  getCurrentBasis: vi.fn(),
  listHistory: vi.fn(),
  requestRefresh: vi.fn(),
  confirmSourceBinding: vi.fn(),
  importManual: vi.fn(),
}));
const invalidateSellpiaInventory = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: api,
}));
vi.mock('@/app/(inventory)/_shared/invalidate-sellpia-inventory', () => ({
  invalidateSellpiaInventory,
}));

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
    invalidateSellpiaInventory.mockResolvedValue(undefined);
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

  it('uses the full Sellpia invalidator after a manual attested import', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useSellpiaInventoryFreshness({ enabled: true }),
      { wrapper: wrapper(client) },
    );

    await result.current.importManual(new File(['x'], 'fresh.xls'), true);

    expect(api.importManual).toHaveBeenCalledWith(expect.any(File), true);
    expect(invalidateSellpiaInventory).toHaveBeenCalledWith(client);
  });

  it('returns the authoritative completed basis separately from the first attempt page', async () => {
    const currentBasis = {
      id: '33333333-3333-4333-8333-333333333333',
      fileName: 'authoritative.xls',
      fileHash: 'a'.repeat(64),
      status: 'completed' as const,
      rowCount: 42,
      importedAt: '2026-07-16T00:00:00.000Z',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      verificationCount: 1,
      lastTrigger: 'ttl_expired' as const,
      freshnessGeneration: '1',
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: { issues: [] },
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    api.getCurrentBasis.mockResolvedValueOnce(currentBasis);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useSellpiaInventoryFreshness({ enabled: true }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.currentBasis).toEqual(currentBasis));
    expect(api.getCurrentBasis).toHaveBeenCalledTimes(1);
  });

  it('keeps snapshot responses and drawer basis summaries in separate cache entries', async () => {
    const snapshotResponse = {
      items: [],
      total: 0,
      page: 1,
      limit: 1,
      summary: {
        totalSkus: 0,
        inStockSkus: 0,
        outOfStockSkus: 0,
        totalUnits: 0,
        pricedAssetValue: 0,
        unpricedSkuCount: 0,
      },
      latestImport: null,
    };
    const currentBasis = {
      id: '33333333-3333-4333-8333-333333333333',
      fileName: 'authoritative.xls',
      fileHash: 'a'.repeat(64),
      status: 'completed' as const,
      rowCount: 42,
      importedAt: '2026-07-16T00:00:00.000Z',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      verificationCount: 1,
      lastTrigger: 'ttl_expired' as const,
      freshnessGeneration: '1',
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: { issues: [] },
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const snapshotKey = queryKeys.inventory.snapshot({ page: '1', limit: '1' });
    const currentBasisKey = queryKeys.inventory.currentBasis();
    client.setQueryData(snapshotKey, snapshotResponse);
    api.getCurrentBasis.mockResolvedValueOnce(currentBasis);
    const { result } = renderHook(
      () => useSellpiaInventoryFreshness({ enabled: true }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.currentBasis).toEqual(currentBasis));
    expect(client.getQueryData(snapshotKey)).toEqual(snapshotResponse);
    expect(client.getQueryData(currentBasisKey)).toEqual(currentBasis);
  });
});
