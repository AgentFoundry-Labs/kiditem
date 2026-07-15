import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const api = vi.hoisted(() => ({
  getState: vi.fn(),
  listHistory: vi.fn(),
  requestRefresh: vi.fn(),
  confirmSourceBinding: vi.fn(),
  importManual: vi.fn(),
}));

vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: api,
}));

import { useSellpiaInventoryFreshness } from './useSellpiaInventoryFreshness';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useSellpiaInventoryFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getState.mockResolvedValue({ status: 'fresh' });
    api.listHistory.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
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

  it('invalidates freshness and unified history after a manual attested import', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(
      () => useSellpiaInventoryFreshness({ enabled: true }),
      { wrapper: wrapper(client) },
    );

    await result.current.importManual(new File(['x'], 'fresh.xls'), true);

    expect(api.importManual).toHaveBeenCalledWith(expect.any(File), true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.inventory.freshness() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.inventory.history() });
  });
});
