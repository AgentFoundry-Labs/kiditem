import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyChannelRecipeAutomation,
  getChannelRecipeAutomationPreview,
  linkChannelListingOption,
  linkChannelListingProduct,
  listChannelProductCandidates,
  listChannelProductMappings,
  listChannelVariantCandidates,
} from '../lib/channel-sku-matching-api';
import {
  useApplyChannelRecipeAutomation,
  useChannelRecipeAutomationPreview,
  useChannelProductCandidates,
  useChannelProductMappings,
  useChannelVariantCandidates,
  useLinkChannelListingOption,
  useLinkChannelListingProduct,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  importCoupangWingCatalog: vi.fn(),
  applyChannelRecipeAutomation: vi.fn(),
  getChannelRecipeAutomationPreview: vi.fn(),
  linkChannelListingOption: vi.fn(),
  linkChannelListingProduct: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelProductCandidates: vi.fn(),
  listChannelProductMappings: vi.fn(),
  listChannelVariantCandidates: vi.fn(),
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

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

  it('waits for an account before previewing recipe automation', async () => {
    vi.mocked(getChannelRecipeAutomationPreview).mockResolvedValue({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: { variants: 0, affectedOptions: 0, autoApply: 0, operatorReview: 0, blocked: 0, alreadyConfigured: 0 },
      items: [],
    });
    const client = createClient();
    const waiting = renderHook(() => useChannelRecipeAutomationPreview(undefined), {
      wrapper: wrapper(client),
    });
    expect(waiting.result.current.fetchStatus).toBe('idle');
    waiting.unmount();

    const loaded = renderHook(() => useChannelRecipeAutomationPreview(ACCOUNT_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(loaded.result.current.isSuccess).toBe(true));
    expect(getChannelRecipeAutomationPreview).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it('posts the exact preview version and invalidates every inventory consumer', async () => {
    vi.mocked(applyChannelRecipeAutomation).mockResolvedValue({
      proposalVersion: 'a'.repeat(64),
      appliedVariants: 7,
      affectedOptions: 9,
      skippedExistingVariants: 0,
    });
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useApplyChannelRecipeAutomation(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await hook.result.current.mutateAsync({
        channelAccountId: ACCOUNT_ID,
        proposalVersion: 'a'.repeat(64),
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelSkuAvailability'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products', 'operations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['channelProductMappings', 'recipe-automation-preview', ACCOUNT_ID],
    });
  });
});

function emptyQueue() {
  return {
    products: [], options: [],
    counts: {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: { all: 0, linked: 0, unlinked: 0, recipeConfirmed: 0, configurationRequired: 0, reviewRequired: 0 },
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
