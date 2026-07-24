import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { startCoupangCatalogBrowser } from '@/lib/coupang-catalog-extension';
import { sendToExtension } from '@/lib/extension-bridge';
import { runWingSalesRankCheck } from '@/app/(advertising)/rank-tracking/lib/rank-extension';
import {
  recordMissingBrowserCollection,
  syncBrowserCollectionAlert,
} from '@/lib/browser-collection-session';
import {
  COUPANG_COLLECTION_EXTENSION_MIN_VERSION,
  READINESS_COLLECTION_PRODUCERS,
  readinessCollectionTimeoutMs,
  runReadinessExtensionCollection,
} from './readiness-extension-collection';
import { useReadinessCollection } from './useReadinessCollection';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const COMPATIBLE_PING = {
  success: true,
  version: '1.2.83',
  capabilities: { browserCollectionSessions: true },
};

const mocks = vi.hoisted(() => ({
  detectExtensionId: vi.fn(),
  collectSellpiaSaleSummaryFromExtension: vi.fn(),
  ingestSellpiaSales: vi.fn(),
  detectRankExtensionGate: vi.fn(),
  runWingSalesRankCheck: vi.fn(),
  startCoupangCatalogBrowser: vi.fn(),
  wingSession: null as BrowserCollectionSessionView | null,
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: mocks.detectExtensionId,
  sendToExtension: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ status: 'ready', user: { organizationId: 'org-1' } }),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuthSession: () => ({
    session: { access_token: 'kiditem-access-token' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useBrowserCollectionSession', () => ({
  useBrowserCollectionSession: () => ({ data: mocks.wingSession }),
}));

vi.mock('@/app/(advertising)/rank-tracking/lib/rank-extension', () => ({
  detectRankExtensionGate: mocks.detectRankExtensionGate,
  rankExtensionGateMessage: (gate: { status: string }) =>
    gate.status === 'outdated'
      ? 'KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. (필요 버전 1.2.42+)'
      : '브라우저 수집 익스텐션을 찾을 수 없습니다.',
  runWingSalesRankCheck: mocks.runWingSalesRankCheck,
}));

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  recordMissingBrowserCollection: vi.fn(),
  syncBrowserCollectionAlert: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/coupang-catalog-extension', () => ({
  startCoupangCatalogBrowser: mocks.startCoupangCatalogBrowser,
}));

vi.mock('@/lib/sellpia-sales-collection', () => ({
  collectSellpiaSaleSummaryFromExtension: mocks.collectSellpiaSaleSummaryFromExtension,
}));

vi.mock('@/lib/sellpia-sales-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sellpia-sales-api')>()),
  ingestSellpiaSales: mocks.ingestSellpiaSales,
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
    collector: 'extension',
    collectEndpoint: null,
    scrapeUrls: [`https://wing.coupang.com/${key}`],
    referenceDate: '2026-07-14',
    expectedDates: ['2026-07-14'],
    missingDates: ['2026-07-14'],
  };
}

function session(
  producer: BrowserCollectionSessionView['producer'],
  runId = RUN_ID,
): BrowserCollectionSessionView {
  return {
    runId,
    producer,
    classification: 'background_preferred',
    status: 'succeeded',
    attempt: 1,
    restartStrategy: 'web',
    progress: {
      current: 1,
      total: 1,
      completed: 1,
      failed: 0,
      label: 'done',
    },
    inputIdentity: { trigger: 'readiness' },
    attention: null,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    finishedAt: 1_700_000_001_000,
  };
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
    mocks.detectExtensionId.mockResolvedValue('coupang-extension');
    mocks.detectRankExtensionGate.mockResolvedValue({
      status: 'ready',
      extensionId: 'coupang-extension',
      version: '1.2.42',
    });
    vi.mocked(sendToExtension).mockResolvedValue(COMPATIBLE_PING);
    mocks.collectSellpiaSaleSummaryFromExtension.mockResolvedValue({
      range: { from: '2026-07-14', to: '2026-07-14' },
      sellers: [],
      provenance: {
        source: 'sellpia_sale_summary',
        mode: 'selldate',
        sellerScope: 'all',
        responseShape: 'empty_object',
        explicitEmpty: true,
      },
      capturedAt: '2026-07-14T01:00:00.000Z',
    });
    mocks.ingestSellpiaSales.mockResolvedValue({
      upserted: 0,
      businessDates: ['2026-07-14'],
      sellerCount: 0,
    });
    mocks.runWingSalesRankCheck.mockResolvedValue({
      success: true,
      started: true,
      runId: RUN_ID,
      productTotal: 244,
    });
    vi.mocked(apiClient.get).mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        channel: 'coupang',
        isPrimary: true,
      },
    ]);
    vi.mocked(apiClient.post).mockResolvedValue({ id: RUN_ID });
    mocks.startCoupangCatalogBrowser.mockResolvedValue('coupang-extension');
    mocks.wingSession = null;
    vi.mocked(syncBrowserCollectionAlert).mockResolvedValue(undefined);
    vi.mocked(recordMissingBrowserCollection).mockResolvedValue({ runId: RUN_ID });
  });

  it('keeps the web poller alive beyond the 30-minute extension watchdog', () => {
    expect(readinessCollectionTimeoutMs('advertising.ad_sync', 1)).toBe(
      35 * 60_000,
    );
    expect(readinessCollectionTimeoutMs('dashboard.coupang_ads', 1)).toBe(
      5 * 60_000,
    );
  });

  it('collects only the missing Sellpia span through today and refreshes dashboard readiness', async () => {
    mocks.collectSellpiaSaleSummaryFromExtension.mockResolvedValueOnce({
      range: { from: '2026-07-12', to: '2026-07-15' },
      sellers: [],
      provenance: {
        source: 'sellpia_sale_summary',
        mode: 'selldate',
        sellerScope: 'all',
        responseShape: 'empty_object',
        explicitEmpty: true,
      },
      capturedAt: '2026-07-15T01:00:00.000Z',
    });
    mocks.ingestSellpiaSales.mockResolvedValueOnce({
      upserted: 0,
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
      organizationId: 'org-1',
    });
    expect(mocks.ingestSellpiaSales).toHaveBeenCalledWith(
      expect.objectContaining({ range: { from: '2026-07-12', to: '2026-07-15' } }),
    );
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
      organizationId: 'org-1',
    });
  });

  it('hides the raw Prisma timeout message and always clears pending state', async () => {
    mocks.ingestSellpiaSales.mockRejectedValueOnce(
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

  it('rejects an extension from before the stale attention cancellation fix', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: false,
      error: 'old worker reached scrapeTargets',
      version: '1.2.71',
      capabilities: { browserCollectionSessions: true },
    });

    await expect(
      runReadinessExtensionCollection({
        check: check('wing_sales'),
        producer: 'dashboard.wing_sales',
        extensionId: 'coupang-extension',
        runId: RUN_ID,
      }),
    ).rejects.toThrow(/1\.2\.72|새로고침/);
    expect(COUPANG_COLLECTION_EXTENSION_MIN_VERSION).toBe('1.2.83');
    expect(sendToExtension).toHaveBeenCalledTimes(1);
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
      await result.current.handleCollect(check('wing_kpi'), RUN_ID);
    });

    expect(runWingSalesRankCheck).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/1\.2\.42|새로고침/),
    );
  });

  it('starts a run and reads its generic collection session by run ID', async () => {
    const completed = session('dashboard.wing_sales');
    const onStarted = vi.fn();
    const onSession = vi.fn();
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce(COMPATIBLE_PING)
      .mockResolvedValueOnce({ success: true, started: true, runId: RUN_ID })
      .mockResolvedValueOnce(completed);

    await expect(
      runReadinessExtensionCollection({
        check: check('wing_sales'),
        producer: 'dashboard.wing_sales',
        extensionId: 'coupang-extension',
        runId: RUN_ID,
        onStarted,
        onSession,
      }),
    ).resolves.toEqual(completed);

    expect(sendToExtension).toHaveBeenNthCalledWith(
      2,
      'coupang-extension',
      expect.objectContaining({
        action: 'scrapeTargets',
        producer: 'dashboard.wing_sales',
        runId: RUN_ID,
      }),
    );
    expect(sendToExtension).toHaveBeenNthCalledWith(3, 'coupang-extension', {
      action: 'getCollectionSession',
      runId: RUN_ID,
    });
    expect(syncBrowserCollectionAlert).toHaveBeenCalledWith(completed);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onSession).toHaveBeenCalledWith(completed);
  });

  it('does not announce a start before the extension compatibility gate passes', async () => {
    const onStarted = vi.fn();
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: false,
      version: '1.2.71',
      capabilities: { browserCollectionSessions: true },
    });

    await expect(
      runReadinessExtensionCollection({
        check: check('coupang_ads'),
        producer: 'advertising.ad_sync',
        extensionId: 'coupang-extension',
        runId: RUN_ID,
        onStarted,
      }),
    ).rejects.toThrow(/1\.2\.72|새로고침/);

    expect(onStarted).not.toHaveBeenCalled();
    expect(sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('returns the collection result when alert synchronization is unavailable', async () => {
    const completed = session('dashboard.wing_sales');
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce(COMPATIBLE_PING)
      .mockResolvedValueOnce({ success: true, started: true, runId: RUN_ID })
      .mockResolvedValueOnce(completed);
    vi.mocked(syncBrowserCollectionAlert).mockRejectedValueOnce(
      new Error('alert API unavailable'),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      runReadinessExtensionCollection({
        check: check('wing_sales'),
        producer: 'dashboard.wing_sales',
        extensionId: 'coupang-extension',
        runId: RUN_ID,
      }),
    ).resolves.toEqual(completed);
    warn.mockRestore();
  });

  it('routes each readiness key to its owned collection flow', async () => {
    const producerByRun = new Map<string, BrowserCollectionSessionView['producer']>();
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
      const command = message as {
        action?: string;
        producer?: BrowserCollectionSessionView['producer'];
        runId?: string;
      };
      if (command.action === 'ping') return COMPATIBLE_PING;
      if (command.action === 'scrapeTargets') {
        producerByRun.set(command.runId!, command.producer!);
        return { success: true, started: true, runId: command.runId };
      }
      return session(producerByRun.get(command.runId!)!, command.runId);
    });
    let sequence = 0;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      sequence += 1;
      return `11111111-1111-4111-8111-${String(sequence).padStart(12, '0')}`;
    });
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness }),
      { wrapper: wrapper() },
    );

    // wing_sales는 셀피아 수집, wing_kpi는 전용 Wing 판매순위 배치로 실행한다.
    for (const key of Object.keys(READINESS_COLLECTION_PRODUCERS).filter(
      (k) => k !== 'wing_sales',
    )) {
      await act(async () => {
        await result.current.handleCollect(check(key));
      });
    }

    const producers = vi
      .mocked(sendToExtension)
      .mock.calls.filter(
        ([, message]) =>
          (message as { action?: string }).action === 'scrapeTargets',
      )
      .map(
        ([, message]) =>
          (message as { producer?: string }).producer,
    );
    expect(producers).toEqual(['dashboard.coupang_ads']);
    expect(startCoupangCatalogBrowser).toHaveBeenCalledWith({
      channelAccountId: '00000000-0000-4000-8000-000000000001',
      runId: RUN_ID,
      accessToken: 'kiditem-access-token',
    });
    expect(READINESS_COLLECTION_PRODUCERS.coupang_products).toBe(
      'channels.coupang_catalog',
    );
    expect(runWingSalesRankCheck).toHaveBeenCalledWith(
      'coupang-extension',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
  });

  it('keeps product collection pending until the full catalog session settles', async () => {
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('coupang_products'));
    });

    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/accounts');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/accounts/00000000-0000-4000-8000-000000000001/catalog-imports/coupang-wing/runs',
      expect.objectContaining({
        clientRunKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        collectorVersion: expect.any(String),
      }),
    );
    expect(view.result.current.pendingKey).toBe('coupang_products');

    mocks.wingSession = session('channels.coupang_catalog');
    view.rerender();

    await waitFor(() => expect(view.result.current.pendingKey).toBeNull());
    expect(refetchReadiness).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('1/1개 수집 완료');
  });

  it('records personal attention when detection fails and never opens a tab', async () => {
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
    expect(recordMissingBrowserCollection).toHaveBeenCalledWith(
      'advertising.wing_rank',
      { checkKey: 'wing_kpi', trigger: 'readiness' },
      undefined,
    );
    expect(sendToExtension).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the current run id when a web restart cannot find the extension', async () => {
    mocks.detectRankExtensionGate.mockResolvedValue({ status: 'missing' });
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_kpi'), RUN_ID);
    });

    expect(recordMissingBrowserCollection).toHaveBeenCalledWith(
      'advertising.wing_rank',
      { checkKey: 'wing_kpi', trigger: 'readiness' },
      RUN_ID,
    );
  });

  it('does not automatically start campaign ad sync after daily ads finish', async () => {
    const producerByRun = new Map<string, BrowserCollectionSessionView['producer']>();
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
      const command = message as {
        action?: string;
        producer?: BrowserCollectionSessionView['producer'];
        runId?: string;
      };
      if (command.action === 'ping') return COMPATIBLE_PING;
      if (command.action === 'scrapeTargets') {
        producerByRun.set(command.runId!, command.producer!);
        return { success: true, started: true, runId: command.runId };
      }
      return session(producerByRun.get(command.runId!)!, command.runId);
    });
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('coupang_ads'));
    });

    const starts = vi.mocked(sendToExtension).mock.calls.filter(
      ([, message]) =>
        (message as { action?: string }).action === 'scrapeTargets',
    );
    expect(
      starts.map(
        ([, message]) =>
          (message as { producer?: string }).producer,
      ),
    ).toEqual(['dashboard.coupang_ads']);
    expect(result.current.activeSession).toEqual(
      expect.objectContaining({
        producer: 'dashboard.coupang_ads',
        status: 'succeeded',
      }),
    );
  });

  it('keeps Wing rank pending while its background session runs and settles from session state', async () => {
    const refetchReadiness = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(
      () => useReadinessCollection({ refetchReadiness }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await view.result.current.handleCollect(check('wing_kpi'), RUN_ID);
    });

    expect(view.result.current.pendingKey).toBe('wing_kpi');
    expect(runWingSalesRankCheck).toHaveBeenCalledWith(
      'coupang-extension',
      RUN_ID,
    );

    mocks.wingSession = {
      ...session('advertising.wing_rank'),
      status: 'running',
      finishedAt: null,
    };
    view.rerender();
    await waitFor(() => {
      expect(view.result.current.activeSession).toEqual(
        expect.objectContaining({
          producer: 'advertising.wing_rank',
          status: 'running',
        }),
      );
    });
    expect(view.result.current.pendingKey).toBe('wing_kpi');

    mocks.wingSession = session('advertising.wing_rank');
    view.rerender();
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
    const scrapeCollectorSource = readFileSync(
      resolve(
        process.cwd(),
        'src/app/(advertising)/ad-ops/components/ScrapeCollector.tsx',
      ),
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
    expect(readinessSource).not.toContain('window.open');
    expect(dashboardSource).not.toContain('window.open');
    expect(dashboardSource).toContain("producer: 'dashboard.wing_sales'");
    expect(scrapeCollectorSource).not.toContain('window.open');
    expect(scrapeCollectorSource).toContain("'advertising.scrape_targets'");
    expect(scrapeCollectorSource).toContain('BrowserCollectionRunControls');
    expect(competitorExtensionSource).toContain(
      'COMPETITOR_EXTENSION_MIN_VERSION = "1.2.33"',
    );
    expect(competitorExtensionSource).toContain('browserCollectionSessions');
    expect(competitorPageSource).toContain('useBrowserCollectionSession');
    expect(competitorPageSource).toContain('BrowserCollectionRunControls');
    expect(competitorPageSource).toContain('collectionRun');
  });
});
