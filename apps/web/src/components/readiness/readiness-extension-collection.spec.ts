import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendToExtension } from '@/lib/extension-bridge';
import {
  recordMissingBrowserCollection,
  syncBrowserCollectionAlert,
} from '@/lib/browser-collection-session';
import {
  COUPANG_COLLECTION_EXTENSION_MIN_VERSION,
  READINESS_COLLECTION_PRODUCERS,
  runReadinessExtensionCollection,
} from './readiness-extension-collection';
import { useReadinessCollection } from './useReadinessCollection';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const COMPATIBLE_PING = {
  success: true,
  version: '1.2.33',
  capabilities: { browserCollectionSessions: true },
};

const mocks = vi.hoisted(() => ({
  detectExtensionId: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: mocks.detectExtensionId,
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  recordMissingBrowserCollection: vi.fn(),
  syncBrowserCollectionAlert: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn() },
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

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('readiness extension collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectExtensionId.mockResolvedValue('coupang-extension');
    vi.mocked(syncBrowserCollectionAlert).mockResolvedValue(undefined);
    vi.mocked(recordMissingBrowserCollection).mockResolvedValue({ runId: RUN_ID });
  });

  it('rejects the prior collection-session worker before starting a scrape', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({
      success: false,
      error: 'old worker reached scrapeTargets',
      version: '1.2.32',
      capabilities: { browserCollectionSessions: true },
    });

    await expect(
      runReadinessExtensionCollection({
        check: check('wing_sales'),
        producer: 'dashboard.wing_sales',
        extensionId: 'coupang-extension',
        runId: RUN_ID,
      }),
    ).rejects.toThrow(/1\.2\.33|새로고침/);
    expect(COUPANG_COLLECTION_EXTENSION_MIN_VERSION).toBe('1.2.33');
    expect(sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('starts a run and reads its generic collection session by run ID', async () => {
    const completed = session('dashboard.wing_sales');
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
    expect(onSession).toHaveBeenCalledWith(completed);
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

  it('passes the exact dashboard producer for every readiness key', async () => {
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

    for (const key of Object.keys(READINESS_COLLECTION_PRODUCERS)) {
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
    expect(producers).toEqual([
      'dashboard.wing_sales',
      'dashboard.rocket_sales',
      'dashboard.coupang_ads',
      'advertising.ad_sync',
      'dashboard.coupang_products',
      'dashboard.wing_kpi',
    ]);
  });

  it('records personal attention when detection fails and never opens a tab', async () => {
    mocks.detectExtensionId.mockResolvedValue(null);
    const open = vi.spyOn(window, 'open');
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_sales'));
    });

    expect(mocks.detectExtensionId).toHaveBeenCalledTimes(1);
    expect(recordMissingBrowserCollection).toHaveBeenCalledWith(
      'dashboard.wing_sales',
      { checkKey: 'wing_sales', trigger: 'readiness' },
      undefined,
    );
    expect(sendToExtension).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the current run id when a web restart cannot find the extension', async () => {
    mocks.detectExtensionId.mockResolvedValue(null);
    const { result } = renderHook(
      () => useReadinessCollection({ refetchReadiness: vi.fn() }),
      { wrapper: wrapper() },
    );

    await act(async () => {
      await result.current.handleCollect(check('wing_sales'), RUN_ID);
    });

    expect(recordMissingBrowserCollection).toHaveBeenCalledWith(
      'dashboard.wing_sales',
      { checkKey: 'wing_sales', trigger: 'readiness' },
      RUN_ID,
    );
  });

  it('runs the ad sweep once with advertising.ad_sync after daily ads finish', async () => {
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
    ).toEqual([
      'dashboard.coupang_ads',
      'advertising.ad_sync',
    ]);
    expect((starts[1]?.[1] as { runId?: string }).runId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(result.current.activeSession).toEqual(
      expect.objectContaining({
        producer: 'advertising.ad_sync',
        status: 'succeeded',
      }),
    );
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
