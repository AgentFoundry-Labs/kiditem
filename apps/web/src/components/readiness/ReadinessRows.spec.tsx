import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_READINESS_LABELS } from '@kiditem/shared/source-readiness';
import { SellpiaSyncAction } from '@/app/(inventory)/_shared/SellpiaSyncAction';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { AdKeywordRow, AdSyncRow, StockSyncRow } from './ReadinessRows';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const EXTENSION_ID = 'kiditem-extension';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = 'campaign' | 'keyword';
type State = 'RUNNING' | 'COMPLETE' | 'FAILED';

function ownerAttempt(kind: Kind, state: State = 'RUNNING', attemptId = ATTEMPT_ID) {
  return {
    attemptId,
    channelAccountId: ACCOUNT_ID,
    state,
    plan: {
      sourceType: `coupang_ad_${kind}`,
      parserVersion: `ad-${kind}-v1`,
      channelAccountId: ACCOUNT_ID,
      expectedAdvertiserId: 'advertiser-1',
      startDate: kind === 'campaign' ? '2026-08-06' : '2026-08-30',
      endDate: '2026-09-05',
      ...(kind === 'campaign'
        ? {
            businessDates: Array.from({ length: 31 }, (_, index) =>
              new Date(Date.UTC(2026, 8, 5 - index)).toISOString().slice(0, 10),
            ),
          }
        : { windowDays: 7 }),
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: null,
    manifestChecksum: 'a'.repeat(64),
    rowCount: 10,
    campaignCount: 1,
    rawOnlyCampaignCount: 0,
    warningCount: 0,
    groupCount: 1,
    completedGroupCount: 0,
    errorCode: null as string | null,
    errorMessage: null as string | null,
  };
}

type OwnerAttempt = ReturnType<typeof ownerAttempt>;

function ownerStatus(current: OwnerAttempt | null, previous: OwnerAttempt | null = null) {
  const latestComplete = current?.state === 'COMPLETE' ? current : previous;
  return {
    channelAccountId: ACCOUNT_ID,
    ready: current?.state === 'COMPLETE',
    latestAttempt: current,
    latestComplete,
    actualCutoffAt: null,
  };
}

const ownerRows = [
  {
    name: 'AdSyncRow',
    Row: AdSyncRow,
    kind: 'campaign',
    path: '/api/ads/ad-campaigns',
    statusKey: queryKeys.ads.campaignSource() as QueryKey,
    producer: 'advertising.ad_sync',
    startLabel: '광고 동기화',
    runningScope: '수집 중 · 캠페인 순회 · 2026-08-06 ~ 2026-09-05',
    usedData: '사용 중인 데이터: 2026-08-06 ~ 2026-09-05',
  },
  {
    name: 'AdKeywordRow',
    Row: AdKeywordRow,
    kind: 'keyword',
    path: '/api/ads/ad-keywords',
    statusKey: queryKeys.ads.keywordSource() as QueryKey,
    producer: 'advertising.ad_keyword',
    startLabel: '키워드 수집',
    runningScope: '수집 중 · 2026-08-30 ~ 2026-09-05',
    usedData: '사용 중인 데이터: 2026-08-30 ~ 2026-09-05',
  },
] as const;

let statuses: Record<string, unknown>;
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderRow(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

function startMessages() {
  return vi
    .mocked(sendToExtension)
    .mock.calls.map(([, message]) => message as Record<string, unknown>)
    .filter((message) => message.action === 'startCollection');
}

const SELLPIA_FRESHNESS_PATH = '/api/inventory/sellpia-freshness';
const SELLPIA_BEGIN_PATH = '/api/inventory/sellpia-source/attempts';
const SELLPIA_TOKEN = '44444444-4444-4444-8444-444444444444';
let sellpiaAttempts: Record<string, unknown>;

function sellpiaFreshness(
  status: 'fresh' | 'refresh_required' | 'syncing' | 'failed',
  lastVerifiedAt: string | null,
  errorMessage: string | null = null,
) {
  return {
    status,
    sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: 'kiditem', confirmed: true },
    lastVerifiedAt,
    expiresAt: null,
    requestedGeneration: '7',
    verifiedGeneration: '7',
    refreshRequestedAt: null,
    refreshReason: null,
    requestedSyncScope: 'inventory',
    syncNotBefore: null,
    activeSync: status === 'syncing'
      ? {
          runId: SELLPIA_TOKEN,
          generation: '8',
          scope: 'inventory',
          startedAt: '2026-09-05T16:30:00.000Z',
          leaseExpiresAt: '2099-01-01T00:00:00.000Z',
          canControl: true,
        }
      : null,
    lastAttempt: status === 'failed'
      ? {
          attemptedAt: '2026-09-05T16:30:00.000Z',
          status: 'failed',
          trigger: 'manual_request',
          scope: 'inventory',
          errorCode: null,
          errorMessage,
        }
      : null,
  };
}

function sellpiaAttempt(state: State) {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: SELLPIA_TOKEN,
    generation: '8',
    state,
    plan: {
      sourceType: 'sellpia_inventory',
      parserVersion: 'sellpia-inventory-v1',
      scope: 'inventory',
      trigger: 'manual_request',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      generation: '8',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: null,
    fileName: null,
    fileHash: null,
    contentChecksum: null,
    rowCount: 0,
    errorCode: null,
    errorMessage: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  statuses = {};
  sellpiaAttempts = {};
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: EXTENSION_ID,
    version: '1',
  });
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    const attempt = sellpiaAttempts[path.split('/').at(-1) ?? ''];
    if (!attempt) throw new ApiError(404, 'SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND', 'not found');
    return attempt;
  });
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true, collectionStartV1: true },
    }),
    setAuthToken: () => ({ success: true }),
  };
  vi.mocked(detectExtensionId).mockResolvedValue(EXTENSION_ID);
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([EXTENSION_ID]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
    const action = (message as { action: string }).action;
    const reply = extensionReplies[action];
    if (!reply) throw new Error(`unexpected extension action ${action}`);
    return reply(message as Record<string, unknown>);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path in statuses) return statuses[path];
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('readiness ad source rows', () => {
  it.each(ownerRows)(
    '$name derives ready, stale and missing from the owner source',
    async ({ Row, kind, path, statusKey, usedData }) => {
      const complete = ownerAttempt(kind, 'COMPLETE');
      statuses[`${path}/source`] = ownerStatus(complete);
      const view = renderRow(<Row />);
      expect(await screen.findByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();

      statuses[`${path}/source`] = { ...ownerStatus(complete), ready: false };
      await act(() => view.client.refetchQueries({ queryKey: statusKey }));
      expect(await screen.findByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
      expect(view.container).toHaveTextContent(usedData);

      statuses[`${path}/source`] = ownerStatus(null);
      await act(() => view.client.refetchQueries({ queryKey: statusKey }));
      expect(await screen.findByText(SOURCE_READINESS_LABELS.missing)).toBeInTheDocument();
    },
  );

  it.each(ownerRows)(
    '$name starts $producer through the start contract without beginning an attempt itself',
    async ({ Row, kind, path, producer, startLabel, runningScope }) => {
      statuses[`${path}/source`] = ownerStatus(null);
      extensionReplies.startCollection = (message) => {
        statuses[`${path}/source`] = ownerStatus(ownerAttempt(kind, 'RUNNING'));
        return { success: true, outcome: 'started', producer: message.producer, attemptId: ATTEMPT_ID };
      };
      renderRow(<Row />);

      fireEvent.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByText(runningScope)).toBeInTheDocument();
      expect(startMessages()).toEqual([
        {
          action: 'startCollection',
          producer,
          idempotencyKey: expect.stringMatching(UUID),
          scope: {},
        },
      ]);
      expect(vi.mocked(apiClient.post).mock.calls.map(([postPath]) => postPath)).toEqual([
        '/api/auth/extension-handoff',
      ]);
    },
  );

  it.each(ownerRows)(
    '$name stops a running attempt through $path when the extension holds no session',
    async ({ Row, kind, path, startLabel }) => {
      statuses[`${path}/source`] = ownerStatus(ownerAttempt(kind, 'RUNNING'));
      extensionReplies.cancelCollectionSession = () => ({
        success: false,
        error: 'Collection session not found',
      });
      vi.mocked(apiClient.post).mockImplementation(async (postPath: string) => {
        if (postPath !== `${path}/attempts/${ATTEMPT_ID}/cancel`) {
          throw new Error(`unexpected POST ${postPath}`);
        }
        const cancelled = {
          ...ownerAttempt(kind, 'FAILED'),
          errorCode: 'USER_CANCELLED',
          errorMessage: '운영자가 수집을 중단했습니다.',
        };
        statuses[`${path}/source`] = ownerStatus(cancelled);
        return cancelled;
      });
      renderRow(<Row />);

      fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

      expect(await screen.findByText('운영자가 수집을 중단했습니다.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: startLabel })).toBeEnabled();
    },
  );

  it.each([
    { ...ownerRows[0], refreshed: [true, true, true] },
    { ...ownerRows[1], refreshed: [true, false, true] },
  ])(
    '$name refreshes the screens reading its facts only after a new collection completes',
    async ({ Row, kind, path, statusKey, refreshed }) => {
      const prior = ownerAttempt(kind, 'COMPLETE');
      statuses[`${path}/source`] = ownerStatus(prior);
      const { client } = renderRow(<Row />);
      const dependents = [
        [...queryKeys.ads.all, 'visible-ad-data'],
        [...queryKeys.dashboard.all, 'summary'],
        ['readiness', 'checks'],
      ];
      for (const key of dependents) client.setQueryData(key, { rows: [] });
      const invalidated = () =>
        dependents.map((key) => client.getQueryState(key)?.isInvalidated ?? false);
      expect(await screen.findByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();

      // Reading again the COMPLETE this row already shows is not a new collection.
      await act(() => client.refetchQueries({ queryKey: statusKey }));
      expect(invalidated()).toEqual([false, false, false]);

      statuses[`${path}/source`] = ownerStatus(ownerAttempt(kind, 'COMPLETE', NEXT_ATTEMPT_ID));
      await act(() => client.refetchQueries({ queryKey: statusKey }));

      await waitFor(() => expect(invalidated()).toEqual(refreshed));
    },
  );

  it('shows a failed sweep beside the dates of the previous complete sweep', async () => {
    const previous = ownerAttempt('campaign', 'COMPLETE');
    const failed = {
      ...ownerAttempt('campaign', 'FAILED', NEXT_ATTEMPT_ID),
      errorCode: 'LOGIN_REQUIRED',
      errorMessage: '광고센터 로그인이 필요합니다.',
    };
    statuses['/api/ads/ad-campaigns/source'] = { ...ownerStatus(failed, previous), ready: false };
    const view = renderRow(<AdSyncRow />);

    expect(await screen.findByText('광고센터 로그인이 필요합니다.')).toBeInTheDocument();
    expect(view.container).toHaveTextContent('사용 중인 데이터: 2026-08-06 ~ 2026-09-05');
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });
});

describe('readiness Sellpia row', () => {
  it('derives the Sellpia chip from freshness and the KST date of the last verification', async () => {
    statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness('fresh', '2026-09-05T16:30:00.000Z');
    const view = renderRow(<StockSyncRow />);
    expect(await screen.findByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();

    statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness('refresh_required', '2026-09-05T16:30:00.000Z');
    await act(() => view.client.refetchQueries({ queryKey: queryKeys.inventory.freshness() }));
    expect(await screen.findByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();

    statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness('refresh_required', null);
    await act(() => view.client.refetchQueries({ queryKey: queryKeys.inventory.freshness() }));
    expect(await screen.findByText(SOURCE_READINESS_LABELS.missing)).toBeInTheDocument();
  });

  it('shows a live Sellpia collection as running and a failure through the owner message', async () => {
    statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness('syncing', '2026-09-05T16:30:00.000Z');
    const view = renderRow(<StockSyncRow />);
    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '재고 동기화' })).not.toBeInTheDocument();
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
    expect(screen.queryByText('갱신 중')).not.toBeInTheDocument();

    statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness(
      'failed',
      '2026-09-05T16:30:00.000Z',
      '셀피아 로그인이 필요합니다.',
    );
    await act(() => view.client.refetchQueries({ queryKey: queryKeys.inventory.freshness() }));
    expect(await screen.findByText('셀피아 로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재고 동기화' })).toBeEnabled();
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
    expect(screen.queryByText('실패')).not.toBeInTheDocument();
  });

  it('starts Sellpia inventory once and shows it running on the stock screen control as well', async () => {
    statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness('refresh_required', '2026-09-05T16:30:00.000Z');
    extensionReplies.collectSellpiaInventory = () => new Promise(() => undefined);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
      if (path !== SELLPIA_BEGIN_PATH) throw new Error(`unexpected POST ${path}`);
      sellpiaAttempts[ATTEMPT_ID] = sellpiaAttempt('RUNNING');
      statuses[SELLPIA_FRESHNESS_PATH] = sellpiaFreshness('syncing', '2026-09-05T16:30:00.000Z');
      return sellpiaAttempts[ATTEMPT_ID];
    });
    renderRow(
      <>
        <StockSyncRow />
        <SellpiaSyncAction />
      </>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '재고 동기화' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2));
    expect(
      vi.mocked(apiClient.post).mock.calls.filter(([path]) => path === SELLPIA_BEGIN_PATH),
    ).toHaveLength(1);
  });
});
