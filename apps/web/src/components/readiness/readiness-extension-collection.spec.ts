import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { startCoupangCatalogBrowser } from '@/lib/coupang-catalog-extension';
import { sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { COUPANG_CATALOG_ATTEMPT_STORAGE_KEY } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { runWingSalesRankCheck } from '@/app/(advertising)/rank-tracking/lib/rank-extension';
import { useReadinessCollection } from './useReadinessCollection';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import type { WingRankBatch } from '@kiditem/shared/advertising';
import type { CoupangCatalogCollectionRun } from '@kiditem/shared/coupang-catalog-snapshot';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const WING_BATCH_PATH = '/api/ads/keyword-rank/wing/batch-attempts';
const CATALOG_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const CATALOG_ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const CATALOG_CHILD_ATTEMPT_ID = '00000000-0000-4000-8000-000000000005';
const CATALOG_ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000003';
const CATALOG_IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000004';
const CATALOG_DETAILS_IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000006';
const CATALOG_OWNER_PATH =
  `/api/channels/accounts/${CATALOG_ACCOUNT_ID}/catalog-imports/coupang-wing/attempts/${CATALOG_ATTEMPT_ID}`;
const CATALOG_CHILD_OWNER_PATH =
  `/api/channels/accounts/${CATALOG_ACCOUNT_ID}/catalog-imports/coupang-wing/attempts/${CATALOG_CHILD_ATTEMPT_ID}`;
const CATALOG_BEGIN_PATH =
  `/api/channels/accounts/${CATALOG_ACCOUNT_ID}/catalog-imports/coupang-wing/attempts`;
const CATALOG_BASICS_STORAGE_KEY = `${COUPANG_CATALOG_ATTEMPT_STORAGE_KEY}:basics`;
// The account-day KPI owner was deleted; nothing may still reach it.
const RETIRED_AD_ACCOUNT_DAY_PATH = '/api/ads/account-daily-kpis';
const catalogPlan = {
  channelAccountId: CATALOG_ACCOUNT_ID,
  collectorVersion: 'wing-inventory-v1',
  vendorId: 'A001',
  listUrl: 'https://wing.coupang.com/list',
  detailUrl: 'https://wing.coupang.com/detail',
  publicationRevision: '0',
  stage: 'basics' as const,
  rootAttemptId: CATALOG_ATTEMPT_ID,
  detailsIdempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
};
const catalogPermit = {
  attemptId: CATALOG_ATTEMPT_ID,
  attemptToken: CATALOG_ATTEMPT_TOKEN,
  state: 'RUNNING' as const,
  expiresAt: '2030-01-01T00:00:00.000Z',
  plan: catalogPlan,
};
const catalogOwner: CoupangCatalogCollectionRun = {
  attemptId: CATALOG_ATTEMPT_ID,
  channelAccountId: CATALOG_ACCOUNT_ID,
  idempotencyKey: CATALOG_IDEMPOTENCY_KEY,
  state: 'RUNNING' as const,
  expiresAt: catalogPermit.expiresAt,
  plan: catalogPlan,
  phase: 'hydration' as const,
  collectorVersion: catalogPlan.collectorVersion,
  manifest: null,
  progress: {
    discoveryPagesStored: 0,
    discoveredProducts: 0,
    hydratedProducts: 0,
    optionCount: 0,
    mediaCount: 0,
    storedChunks: 0,
    publishedProducts: 0,
    publishedOptionCount: 0,
    publishedMediaCount: 0,
    publishedChunks: 0,
    firstPublishedAt: null,
    lastPublishedAt: null,
  },
  missing: { discoverySequences: [], productIds: [] },
  snapshotHash: null,
  error: null,
  publication: null,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: null,
  rootAttemptId: CATALOG_ATTEMPT_ID,
  currentAttemptId: CATALOG_ATTEMPT_ID,
  currentStage: 'basics' as const,
  overallState: 'RUNNING' as const,
};
const catalogDetailsOwner: CoupangCatalogCollectionRun = {
  ...catalogOwner,
  attemptId: CATALOG_CHILD_ATTEMPT_ID,
  idempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
  state: 'COMPLETE' as const,
  plan: {
    ...catalogPlan,
    stage: 'details' as const,
    basicAttemptId: CATALOG_ATTEMPT_ID,
    basicManifestHash: 'a'.repeat(64),
    basicPublicationSequence: '1',
    basicProductIds: [],
  },
  phase: 'finished' as const,
  currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
  currentStage: 'details' as const,
  overallState: 'COMPLETE' as const,
  finishedAt: '2026-09-06T00:02:00.000Z',
  publication: {
    sourceImportRunId: CATALOG_CHILD_ATTEMPT_ID,
    duplicate: false,
    changes: {},
  },
};
function wingBatch(state: 'RUNNING' | 'COMPLETE' = 'RUNNING'): WingRankBatch {
  return {
    attempts: [{ attemptId: RUN_ID, keyword: '연필', generation: '1', state,
      expiresAt: '2026-09-10T00:00:00.000Z', actualCutoffAt: state === 'COMPLETE' ? '2026-09-06T00:00:00.000Z' : null,
      itemCount: 0, errorCode: null, errorMessage: null,
      plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1', keyword: '연필', maxPages: 5,
        targets: [{ vendorItemId: 'V1', productName: '연필', category: null, keyword: '연필', candidateIndex: 0 }] } }],
    selection: { productCount: 1, candidateCount: 1, keywordCount: 1, targetKeywordCount: 1,
      resumed: false, pendingProductCount: 1, targets: [{ keyword: '연필', vendorItemIds: ['V1'], productCount: 1,
        primaryProductCount: 1, pendingProductCount: 1, pendingPrimaryProductCount: 1, phase: 'primary', maxPages: 5 }] },
  };
}
const COMPATIBLE_PING = {
  success: true,
  version: '1.2.102',
  capabilities: {
    browserCollectionSessions: true,
  },
};

const mocks = vi.hoisted(() => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
  collectSellpiaSaleSummaryFromExtension: vi.fn(),
  detectRankExtensionGate: vi.fn(),
  runWingSalesRankCheck: vi.fn(),
  startCoupangCatalogBrowser: vi.fn(),
  getCoupangCatalogBrowserStatus: vi.fn(),
  transferExtensionAuthTo: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: mocks.detectExtensionId,
  sendToExtension: mocks.sendToExtension,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ status: 'ready', user: { organizationId: 'org-1' } }),
}));

vi.mock('@/lib/extension-auth', () => ({
  transferExtensionAuthTo: mocks.transferExtensionAuthTo,
}));

vi.mock('@/app/(advertising)/rank-tracking/lib/rank-extension', () => ({
  detectRankExtensionGate: mocks.detectRankExtensionGate,
  rankExtensionGateMessage: (gate: { status: string }) =>
    gate.status === 'outdated'
      ? 'KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. (필요 버전 1.2.42+)'
      : '브라우저 수집 익스텐션을 찾을 수 없습니다.',
  runWingSalesRankCheck: mocks.runWingSalesRankCheck,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/coupang-catalog-extension', () => ({
  startCoupangCatalogBrowser: mocks.startCoupangCatalogBrowser,
  getCoupangCatalogBrowserStatus: mocks.getCoupangCatalogBrowserStatus,
}));

vi.mock('@/lib/sellpia-sales-collection', () => ({
  collectSellpiaSaleSummaryFromExtension: mocks.collectSellpiaSaleSummaryFromExtension,
}));

vi.mock('@/lib/sellpia-sales-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sellpia-sales-api')>()),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function check(key: string): ReadinessCheck {
  return {
    key,
    label: key,
    status: 'missing',
    detail: 'missing',
    lastSyncedAt: null,
    count: null,
    referenceDate: '2026-07-14',
    expectedDates: ['2026-07-14'],
    missingDates: ['2026-07-14'],
  };
}

function requestedApiPaths(): string[] {
  return [
    ...vi.mocked(apiClient.get).mock.calls,
    ...vi.mocked(apiClient.post).mock.calls,
  ].map(([path]) => String(path));
}

function wrapper(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('readiness extension collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    localStorage.clear();
    mocks.detectExtensionId.mockResolvedValue('coupang-extension');
    mocks.detectRankExtensionGate.mockResolvedValue({
      status: 'ready',
      extensionId: 'coupang-extension',
      version: '1.2.42',
    });
    vi.mocked(sendToExtension).mockResolvedValue(COMPATIBLE_PING);
    mocks.collectSellpiaSaleSummaryFromExtension.mockResolvedValue({
      success: true,
      terminalState: 'COMPLETE',
      businessDates: ['2026-07-14'],
      sellerCount: 0,
    });
    mocks.runWingSalesRankCheck.mockResolvedValue({
      success: true,
      started: true,
    });
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === WING_BATCH_PATH) return wingBatch();
      if (path === CATALOG_OWNER_PATH) return catalogOwner;
      if (path === CATALOG_CHILD_OWNER_PATH) return catalogDetailsOwner;
      return [
        {
          id: CATALOG_ACCOUNT_ID,
          channel: 'coupang',
          isPrimary: true,
        },
      ];
    });
    vi.mocked(apiClient.post).mockImplementation(async (path) => {
      if (path === WING_BATCH_PATH) return wingBatch();
      if (path === CATALOG_BEGIN_PATH) return catalogPermit;
      return { id: RUN_ID };
    });
    mocks.startCoupangCatalogBrowser.mockResolvedValue('coupang-extension');
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      cancelled: true,
    });
    mocks.getCoupangCatalogBrowserStatus.mockResolvedValue({
      attemptId: CATALOG_ATTEMPT_ID,
      active: true,
      attention: null,
      phase: 'hydration',
      currentPage: 2,
      totalPages: 4,
      hydratedProducts: 10,
      discoveredProducts: 20,
      uploadedChunks: 1,
      rootAttemptId: CATALOG_ATTEMPT_ID,
      currentAttemptId: CATALOG_ATTEMPT_ID,
      currentStage: 'basics',
    });
    mocks.transferExtensionAuthTo.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('collects only the missing Sellpia span through today and refreshes dashboard readiness', async () => {
    mocks.collectSellpiaSaleSummaryFromExtension.mockResolvedValueOnce({
      success: true,
      terminalState: 'COMPLETE',
      businessDates: ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'],
      sellerCount: 0,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const salesCheck = check('wing_sales');
    salesCheck.expectedDates = ['2026-07-12', '2026-07-13', '2026-07-14'];
    salesCheck.missingDates = ['2026-07-14', '2026-07-12'];
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness }),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await result.current.handleCollect(salesCheck);
    });

    expect(mocks.collectSellpiaSaleSummaryFromExtension).toHaveBeenCalledWith({
      startDate: '2026-07-12',
      endDate: '2026-07-15',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(refetchReadiness).toHaveBeenCalledTimes(1);
    expect(result.current.pendingKey).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('셀피아 판매현황 4일 수집 완료');
  });

  it('does not expand a first-of-month Sellpia repair into the entire prior month', async () => {
    const salesCheck = check('wing_sales');
    salesCheck.referenceDate = '2026-06-30';
    salesCheck.expectedDates = ['2026-06-17', '2026-06-30', '2026-07-01'];
    salesCheck.missingDates = ['2026-07-01'];
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(salesCheck);
    });

    expect(mocks.collectSellpiaSaleSummaryFromExtension).toHaveBeenCalledWith({
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
  });

  it('hides the raw Prisma timeout message and always clears pending state', async () => {
    mocks.collectSellpiaSaleSummaryFromExtension.mockRejectedValueOnce(
      new Error('P2028: A rollback cannot be executed on an expired transaction'),
    );
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_sales'));
    });

    expect(toast.error).toHaveBeenCalledWith(
      '매출 저장 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
    );
    expect(result.current.pendingKey).toBeNull();
  });

  it('rejects the stale Wing rank worker before starting its batch', async () => {
    mocks.detectRankExtensionGate.mockResolvedValueOnce({
      status: 'outdated',
      extensionId: 'coupang-extension',
      version: '1.2.38',
    });
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_kpi'));
    });

    expect(runWingSalesRankCheck).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/1\.2\.42|새로고침/),
    );
  });

  it('routes each readiness key to its owned collection flow', async () => {
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness, catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_sales'));
      await result.current.handleCollect(check('coupang_products'));
      await result.current.handleCollect(check('wing_kpi'));
    });

    // Readiness keys use their concrete owner, never the retired generic
    // scrapeTargets/runId session transport.
    expect(mocks.collectSellpiaSaleSummaryFromExtension).toHaveBeenCalled();
    expect(
      requestedApiPaths().filter((path) => path.startsWith(RETIRED_AD_ACCOUNT_DAY_PATH)),
    ).toEqual([]);
    expect(startCoupangCatalogBrowser).toHaveBeenCalledWith({ permit: catalogPermit });
    expect(runWingSalesRankCheck).toHaveBeenCalledWith(
      'coupang-extension',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(sendToExtension).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'scrapeTargets' }),
    );
  });

  it('keeps product collection pending until the full catalog session settles', async () => {
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness, catalogEnabled: true }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });

    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/accounts');
    expect(apiClient.post).toHaveBeenCalledWith(
      CATALOG_BEGIN_PATH,
      { collectorVersion: 'wing-inventory-v1', stage: 'basics' },
      { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/i) } },
    );
    expect(apiClient.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/catalog-imports/coupang-wing/runs'),
      expect.anything(),
    );
    expect(startCoupangCatalogBrowser).toHaveBeenCalledWith({ permit: catalogPermit });
    expect(view.result.current.pendingKey).toBe('coupang_products');
    await waitFor(() => expect(view.result.current.catalog.owner?.phase).toBe('hydration'));
    await waitFor(() => expect(view.result.current.catalog.browser).toMatchObject({
      phase: 'hydration',
      hydratedProducts: 10,
      discoveredProducts: 20,
    }));

    let childSettled = false;
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === CATALOG_OWNER_PATH) {
        return {
          ...catalogOwner,
          state: 'COMPLETE' as const,
          phase: 'finished' as const,
          updatedAt: '2026-09-06T00:01:00.000Z',
          finishedAt: '2026-09-06T00:01:00.000Z',
          rootAttemptId: CATALOG_ATTEMPT_ID,
          currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
          currentStage: 'details' as const,
          overallState: childSettled ? 'COMPLETE' as const : 'RUNNING' as const,
        };
      }
      if (path === CATALOG_CHILD_OWNER_PATH) {
        return childSettled
          ? catalogDetailsOwner
          : {
              ...catalogDetailsOwner,
              state: 'RUNNING' as const,
              phase: 'hydration' as const,
              overallState: 'RUNNING' as const,
              finishedAt: null,
              publication: null,
            };
      }
      return [
        { id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true },
      ];
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(
          CATALOG_ACCOUNT_ID,
          CATALOG_ATTEMPT_ID,
        ),
      });
    });
    await waitFor(() => expect(view.result.current.catalog.chainOverallState).toBe('RUNNING'));
    expect(view.result.current.pendingKey).toBe('coupang_products');
    expect(refetchReadiness).not.toHaveBeenCalled();

    // Basics is a saved partial publication, not whole-flow completion. The
    // server root receipt links the internal details child, while extension
    // status remains only a browser progress/attention hint.
    mocks.getCoupangCatalogBrowserStatus.mockResolvedValue({
      attemptId: CATALOG_ATTEMPT_ID,
      active: true,
      attention: null,
      phase: 'hydration',
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      rootAttemptId: CATALOG_ATTEMPT_ID,
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.extension(CATALOG_ATTEMPT_ID),
      });
    });
    mocks.getCoupangCatalogBrowserStatus.mockResolvedValue({
      attemptId: CATALOG_ATTEMPT_ID,
      active: false,
      attention: null,
      phase: 'finished',
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      rootAttemptId: CATALOG_ATTEMPT_ID,
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.extension(CATALOG_ATTEMPT_ID),
      });
    });

    childSettled = true;
    await act(async () => {
      await client.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(CATALOG_ACCOUNT_ID, CATALOG_ATTEMPT_ID),
      });
      await client.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(CATALOG_ACCOUNT_ID, CATALOG_CHILD_ATTEMPT_ID),
      });
    });

    await waitFor(() => expect(view.result.current.pendingKey).toBeNull());
    expect(view.result.current.catalog.owner?.currentStage).toBe('details');
    expect(refetchReadiness).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('쿠팡 전체 상품 수집 완료');
  });

  it('does not treat a saved basics owner as whole-catalog completion', async () => {
    const basicsOnlyOwner: CoupangCatalogCollectionRun = {
      ...catalogOwner,
      state: 'COMPLETE',
      phase: 'finished',
      plan: { ...catalogPlan, detailsIdempotencyKey: undefined },
      currentAttemptId: CATALOG_ATTEMPT_ID,
      currentStage: 'basics',
      overallState: 'COMPLETE',
      finishedAt: '2026-09-06T00:01:00.000Z',
    };
    localStorage.setItem(CATALOG_BASICS_STORAGE_KEY, JSON.stringify({
      channelAccountId: CATALOG_ACCOUNT_ID,
      attemptId: CATALOG_ATTEMPT_ID,
      idempotencyKey: CATALOG_IDEMPOTENCY_KEY,
      stage: 'basics',
    }));
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === CATALOG_OWNER_PATH) return basicsOnlyOwner;
      return [{ id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true }];
    });

    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.owner?.state).toBe('COMPLETE'));
    expect(view.result.current.catalog.chainOverallState).toBeNull();
    expect(view.result.current.catalog.owner?.plan.stage).toBe('basics');
  });

  it('starts the single 상품 받기 flow for the selected Coupang account', async () => {
    const secondaryAccountId = '00000000-0000-4000-8000-000000000021';
    const secondaryPermit = {
      ...catalogPermit,
      plan: { ...catalogPlan, channelAccountId: secondaryAccountId },
    };
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/api/channels/accounts') {
        return [
          { id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true },
          { id: secondaryAccountId, channel: 'coupang', name: '보조 계정' },
        ];
      }
      return [
        { id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true },
      ];
    });
    vi.mocked(apiClient.post).mockImplementation(async (path) => {
      if (path.endsWith('/catalog-imports/coupang-wing/attempts')) return secondaryPermit;
      return { id: RUN_ID };
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.accounts).toHaveLength(2));
    act(() => view.result.current.catalog.setAccountId(secondaryAccountId));
    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `${CATALOG_BEGIN_PATH.replace(CATALOG_ACCOUNT_ID, secondaryAccountId)}`,
      { collectorVersion: 'wing-inventory-v1', stage: 'basics' },
      { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/i) } },
    );
    expect(startCoupangCatalogBrowser).toHaveBeenCalledWith({ permit: secondaryPermit });
  });

  it('resumes the exact details child when the basics root is COMPLETE but the whole flow is RUNNING', async () => {
    const detailsPlan = {
      ...catalogPlan,
      stage: 'details' as const,
      basicAttemptId: CATALOG_ATTEMPT_ID,
      basicManifestHash: 'a'.repeat(64),
      basicPublicationSequence: '1',
      basicProductIds: [],
    };
    const detailsPermit = {
      ...catalogPermit,
      attemptId: CATALOG_CHILD_ATTEMPT_ID,
      attemptToken: '00000000-0000-4000-8000-000000000007',
      plan: detailsPlan,
    };
    const rootOwner: CoupangCatalogCollectionRun = {
      ...catalogOwner,
      state: 'COMPLETE',
      phase: 'finished',
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      overallState: 'RUNNING',
      finishedAt: '2026-09-06T00:01:00.000Z',
    };
    const childOwner: CoupangCatalogCollectionRun = {
      ...catalogDetailsOwner,
      state: 'RUNNING',
      plan: detailsPlan,
      phase: 'hydration',
      error: {
        code: 'WING_PROVIDER_RATE_LIMITED',
        message: '잠시 후 다시 시도해주세요.',
        phase: 'hydration',
        recoverable: true,
        notBefore: null,
      },
      overallState: 'RUNNING',
      finishedAt: null,
      publication: null,
    };
    localStorage.setItem(CATALOG_BASICS_STORAGE_KEY, JSON.stringify({
      channelAccountId: CATALOG_ACCOUNT_ID,
      attemptId: CATALOG_ATTEMPT_ID,
      idempotencyKey: CATALOG_IDEMPOTENCY_KEY,
      stage: 'basics',
    }));
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === CATALOG_OWNER_PATH) return rootOwner;
      if (path === CATALOG_CHILD_OWNER_PATH) return childOwner;
      return [{ id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true }];
    });
    vi.mocked(apiClient.post).mockImplementation(async (path) => {
      if (path === CATALOG_BEGIN_PATH) return detailsPermit;
      return { id: RUN_ID };
    });
    mocks.getCoupangCatalogBrowserStatus.mockResolvedValue({
      attemptId: CATALOG_ATTEMPT_ID,
      active: false,
      attention: null,
      phase: 'hydration',
      rootAttemptId: CATALOG_ATTEMPT_ID,
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      overallState: 'RUNNING',
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.owner?.currentStage).toBe('details'));
    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      CATALOG_BEGIN_PATH,
      {
        collectorVersion: 'wing-inventory-v1',
        stage: 'details',
        expectedBasicAttemptId: CATALOG_ATTEMPT_ID,
      },
      { headers: { 'Idempotency-Key': CATALOG_DETAILS_IDEMPOTENCY_KEY } },
    );
    expect(startCoupangCatalogBrowser).toHaveBeenCalledWith({ permit: detailsPermit });
  });

  it('surfaces a Wing login attention state and opens its confirmation tab', async () => {
    mocks.getCoupangCatalogBrowserStatus.mockResolvedValue({
      attemptId: CATALOG_ATTEMPT_ID,
      active: true,
      attention: {
        reason: 'marketplace_login',
        message: '쿠팡 Wing 로그인이 필요합니다.',
        canOpenTab: true,
      },
      phase: 'discovery',
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });
    await waitFor(() => expect(view.result.current.catalog.browser?.attention).toMatchObject({
      reason: 'marketplace_login',
      canOpenTab: true,
    }));

    await act(async () => {
      await view.result.current.catalog.openAttention();
    });
    expect(sendToExtension).toHaveBeenCalledWith(
      'coupang-extension',
      { action: 'openCollectionAttentionTab', attemptId: CATALOG_ATTEMPT_ID },
    );
  });

  it('cancels the active full catalog owner and closes the browser session', async () => {
    let currentCatalogOwner = catalogOwner;
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === CATALOG_OWNER_PATH) return currentCatalogOwner;
      return [
        { id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true },
      ];
    });
    vi.mocked(apiClient.post).mockImplementation(async (path) => {
      if (path === CATALOG_BEGIN_PATH) return catalogPermit;
      if (path.endsWith('/fail')) {
        currentCatalogOwner = {
          ...catalogOwner,
          state: 'FAILED' as const,
          phase: 'hydration' as const,
          error: {
            code: 'USER_CANCELLED',
            message: '사용자가 쿠팡 상품 받기를 중단했습니다.',
            phase: 'hydration' as const,
            recoverable: false,
          },
          overallState: 'FAILED' as const,
        };
      }
      return { id: RUN_ID };
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });
    await act(async () => {
      await view.result.current.catalog.cancel();
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `${CATALOG_OWNER_PATH}/fail`,
      expect.objectContaining({ code: 'USER_CANCELLED', phase: 'hydration' }),
      { headers: { 'x-source-attempt-token': CATALOG_ATTEMPT_TOKEN } },
    );
    expect(sendToExtension).toHaveBeenCalledWith(
      'coupang-extension',
      { action: 'cancelCoupangCatalogImport', attemptId: CATALOG_ATTEMPT_ID },
    );
    expect(toast.info).toHaveBeenCalledWith('쿠팡 상품 받기를 중단했습니다.');
    expect(view.result.current.catalog.isCancelling).toBe(false);
  });

  it('keeps a visible cancellation error when the owner remains running', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path) => {
      if (path === CATALOG_BEGIN_PATH) return catalogPermit;
      if (path.endsWith('/fail')) throw new Error('중단 확인이 지연되었습니다.');
      return { id: RUN_ID };
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });
    await act(async () => {
      await expect(view.result.current.catalog.cancel()).rejects.toThrow('중단 확인이 지연되었습니다.');
    });

    await waitFor(() => expect(view.result.current.catalog.cancelError).toBe('중단 확인이 지연되었습니다.'));
  });

  it('reconciles a persisted owner attempt on mount without dispatching provider IO', async () => {
    localStorage.setItem(CATALOG_BASICS_STORAGE_KEY, JSON.stringify({
      channelAccountId: CATALOG_ACCOUNT_ID,
      attemptId: CATALOG_ATTEMPT_ID,
      idempotencyKey: CATALOG_IDEMPOTENCY_KEY,
      stage: 'basics',
    }));
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness, catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(CATALOG_OWNER_PATH));
    await waitFor(() => expect(view.result.current.pendingKey).toBe('coupang_products'));
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(startCoupangCatalogBrowser).not.toHaveBeenCalled();
    expect(refetchReadiness).not.toHaveBeenCalled();
  });

  it('keeps a legacy full owner recoverable through the single readiness flow', async () => {
    localStorage.setItem(COUPANG_CATALOG_ATTEMPT_STORAGE_KEY, JSON.stringify({
      channelAccountId: CATALOG_ACCOUNT_ID,
      attemptId: CATALOG_ATTEMPT_ID,
      idempotencyKey: CATALOG_IDEMPOTENCY_KEY,
    }));
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === CATALOG_OWNER_PATH) {
        return {
          ...catalogOwner,
          plan: { ...catalogPlan, stage: undefined, rootAttemptId: undefined, detailsIdempotencyKey: undefined },
          currentStage: undefined,
          overallState: undefined,
        };
      }
      return [{ id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true }];
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.owner?.attemptId).toBe(CATALOG_ATTEMPT_ID));
    expect(view.result.current.catalog.owner?.plan.stage).toBeUndefined();
    expect(startCoupangCatalogBrowser).not.toHaveBeenCalled();
  });

  it('reads a valid URL handoff for its exact account and attempt without auto-starting', async () => {
    const linkedAccountId = '00000000-0000-4000-8000-000000000021';
    const linkedAttemptId = '00000000-0000-4000-8000-000000000022';
    const linkedOwner: CoupangCatalogCollectionRun = {
      ...catalogOwner,
      attemptId: linkedAttemptId,
      channelAccountId: linkedAccountId,
      plan: { ...catalogPlan, channelAccountId: linkedAccountId },
      rootAttemptId: linkedAttemptId,
      currentAttemptId: linkedAttemptId,
    };
    window.history.pushState(
      {},
      '',
      `/?collectionAttempt=${linkedAttemptId}&channelAccountId=${linkedAccountId}&collectionStage=basics`,
    );
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path.includes(`/accounts/${linkedAccountId}/catalog-imports/`)) return linkedOwner;
      return [{ id: linkedAccountId, channel: 'coupang', isPrimary: true }];
    });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.owner?.attemptId).toBe(linkedAttemptId));
    expect(view.result.current.catalog.accountId).toBe(linkedAccountId);
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(startCoupangCatalogBrowser).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/');
  });

  it('switches the exact handoff owner when the mounted route link changes', async () => {
    type HandoffLink = {
      attemptId: string;
      channelAccountId: string;
      stage: 'basics' | 'details';
    };
    const firstLink: HandoffLink = {
      attemptId: CATALOG_ATTEMPT_ID,
      channelAccountId: CATALOG_ACCOUNT_ID,
      stage: 'basics',
    };
    const secondLink: HandoffLink = {
      attemptId: CATALOG_CHILD_ATTEMPT_ID,
      channelAccountId: CATALOG_ACCOUNT_ID,
      stage: 'details',
    };
    const secondOwner: CoupangCatalogCollectionRun = {
      ...catalogDetailsOwner,
      state: 'RUNNING',
      overallState: 'RUNNING',
      finishedAt: null,
    };
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === CATALOG_OWNER_PATH) return catalogOwner;
      if (path === CATALOG_CHILD_OWNER_PATH) return secondOwner;
      return [{ id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true }];
    });
    const view = renderHook(
      ({ link }: { link: HandoffLink }) => useReadinessCollection({
        refetchReadiness: vi.fn(),
        catalogEnabled: true,
        catalogLink: link,
      }),
      { initialProps: { link: firstLink }, wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.owner?.attemptId).toBe(CATALOG_ATTEMPT_ID));
    view.rerender({ link: secondLink });

    await waitFor(() => expect(view.result.current.catalog.owner?.attemptId).toBe(CATALOG_CHILD_ATTEMPT_ID));
    expect(view.result.current.catalog.owner?.plan.stage).toBe('details');
    expect(apiClient.get).toHaveBeenCalledWith(CATALOG_CHILD_OWNER_PATH);
    expect(startCoupangCatalogBrowser).not.toHaveBeenCalled();
  });

  it('blocks a malformed URL handoff instead of creating a new catalog attempt', async () => {
    window.history.pushState(
      {},
      '',
      `/?collectionAttempt=not-an-attempt&channelAccountId=${CATALOG_ACCOUNT_ID}&collectionStage=basics`,
    );
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(view.result.current.catalog.linkError).toContain('올바르지 않습니다'));
    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });
    expect(apiClient.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/catalog-imports/coupang-wing/attempts'),
      expect.anything(),
      expect.anything(),
    );
    expect(startCoupangCatalogBrowser).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/');
  });

  it('reuses the saved idempotency key after an uncertain begin response', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('lost begin ACK'));
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn(), catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });
    const saved = JSON.parse(
      localStorage.getItem(CATALOG_BASICS_STORAGE_KEY)!,
    ) as { idempotencyKey: string };
    expect(saved).toMatchObject({
      channelAccountId: CATALOG_ACCOUNT_ID,
      attemptId: null,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });
    const begins = vi.mocked(apiClient.post).mock.calls.filter(
      ([path]) => path === CATALOG_BEGIN_PATH,
    );
    expect(begins).toHaveLength(2);
    expect(new Headers(begins[0]![2]?.headers).get('Idempotency-Key')).toBe(
      saved.idempotencyKey,
    );
    expect(new Headers(begins[1]![2]?.headers).get('Idempotency-Key')).toBe(
      saved.idempotencyKey,
    );
    expect(startCoupangCatalogBrowser).toHaveBeenCalledWith({ permit: catalogPermit });
  });

  it('shows missing Wing guidance without dispatching provider IO or opening a tab', async () => {
    mocks.detectRankExtensionGate.mockResolvedValue({ status: 'missing' });
    const open = vi.spyOn(window, 'open');
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_kpi'));
    });

    expect(mocks.detectRankExtensionGate).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalled();
    expect(sendToExtension).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps Wing pending until the owner receipt settles, ignoring legacy session state', async () => {
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('wing_kpi'));
    });

    expect(view.result.current.pendingKey).toBe('wing_kpi');
    expect(runWingSalesRankCheck).toHaveBeenCalledWith(
      'coupang-extension',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );

    vi.mocked(apiClient.get).mockResolvedValue(wingBatch('COMPLETE'));
    await act(async () => { await client.invalidateQueries(); });
    await waitFor(() => expect(view.result.current.pendingKey).toBeNull());
    expect(refetchReadiness).toHaveBeenCalledTimes(1);
  });

  it('keeps automatic readiness and dashboard traffic sources free of focus fallbacks', () => {
    const readinessSource = readFileSync(
      resolve(process.cwd(), 'src/components/readiness/useReadinessCollection.ts'),
      'utf8',
    );
    const dashboardSource = readFileSync(
      resolve(process.cwd(), 'src/app/(analytics)/dashboard/page.tsx'),
      'utf8',
    );
    // The dashboard starts Wing traffic collection through the shared
    // collection control, composed in the hook the readiness modal's collection
    // component uses. The page renders that component; it does not start the
    // source itself.
    const wingCollectionSource = readFileSync(
      resolve(process.cwd(), 'src/app/(analytics)/dashboard/hooks/use-wing-traffic-collection.ts'),
      'utf8',
    );
    const competitorExtensionSource = readFileSync(
      resolve(
        process.cwd(),
        'src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts',
      ),
      'utf8',
    );
    const competitorPageSource = readFileSync(
      resolve(
        process.cwd(),
        'src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.tsx',
      ),
      'utf8',
    );

    expect(readinessSource).not.toContain('fallbackOpenTabs');
    expect(readinessSource).not.toContain('runReadinessExtensionCollection');
    expect(readinessSource).not.toContain('BrowserCollectionRunControls');
    expect(readinessSource).not.toContain('issueBrowserCollectionRunId');
    expect(dashboardSource).not.toContain('window.open');
    expect(wingCollectionSource).toContain('useCollectionSourceControl(wingTrafficCollection)');
    expect(wingCollectionSource).not.toContain('fallbackOpenTabs');
    expect(competitorExtensionSource).toContain(
      'COMPETITOR_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION',
    );
    expect(competitorExtensionSource).toContain('browserCollectionSessions');
    expect(competitorPageSource).toContain('collectCompetitorCatalogFromExtension');
    expect(competitorPageSource).toContain('requireCompetitorCatalogExtension');
    expect(competitorPageSource).not.toContain('beginCompetitorCatalogAttempt');
    expect(competitorPageSource).not.toContain('useSourcingOperationAction');
    expect(competitorPageSource).not.toContain('SourcingOperationRunPanel');
    expect(competitorPageSource).not.toContain('operationRun');
    expect(competitorPageSource).not.toContain('useBrowserCollectionSession');
    expect(competitorPageSource).not.toContain('BrowserCollectionRunControls');
  });
});
