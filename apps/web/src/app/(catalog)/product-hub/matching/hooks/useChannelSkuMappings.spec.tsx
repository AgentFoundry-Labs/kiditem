import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import {
  importCoupangWingCatalog,
  listChannelAccounts,
  listChannelSkuCandidates,
  listChannelSkuMappings,
  refreshChannelSkuMappingStatuses,
  replaceChannelSkuComponents,
} from '../lib/channel-sku-matching-api';
import {
  useChannelAccounts,
  useChannelSkuCandidates,
  useChannelSkuMappings,
  useImportCoupangWingCatalog,
  useRefreshChannelSkuMappingStatuses,
  useReplaceChannelSkuComponents,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  importCoupangWingCatalog: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelSkuCandidates: vi.fn(),
  listChannelSkuMappings: vi.fn(),
  refreshChannelSkuMappingStatuses: vi.fn(),
  replaceChannelSkuComponents: vi.fn(),
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_SKU_ID = '22222222-2222-4222-8222-222222222222';
const INVENTORY_SKU_ID = '33333333-3333-4333-8333-333333333333';

const emptyResponse = {
  items: [],
  total: 0,
  page: 1,
  limit: 50,
  counts: { all: 0, unmatched: 0, needsReview: 0, matched: 0 },
};

function createClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
    ...config,
  });
}

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('channel SKU matching hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads active accounts with the shared account query key', async () => {
    vi.mocked(listChannelAccounts).mockResolvedValue([]);
    const client = createClient();

    const { result } = renderHook(() => useChannelAccounts(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.channelAccounts.active())).toEqual([]);
  });

  it('waits for a selected account unless all-account mode is explicit', async () => {
    vi.mocked(listChannelSkuMappings).mockResolvedValue(emptyResponse);
    const client = createClient();

    const selectedScope = renderHook(
      () =>
        useChannelSkuMappings({
          accountMode: 'selected',
          channelAccountId: undefined,
          mappingStatus: 'all',
          search: '',
          page: 1,
          limit: 50,
        }),
      { wrapper: wrapper(client) },
    );

    expect(selectedScope.result.current.fetchStatus).toBe('idle');
    expect(listChannelSkuMappings).not.toHaveBeenCalled();
    selectedScope.unmount();

    const allScope = renderHook(
      () =>
        useChannelSkuMappings({
          accountMode: 'all',
          channelAccountId: undefined,
          mappingStatus: 'all',
          search: '',
          page: 1,
          limit: 50,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(allScope.result.current.isSuccess).toBe(true));
    expect(listChannelSkuMappings).toHaveBeenCalledWith(
      expect.objectContaining({ channelAccountId: undefined, page: 1 }),
    );
  });

  it('keeps the previous server page while the next page loads', async () => {
    const nextPage = deferred<typeof emptyResponse>();
    vi.mocked(listChannelSkuMappings)
      .mockResolvedValueOnce({ ...emptyResponse, page: 1, total: 60 })
      .mockReturnValueOnce(nextPage.promise);
    const client = createClient();
    let page = 1;

    const { result, rerender } = renderHook(
      () =>
        useChannelSkuMappings({
          accountMode: 'selected',
          channelAccountId: ACCOUNT_ID,
          mappingStatus: 'all',
          search: '',
          page,
          limit: 50,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data?.page).toBe(1));
    page = 2;
    rerender();

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data?.page).toBe(1);

    await act(async () => {
      nextPage.resolve({ ...emptyResponse, page: 2, total: 60 });
      await nextPage.promise;
    });
    await waitFor(() => expect(result.current.data?.page).toBe(2));
  });

  it('does not show a previous account row while another account loads', async () => {
    const nextAccount = deferred<typeof emptyResponse>();
    vi.mocked(listChannelSkuMappings)
      .mockResolvedValueOnce({ ...emptyResponse, page: 1, total: 1 })
      .mockReturnValueOnce(nextAccount.promise);
    const client = createClient();
    let channelAccountId = ACCOUNT_ID;

    const { result, rerender } = renderHook(
      () =>
        useChannelSkuMappings({
          accountMode: 'selected',
          channelAccountId,
          mappingStatus: 'all',
          search: '',
          page: 1,
          limit: 50,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data?.total).toBe(1));
    channelAccountId = '99999999-9999-4999-8999-999999999999';
    rerender();

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not load candidates while the component dialog is closed', () => {
    const client = createClient();

    const { result } = renderHook(
      () => useChannelSkuCandidates(CHANNEL_SKU_ID, '', false),
      { wrapper: wrapper(client) },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(listChannelSkuCandidates).not.toHaveBeenCalled();
  });

  it('always refetches actionable candidate evidence when a dialog remounts', async () => {
    vi.mocked(listChannelSkuCandidates).mockResolvedValue({ items: [] });
    const client = createClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 60_000 },
        mutations: { retry: false },
      },
    });

    const first = renderHook(
      () => useChannelSkuCandidates(CHANNEL_SKU_ID, '', true),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(
      () => useChannelSkuCandidates(CHANNEL_SKU_ID, '', true),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(listChannelSkuCandidates).toHaveBeenCalledTimes(2);
  });

  it('invalidates mapping lists and only the replaced SKU candidate family', async () => {
    vi.mocked(replaceChannelSkuComponents).mockResolvedValue({} as never);
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReplaceChannelSkuComponents(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        channelSkuId: CHANNEL_SKU_ID,
        input: {
          components: [{ inventorySkuId: INVENTORY_SKU_ID, quantity: 4 }],
        },
      });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.channelSkuMappings.lists(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['channelSkuMappings', 'candidates', CHANNEL_SKU_ID],
    });
  });

  it('invalidates mapping lists and all actionable candidates after status refresh', async () => {
    vi.mocked(refreshChannelSkuMappingStatuses).mockResolvedValue(
      emptyResponse.counts,
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(
      () => useRefreshChannelSkuMappingStatuses(),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await result.current.mutateAsync({ channelAccountId: ACCOUNT_ID });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.channelSkuMappings.lists(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['channelSkuMappings', 'candidates'],
    });
  });

  it('refreshes imported-account statuses before invalidating lists and candidates', async () => {
    const imported = { duplicate: false } as never;
    vi.mocked(importCoupangWingCatalog).mockResolvedValue(imported);
    vi.mocked(refreshChannelSkuMappingStatuses).mockResolvedValue(
      emptyResponse.counts,
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useImportCoupangWingCatalog(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({
        channelAccountId: ACCOUNT_ID,
        file: new File(['wing'], 'wing.xlsx'),
      })).resolves.toEqual({ response: imported, statusRefreshFailed: false });
    });

    expect(refreshChannelSkuMappingStatuses).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.channelSkuMappings.lists(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['channelSkuMappings', 'candidates'],
    });
    expect(
      vi.mocked(refreshChannelSkuMappingStatuses).mock.invocationCallOrder[0],
    ).toBeLessThan(invalidate.mock.invocationCallOrder[0] ?? Infinity);
  });

  it('keeps a successful Wing upload successful when status refresh fails and invalidates in finally', async () => {
    const imported = { duplicate: false, changes: { createdSkuCount: 3 } } as never;
    vi.mocked(importCoupangWingCatalog).mockResolvedValue(imported);
    vi.mocked(refreshChannelSkuMappingStatuses).mockRejectedValue(
      new Error('status refresh failed'),
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useImportCoupangWingCatalog(), {
      wrapper: wrapper(client),
    });

    await expect(
      act(() =>
        result.current.mutateAsync({
          channelAccountId: ACCOUNT_ID,
          file: new File(['wing'], 'wing.xlsx'),
        }),
      ),
    ).resolves.toEqual({ response: imported, statusRefreshFailed: true });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.channelSkuMappings.lists(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['channelSkuMappings', 'candidates'],
    });
  });

  it('does not optimistically write imported mapping rows or components', async () => {
    const pending = deferred<never>();
    vi.mocked(importCoupangWingCatalog).mockReturnValue(pending.promise);
    const client = createClient();
    const cached = { ...emptyResponse, total: 9 };
    const listKey = queryKeys.channelSkuMappings.list({
      channelAccountId: ACCOUNT_ID,
      mappingStatus: 'all',
      search: '',
      page: '1',
      limit: '50',
    });
    client.setQueryData(listKey, cached);
    const { result } = renderHook(() => useImportCoupangWingCatalog(), {
      wrapper: wrapper(client),
    });

    act(() => {
      result.current.mutate({
        channelAccountId: ACCOUNT_ID,
        file: new File(['wing'], 'wing.xlsx'),
      });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(client.getQueryData(listKey)).toBe(cached);
  });

  it('propagates API failures to the calling component', async () => {
    const error = new Error('Wing import failed');
    vi.mocked(importCoupangWingCatalog).mockRejectedValue(error);
    const client = createClient();
    const { result } = renderHook(() => useImportCoupangWingCatalog(), {
      wrapper: wrapper(client),
    });

    await expect(
      act(() =>
        result.current.mutateAsync({
          channelAccountId: ACCOUNT_ID,
          file: new File(['wing'], 'wing.xlsx'),
        }),
      ),
    ).rejects.toBe(error);
  });
});
