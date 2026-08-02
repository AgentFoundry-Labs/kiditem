import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  applyChannelRecipeAutomation,
  getChannelRecipeAutomationPreview,
  getSellpiaManualMatchTargets,
  importSellpiaManualMatchSnapshot,
  linkChannelListingOption,
  linkChannelListingOptionRecipe,
  linkChannelListingProduct,
  listRecipeComponentCandidates,
  listChannelProductCandidates,
  listChannelProductMappings,
  listChannelVariantCandidates,
} from '../lib/channel-sku-matching-api';
import {
  collectSellpiaManualMatchSnapshot,
  finalizeSellpiaManualMatchCollection,
} from '../lib/sellpia-manual-match-collection';
import {
  useChannelRecipeAutomationPreview,
  useChannelProductCandidates,
  useChannelProductMappings,
  useChannelVariantCandidates,
  useLinkChannelListingOption,
  useLinkChannelListingOptionRecipe,
  useLinkChannelListingProduct,
  useRecipeComponentCandidates,
  useRunChannelProductMatching,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  importCoupangWingCatalog: vi.fn(),
  applyChannelRecipeAutomation: vi.fn(),
  getChannelRecipeAutomationPreview: vi.fn(),
  getSellpiaManualMatchTargets: vi.fn(),
  importSellpiaManualMatchSnapshot: vi.fn(),
  linkChannelListingOption: vi.fn(),
  linkChannelListingOptionRecipe: vi.fn(),
  linkChannelListingProduct: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelProductCandidates: vi.fn(),
  listChannelProductMappings: vi.fn(),
  listRecipeComponentCandidates: vi.fn(),
  listChannelVariantCandidates: vi.fn(),
}));
vi.mock('../lib/sellpia-manual-match-collection', () => ({
  collectSellpiaManualMatchSnapshot: vi.fn(),
  finalizeSellpiaManualMatchCollection: vi.fn(),
}));
vi.mock('@/lib/browser-collection-session', () => ({
  issueBrowserCollectionRunId: vi.fn(),
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

describe('channel product matching hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(issueBrowserCollectionRunId).mockResolvedValue(
      '11111111-1111-4111-8111-111111111111',
    );
  });

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

  it('searches recipe component candidates without writing a recipe', async () => {
    vi.mocked(listRecipeComponentCandidates).mockResolvedValue({ items: [] });
    const client = createClient();
    const hook = renderHook(
      () => useRecipeComponentCandidates(' SP-001 ', true, true),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    expect(listRecipeComponentCandidates).toHaveBeenCalledWith({
      search: 'SP-001',
      includeOutOfStock: true,
    });
    expect(linkChannelListingOptionRecipe).not.toHaveBeenCalled();
  });

  it('invalidates the shared queue after separate product and option confirmations', async () => {
    vi.mocked(linkChannelListingProduct).mockResolvedValue(undefined);
    vi.mocked(linkChannelListingOption).mockResolvedValue(undefined);
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const product = renderHook(() => useLinkChannelListingProduct(), { wrapper: wrapper(client) });
    const option = renderHook(() => useLinkChannelListingOption(), { wrapper: wrapper(client) });

    await act(async () => {
      await product.result.current.mutateAsync({ channelListingId: LISTING_ID, masterProductId: null });
      await option.result.current.mutateAsync({ channelListingOptionId: OPTION_ID, productVariantId: null });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelSkuAvailability'] });
    expect(product.result.current.isError).toBe(false);
    expect(option.result.current.isError).toBe(false);
  });

  it('invalidates matching and inventory state after linking an option recipe', async () => {
    vi.mocked(linkChannelListingOptionRecipe).mockResolvedValue({
      channelListingOptionId: OPTION_ID,
      productVariantId: '44444444-4444-4444-8444-444444444444',
      sellpiaInventorySkuId: '55555555-5555-4555-8555-555555555555',
      quantity: 2,
      status: 'created',
    });
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useLinkChannelListingOptionRecipe(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await hook.result.current.mutateAsync({
        channelListingOptionId: OPTION_ID,
        sellpiaInventorySkuId: '55555555-5555-4555-8555-555555555555',
        quantity: 2,
      });
    });

    expect(linkChannelListingOptionRecipe).toHaveBeenCalledWith(OPTION_ID, {
      sellpiaInventorySkuId: '55555555-5555-4555-8555-555555555555',
      quantity: 2,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelSkuAvailability'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products', 'operations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
  });

  it('waits for an account before previewing recipe automation', async () => {
    vi.mocked(getChannelRecipeAutomationPreview).mockResolvedValue({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 0,
        autoApplyProducts: 0,
        quantityReviewProducts: 0,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        variants: 0,
        affectedOptions: 0,
        autoApply: 0,
        quantityReview: 0,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [],
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

  it('collects Sellpia matches, recalculates the preview, and applies it in one mutation', async () => {
    const snapshot = {
      source: 'sellpia_product_manual_match' as const,
      version: 1 as const,
      targetCount: 1,
      targetCodes: ['634-1'],
      rowCount: 1,
      rows: [{
        productCode: '634-1',
        aliasTitle: '샤이니무지개칼라링(12개입)',
        itemCount: 12,
        matchedType: 'M' as const,
        evidenceCount: 1,
      }],
    };
    vi.mocked(getSellpiaManualMatchTargets).mockResolvedValue({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourcePath: '/product_manual_match.html',
      version: 1,
      targetCount: 1,
      targetCodes: ['634-1'],
      currentSnapshot: null,
    });
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      extensionId: 'order-extension',
      runId: '11111111-1111-4111-8111-111111111111',
      snapshot,
    });
    vi.mocked(importSellpiaManualMatchSnapshot).mockResolvedValue({
      status: {
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'b'.repeat(64),
        capturedAt: '2026-07-31T04:00:00.000Z',
      },
    });
    vi.mocked(finalizeSellpiaManualMatchCollection).mockResolvedValue(undefined);
    vi.mocked(getChannelRecipeAutomationPreview).mockResolvedValue({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'c'.repeat(64),
      generatedAt: '2026-07-31T04:01:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: 1,
        quantityReviewProducts: 0,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        variants: 1,
        affectedOptions: 2,
        autoApply: 1,
        quantityReview: 0,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [],
      items: [],
    });
    vi.mocked(applyChannelRecipeAutomation).mockResolvedValue({
      proposalVersion: 'c'.repeat(64),
      appliedProducts: 1,
      skippedProducts: 0,
      appliedVariants: 7,
      affectedOptions: 9,
      skippedExistingVariants: 0,
    });
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useRunChannelProductMatching(), {
      wrapper: wrapper(client),
    });

    let result;
    await act(async () => {
      result = await hook.result.current.mutateAsync({
        channelAccountIds: [ACCOUNT_ID],
      });
    });

    expect(getSellpiaManualMatchTargets).toHaveBeenCalledTimes(1);
    expect(collectSellpiaManualMatchSnapshot).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      ['634-1'],
    );
    expect(importSellpiaManualMatchSnapshot).toHaveBeenCalledWith(snapshot);
    expect(finalizeSellpiaManualMatchCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionId: 'order-extension',
        runId: '11111111-1111-4111-8111-111111111111',
      }),
      'succeeded',
      'Sellpia 수동상품매칭 별칭 1개를 저장했습니다.',
    );
    expect(getChannelRecipeAutomationPreview).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(applyChannelRecipeAutomation).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'c'.repeat(64),
    });
    expect(vi.mocked(importSellpiaManualMatchSnapshot).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(getChannelRecipeAutomationPreview).mock.invocationCallOrder[0]);
    expect(vi.mocked(getChannelRecipeAutomationPreview).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(applyChannelRecipeAutomation).mock.invocationCallOrder[0]);
    expect(result).toMatchObject({
      collectedAliases: 1,
      evaluatedAccounts: 1,
      appliedProducts: 1,
      appliedVariants: 7,
      affectedOptions: 9,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelSkuAvailability'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products', 'operations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['channelProductMappings', 'recipe-automation-preview', ACCOUNT_ID],
    });
  });

  it('does not calculate or apply matching when Sellpia snapshot import fails', async () => {
    vi.mocked(getSellpiaManualMatchTargets).mockResolvedValue({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourcePath: '/product_manual_match.html',
      version: 1,
      targetCount: 1,
      targetCodes: ['634-1'],
      currentSnapshot: null,
    });
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      extensionId: 'order-extension',
      runId: '11111111-1111-4111-8111-111111111111',
      snapshot: {
        source: 'sellpia_product_manual_match',
        version: 1,
        targetCount: 1,
        targetCodes: ['634-1'],
        rowCount: 0,
        rows: [],
      },
    });
    vi.mocked(importSellpiaManualMatchSnapshot).mockRejectedValue(new Error('import failed'));
    vi.mocked(finalizeSellpiaManualMatchCollection).mockResolvedValue(undefined);
    const client = createClient();
    const hook = renderHook(() => useRunChannelProductMatching(), {
      wrapper: wrapper(client),
    });

    await expect(act(async () => hook.result.current.mutateAsync({
      channelAccountIds: [ACCOUNT_ID],
    }))).rejects.toThrow('import failed');

    expect(finalizeSellpiaManualMatchCollection).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '11111111-1111-4111-8111-111111111111' }),
      'failed',
      'import failed',
    );
    expect(getChannelRecipeAutomationPreview).not.toHaveBeenCalled();
    expect(applyChannelRecipeAutomation).not.toHaveBeenCalled();
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
