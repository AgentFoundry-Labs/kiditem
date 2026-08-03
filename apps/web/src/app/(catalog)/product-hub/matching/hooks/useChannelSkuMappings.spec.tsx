import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  autoMatchChannelProducts,
  getSellpiaManualMatchTargets,
  importSellpiaManualMatchSnapshot,
  linkChannelListingProduct,
  listChannelProductCandidates,
  listChannelProductMappings,
} from '../lib/channel-sku-matching-api';
import {
  collectSellpiaManualMatchSnapshot,
  finalizeSellpiaManualMatchCollection,
} from '../lib/sellpia-manual-match-collection';
import {
  useChannelProductCandidates,
  useChannelProductMappings,
  useLinkChannelListingProduct,
  useRunChannelProductMatching,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  autoMatchChannelProducts: vi.fn(),
  getSellpiaManualMatchTargets: vi.fn(),
  importCoupangWingCatalog: vi.fn(),
  importSellpiaManualMatchSnapshot: vi.fn(),
  linkChannelListingProduct: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelProductCandidates: vi.fn(),
  listChannelProductMappings: vi.fn(),
}));
vi.mock('../lib/sellpia-manual-match-collection', () => ({
  collectSellpiaManualMatchSnapshot: vi.fn(),
  finalizeSellpiaManualMatchCollection: vi.fn(),
}));
vi.mock('@/lib/browser-collection-session', () => ({
  issueBrowserCollectionRunId: vi.fn(),
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '44444444-4444-4444-8444-444444444444';

describe('channel product matching hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(issueBrowserCollectionRunId).mockResolvedValue(RUN_ID);
  });

  it('waits for an account unless the caller explicitly enables the combined queue', async () => {
    vi.mocked(listChannelProductMappings).mockResolvedValue(emptyQueue());
    const client = createClient();
    const waiting = renderHook(
      () => useChannelProductMappings({ channelAccountId: undefined, search: '' }),
      { wrapper: wrapper(client) },
    );
    expect(waiting.result.current.fetchStatus).toBe('idle');
    waiting.unmount();

    const loaded = renderHook(
      () => useChannelProductMappings({ channelAccountId: undefined, search: ' 우산 ', enabled: true }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(loaded.result.current.isSuccess).toBe(true));
    expect(listChannelProductMappings).toHaveBeenCalledWith({ channelAccountId: undefined, search: '우산' });
  });

  it('candidate reads never confirm product identity', async () => {
    vi.mocked(listChannelProductCandidates).mockResolvedValue({ items: [] });
    const client = createClient();
    const hook = renderHook(
      () => useChannelProductCandidates(LISTING_ID, '', true),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(linkChannelListingProduct).not.toHaveBeenCalled();
  });

  it('invalidates matching and availability after product confirmation', async () => {
    vi.mocked(linkChannelListingProduct).mockResolvedValue(undefined);
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useLinkChannelListingProduct(), { wrapper: wrapper(client) });

    await act(async () => {
      await hook.result.current.mutateAsync({ channelListingId: LISTING_ID, masterProductId: null });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelSkuAvailability'] });
  });

  it('collects Sellpia evidence once and auto-matches every selected account', async () => {
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
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({ extensionId: 'extension-1', runId: RUN_ID, snapshot });
    vi.mocked(importSellpiaManualMatchSnapshot).mockResolvedValue({
      status: {
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'a'.repeat(64),
        capturedAt: '2026-08-03T00:00:00.000Z',
      },
    });
    vi.mocked(finalizeSellpiaManualMatchCollection).mockResolvedValue(undefined);
    vi.mocked(autoMatchChannelProducts)
      .mockResolvedValueOnce({ evaluatedListings: 2, matchedListings: 1, configuredOptions: 1 })
      .mockResolvedValueOnce({ evaluatedListings: 3, matchedListings: 2, configuredOptions: 4 });
    const client = createClient();
    const hook = renderHook(() => useRunChannelProductMatching(), { wrapper: wrapper(client) });

    let result;
    await act(async () => {
      result = await hook.result.current.mutateAsync({ channelAccountIds: [ACCOUNT_B, ACCOUNT_A, ACCOUNT_B] });
    });

    expect(collectSellpiaManualMatchSnapshot).toHaveBeenCalledWith(RUN_ID, ['634-1']);
    expect(importSellpiaManualMatchSnapshot).toHaveBeenCalledWith(snapshot);
    expect(finalizeSellpiaManualMatchCollection).toHaveBeenCalledWith(
      expect.objectContaining({ extensionId: 'extension-1', runId: RUN_ID }),
      'succeeded',
      'Sellpia 수동상품매칭 별칭 1개를 저장했습니다.',
    );
    expect(autoMatchChannelProducts.mock.calls).toEqual([[ACCOUNT_A], [ACCOUNT_B]]);
    expect(result).toEqual({ collectedAliases: 1, evaluatedListings: 5, matchedListings: 3, configuredOptions: 5 });
  });
});

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapper(client: QueryClient) {
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function emptyQueue() {
  return {
    products: [],
    options: [],
    counts: {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: { all: 0, configured: 0, unconfigured: 0 },
    },
  };
}
