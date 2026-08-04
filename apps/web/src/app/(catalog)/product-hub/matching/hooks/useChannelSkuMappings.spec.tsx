import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  autoMatchChannelProducts,
  importCoupangRocketMatchingCsv,
  getSellpiaManualMatchTargets,
  importCoupangWingCatalog,
  importSellpiaManualMatchSnapshot,
  listChannelProductMappings,
} from '../lib/channel-sku-matching-api';
import {
  collectSellpiaManualMatchSnapshot,
  finalizeSellpiaManualMatchCollection,
} from '../lib/sellpia-manual-match-collection';
import {
  useChannelProductMappings,
  useImportChannelCatalog,
  useRunChannelProductMatching,
} from './useChannelSkuMappings';

vi.mock('../lib/channel-sku-matching-api', () => ({
  autoMatchChannelProducts: vi.fn(),
  getSellpiaManualMatchTargets: vi.fn(),
  importCoupangRocketMatchingCsv: vi.fn(),
  importCoupangWingCatalog: vi.fn(),
  importSellpiaManualMatchSnapshot: vi.fn(),
  listChannelAccounts: vi.fn(),
  listChannelProductMappings: vi.fn(),
}));
vi.mock('../lib/sellpia-manual-match-collection', () => ({
  collectSellpiaManualMatchSnapshot: vi.fn(),
  finalizeSellpiaManualMatchCollection: vi.fn(),
}));
vi.mock('@/lib/browser-collection-session', () => ({
  issueBrowserCollectionRunId: vi.fn(),
}));

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
    expect(vi.mocked(autoMatchChannelProducts).mock.calls).toEqual([[ACCOUNT_A], [ACCOUNT_B]]);
    expect(result).toEqual({ collectedAliases: 1, evaluatedListings: 5, matchedListings: 3, configuredOptions: 5 });
  });

  it('runs Sellpia evidence collection and option configuration after a Wing workbook upload', async () => {
    const snapshot = manualMatchSnapshot();
    vi.mocked(importCoupangWingCatalog).mockResolvedValue(importResponse());
    vi.mocked(getSellpiaManualMatchTargets).mockResolvedValue(manualMatchTargets());
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      extensionId: 'extension-1', runId: RUN_ID, snapshot,
    });
    vi.mocked(importSellpiaManualMatchSnapshot).mockResolvedValue(manualMatchImportResponse());
    vi.mocked(finalizeSellpiaManualMatchCollection).mockResolvedValue(undefined);
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
    expect(collectSellpiaManualMatchSnapshot).toHaveBeenCalledWith(RUN_ID, ['634-1']);
    expect(importSellpiaManualMatchSnapshot).toHaveBeenCalledWith(snapshot);
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
    const snapshot = manualMatchSnapshot();
    vi.mocked(importCoupangRocketMatchingCsv).mockResolvedValue(rocketImportResponse());
    vi.mocked(getSellpiaManualMatchTargets).mockResolvedValue(manualMatchTargets());
    vi.mocked(collectSellpiaManualMatchSnapshot).mockResolvedValue({
      extensionId: 'extension-1', runId: RUN_ID, snapshot,
    });
    vi.mocked(importSellpiaManualMatchSnapshot).mockResolvedValue(manualMatchImportResponse());
    vi.mocked(finalizeSellpiaManualMatchCollection).mockResolvedValue(undefined);
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
    vi.mocked(getSellpiaManualMatchTargets).mockResolvedValue(manualMatchTargets());
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

function manualMatchSnapshot() {
  return {
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
}

function manualMatchTargets() {
  return {
    sourceOrigin: 'https://kiditem.sellpia.com' as const,
    sourcePath: '/product_manual_match.html' as const,
    version: 1 as const,
    targetCount: 1,
    targetCodes: ['634-1'],
    currentSnapshot: null,
  };
}

function manualMatchImportResponse() {
  return {
    status: {
      targetCount: 1,
      matchedTargetCount: 1,
      aliasCount: 1,
      snapshotHash: 'a'.repeat(64),
      capturedAt: '2026-08-03T00:00:00.000Z',
    },
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
