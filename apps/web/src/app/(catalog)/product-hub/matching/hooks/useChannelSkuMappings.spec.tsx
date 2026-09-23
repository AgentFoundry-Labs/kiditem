import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoMatchChannelProducts,
  importCoupangRocketMatchingCsv,
  importCoupangWingCatalog,
  listChannelProductMappings,
  saveProductInventoryMatching,
} from '../lib/channel-sku-matching-api';
import { collectSellpiaManualMatchSnapshot } from '../lib/sellpia-manual-match-collection';
import {
  useChannelProductMappings,
  useImportChannelCatalog,
  useRunChannelProductMatching,
  useSaveProductInventoryMatching,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  autoMatchChannelProducts: vi.fn(),
  importCoupangRocketMatchingCsv: vi.fn(),
  importCoupangWingCatalog: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelProductMappings: vi.fn(),
  saveProductInventoryMatching: vi.fn(),
}));
vi.mock('../lib/sellpia-manual-match-collection', () => ({
  collectSellpiaManualMatchSnapshot: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));

const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '33333333-3333-4333-8333-333333333333';

describe('channel product matching hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('refreshes the matching reads even when a multi-option save fails after saving some options', async () => {
    vi.mocked(saveProductInventoryMatching).mockRejectedValue(new Error('second option failed'));
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useSaveProductInventoryMatching(), { wrapper: wrapper(client) });

    await act(async () => {
      await expect(hook.result.current.mutateAsync({ channelListingId: 'listing-1', options: [] }))
        .rejects.toThrow('second option failed');
    });

    for (const queryKey of [['channelProductMappings'], ['channelSkuAvailability'], ['products', 'operations'], ['inventory']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('collects Sellpia evidence once and auto-matches every selected account', async () => {
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      attempt: manualMatchAttempt(),
      status: manualMatchStatus(),
    });
    vi.mocked(autoMatchChannelProducts)
      .mockResolvedValueOnce({ evaluatedListings: 2, matchedListings: 1, configuredOptions: 1 })
      .mockResolvedValueOnce({ evaluatedListings: 3, matchedListings: 2, configuredOptions: 4 });
    const client = createClient();
    const hook = renderHook(() => useRunChannelProductMatching(), { wrapper: wrapper(client) });

    let result;
    await act(async () => {
      result = await hook.result.current.mutateAsync({ channelAccountIds: [ACCOUNT_B, ACCOUNT_A, ACCOUNT_B] });
    });

    expect(collectSellpiaManualMatchSnapshot).toHaveBeenCalledWith({ organizationId: 'org-1' });
    expect(vi.mocked(autoMatchChannelProducts).mock.calls).toEqual([[ACCOUNT_A], [ACCOUNT_B]]);
    expect(result).toEqual({ collectedAliases: 1, evaluatedListings: 5, matchedListings: 3, configuredOptions: 5 });
  });

  it('runs Sellpia evidence collection and option configuration after a Wing workbook upload', async () => {
    vi.mocked(importCoupangWingCatalog).mockResolvedValue(importResponse());
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      attempt: manualMatchAttempt(),
      status: manualMatchStatus(),
    });
    vi.mocked(autoMatchChannelProducts).mockResolvedValue({
      evaluatedListings: 4,
      matchedListings: 0,
      configuredOptions: 3,
    });
    const client = createClient();
    const hook = renderHook(() => useImportChannelCatalog(), { wrapper: wrapper(client) });
    const file = new File(['wing'], 'wing.xlsx');

    let result;
    await act(async () => {
      result = await hook.result.current.mutateAsync({ source: 'wing', channelAccountId: ACCOUNT_A, file });
    });

    expect(importCoupangWingCatalog).toHaveBeenCalledWith(ACCOUNT_A, file);
    expect(collectSellpiaManualMatchSnapshot).toHaveBeenCalledWith({ organizationId: 'org-1' });
    expect(autoMatchChannelProducts).toHaveBeenCalledWith(ACCOUNT_A);
    expect(result).toMatchObject({
      response: { duplicate: false },
      automaticMatching: {
        collectedAliases: 1,
        evaluatedListings: 4,
        matchedListings: 0,
        configuredOptions: 3,
        error: null,
      },
    });
  });

  it('uses the same automatic matching workflow after a Rocket matching CSV upload', async () => {
    vi.mocked(importCoupangRocketMatchingCsv).mockResolvedValue(rocketImportResponse());
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      attempt: manualMatchAttempt(),
      status: manualMatchStatus(),
    });
    vi.mocked(autoMatchChannelProducts).mockResolvedValue({
      evaluatedListings: 2,
      matchedListings: 1,
      configuredOptions: 2,
    });
    const client = createClient();
    const hook = renderHook(() => useImportChannelCatalog(), { wrapper: wrapper(client) });
    const file = new File(['rocket'], 'rocket443-sellpia-matching.csv');

    await act(async () => {
      await hook.result.current.mutateAsync({ source: 'rocket', channelAccountId: ACCOUNT_B, file });
    });

    expect(importCoupangRocketMatchingCsv).toHaveBeenCalledWith(ACCOUNT_B, file);
    expect(autoMatchChannelProducts).toHaveBeenCalledWith(ACCOUNT_B);
  });

  it('keeps the Wing workbook import completed when Sellpia collection needs login', async () => {
    vi.mocked(importCoupangWingCatalog).mockResolvedValue(importResponse());
    vi.mocked(collectSellpiaManualMatchSnapshot).mockRejectedValue(
      new Error('Sellpia 로그인이 필요합니다.'),
    );
    const client = createClient();
    const hook = renderHook(() => useImportChannelCatalog(), { wrapper: wrapper(client) });

    let result;
    await act(async () => {
      result = await hook.result.current.mutateAsync({
        source: 'wing',
        channelAccountId: ACCOUNT_A,
        file: new File(['wing'], 'wing.xlsx'),
      });
    });

    expect(result).toMatchObject({
      response: { duplicate: false },
      automaticMatching: {
        configuredOptions: 0,
        error: 'Sellpia 로그인이 필요합니다.',
      },
    });
    expect(autoMatchChannelProducts).not.toHaveBeenCalled();
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

function manualMatchAttempt() {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    state: 'COMPLETE' as const,
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan: {
      sourceType: 'sellpia_product_manual_match' as const,
      parserVersion: 'sellpia-manual-match-v1' as const,
      sourceOrigin: 'https://kiditem.sellpia.com' as const,
      sourcePath: '/product_manual_match.html' as const,
      targetCodes: ['634-1'],
      targetCount: 1,
    },
    errorCode: null,
    errorMessage: null,
  };
}

function manualMatchStatus() {
  return {
    targetCount: 1,
    matchedTargetCount: 1,
    aliasCount: 1,
    snapshotHash: 'a'.repeat(64),
    capturedAt: '2026-08-03T00:00:00.000Z',
  };
}

function importResponse() {
  const now = '2026-08-03T00:00:00.000Z';
  return {
    run: {
      id: '55555555-5555-4555-8555-555555555555',
      sourceType: 'coupang_wing_catalog' as const,
      channelAccountId: ACCOUNT_A,
      fileName: 'wing.xlsx',
      fileHash: 'a'.repeat(64),
      status: 'completed' as const,
      rowCount: 1,
      importedAt: now,
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    },
    duplicate: false,
    changes: {
      createdProductCount: 1,
      updatedProductCount: 0,
      createdSkuCount: 1,
      updatedSkuCount: 0,
      skippedRowCount: 0,
    },
  };
}

function rocketImportResponse() {
  const response = importResponse();
  return {
    ...response,
    run: {
      ...response.run,
      sourceType: 'coupang_rocket_matching_csv' as const,
      channelAccountId: ACCOUNT_B,
      fileName: 'rocket443-sellpia-matching.csv',
    },
    changes: {
      createdProductCount: 1,
      updatedProductCount: 0,
      createdSkuCount: 1,
      updatedSkuCount: 0,
    },
  };
}
