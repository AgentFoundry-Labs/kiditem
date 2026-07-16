import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  linkChannelListingOption,
  linkChannelListingProduct,
  listChannelProductCandidates,
  listChannelProductMappings,
  listChannelVariantCandidates,
} from '../lib/channel-sku-matching-api';
import {
  useChannelProductCandidates,
  useChannelProductMappings,
  useChannelVariantCandidates,
  useLinkChannelListingOption,
  useLinkChannelListingProduct,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  importCoupangWingCatalog: vi.fn(),
  linkChannelListingOption: vi.fn(),
  linkChannelListingProduct: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelProductCandidates: vi.fn(),
  listChannelProductMappings: vi.fn(),
  listChannelVariantCandidates: vi.fn(),
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';

describe('channel product matching hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits for an account before loading the two-level queue', async () => {
    vi.mocked(listChannelProductMappings).mockResolvedValue(emptyQueue());
    const client = createClient();
    const waiting = renderHook(() => useChannelProductMappings({ channelAccountId: undefined, search: '' }), { wrapper: wrapper(client) });
    expect(waiting.result.current.fetchStatus).toBe('idle');
    waiting.unmount();

    const loaded = renderHook(() => useChannelProductMappings({ channelAccountId: 'account-1', search: '우산' }), { wrapper: wrapper(client) });
    await waitFor(() => expect(loaded.result.current.isSuccess).toBe(true));
    expect(listChannelProductMappings).toHaveBeenCalledWith({ channelAccountId: 'account-1', search: '우산' });
  });

  it('clears the previous account queue while a newly selected account loads', async () => {
    vi.mocked(listChannelProductMappings).mockImplementation(({ channelAccountId }) => (
      channelAccountId === 'account-a'
        ? Promise.resolve(emptyQueue())
        : new Promise(() => undefined)
    ));
    const client = createClient();
    const hook = renderHook(
      ({ accountId }) => useChannelProductMappings({ channelAccountId: accountId, search: '' }),
      { initialProps: { accountId: 'account-a' }, wrapper: wrapper(client) },
    );
    await waitFor(() => expect(hook.result.current.data).toBeDefined());

    hook.rerender({ accountId: 'account-b' });

    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.isLoading).toBe(true);
  });

  it('candidate reads never confirm links', async () => {
    vi.mocked(listChannelProductCandidates).mockResolvedValue({ items: [] });
    vi.mocked(listChannelVariantCandidates).mockResolvedValue({ items: [] });
    const client = createClient();
    const product = renderHook(() => useChannelProductCandidates(LISTING_ID, '', true), { wrapper: wrapper(client) });
    const variant = renderHook(() => useChannelVariantCandidates(OPTION_ID, '', true), { wrapper: wrapper(client) });
    await waitFor(() => expect(product.result.current.isSuccess && variant.result.current.isSuccess).toBe(true));
    expect(linkChannelListingProduct).not.toHaveBeenCalled();
    expect(linkChannelListingOption).not.toHaveBeenCalled();
  });

  it('invalidates the shared queue after separate product and option confirmations', async () => {
    vi.mocked(linkChannelListingProduct).mockResolvedValue({} as never);
    vi.mocked(linkChannelListingOption).mockResolvedValue({} as never);
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const product = renderHook(() => useLinkChannelListingProduct(), { wrapper: wrapper(client) });
    const option = renderHook(() => useLinkChannelListingOption(), { wrapper: wrapper(client) });

    await act(async () => {
      await product.result.current.mutateAsync({ channelListingId: LISTING_ID, masterProductId: null });
      await option.result.current.mutateAsync({ channelListingOptionId: OPTION_ID, productVariantId: null });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
  });
});

function emptyQueue() {
  return {
    products: [], options: [],
    counts: {
      products: { all: 0, matched: 0, unmatched: 0 },
      options: { all: 0, matched: 0, unmatched: 0, configurationRequired: 0, reviewRequired: 0 },
    },
  };
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
