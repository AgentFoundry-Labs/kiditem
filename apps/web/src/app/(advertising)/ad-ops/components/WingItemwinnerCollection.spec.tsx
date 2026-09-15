import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { WingItemwinnerCollection } from './WingItemwinnerCollection';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const EXTENSION_ID = 'kiditem-extension';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_PATH = '/api/ads/wing-itemwinner/source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function itemwinnerAttempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
  attemptId = ATTEMPT_ID,
  failure: { errorCode: string; errorMessage: string } | null = null,
) {
  return {
    attemptId,
    channelAccountId: ACCOUNT_ID,
    generation: '3',
    state,
    plan: {
      sourceType: 'coupang_wing_itemwinner',
      parserVersion: 'wing-itemwinner-v1',
      channelAccountId: ACCOUNT_ID,
      expectedVendorId: 'A001',
      businessDate: '2026-09-07',
      pageType: 'itemwinner',
      targetUrl: 'https://wing.coupang.com/tenants/seller-web/item-winner',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-09-08T00:00:00.000Z' : null,
    observedAt: state === 'COMPLETE' ? '2026-09-07T23:00:00.000Z' : null,
    contentChecksum: null,
    itemCount: state === 'COMPLETE' ? 12 : 0,
    errorCode: failure?.errorCode ?? null,
    errorMessage: failure?.errorMessage ?? null,
  };
}

type ItemwinnerAttempt = ReturnType<typeof itemwinnerAttempt>;

function itemwinnerSource(latestAttempt: ItemwinnerAttempt | null) {
  const latestComplete = latestAttempt?.state === 'COMPLETE' ? latestAttempt : null;
  return {
    channelAccountId: ACCOUNT_ID,
    ready: latestComplete !== null,
    latestAttempt,
    latestComplete,
    actualCutoffAt: latestComplete?.actualCutoffAt ?? null,
  };
}

let serverStatus: ReturnType<typeof itemwinnerSource>;
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderCollection(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <WingItemwinnerCollection />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serverStatus = itemwinnerSource(null);
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
    if (path === SOURCE_PATH) return serverStatus;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('WingItemwinnerCollection', () => {
  it('starts the Wing itemwinner collection through the start contract', async () => {
    extensionReplies.startCollection = (message) => {
      serverStatus = itemwinnerSource(itemwinnerAttempt('RUNNING'));
      return { success: true, outcome: 'started', producer: message.producer, attemptId: ATTEMPT_ID };
    };
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '아이템위너 수집' }));

    expect(await screen.findByText('수집 중 · 2026-09-07 기준')).toBeInTheDocument();
    expect(
      vi
        .mocked(sendToExtension)
        .mock.calls.map(([, message]) => message)
        .filter((message) => (message as { action: string }).action === 'startCollection'),
    ).toEqual([
      {
        action: 'startCollection',
        producer: 'dashboard.wing_kpi',
        idempotencyKey: expect.stringMatching(UUID),
        scope: {},
      },
    ]);
    expect(vi.mocked(apiClient.post).mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/extension-handoff',
    ]);
  });

  it('stops a running collection through the itemwinner owner route when the extension holds no session', async () => {
    serverStatus = itemwinnerSource(itemwinnerAttempt('RUNNING'));
    extensionReplies.cancelCollectionSession = () => ({
      success: false,
      error: 'Collection session not found',
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `/api/ads/wing-itemwinner/attempts/${ATTEMPT_ID}/cancel`) {
        throw new Error(`unexpected POST ${path}`);
      }
      const cancelled = itemwinnerAttempt('FAILED', ATTEMPT_ID, {
        errorCode: 'USER_CANCELLED',
        errorMessage: '운영자가 수집을 중단했습니다.',
      });
      serverStatus = itemwinnerSource(cancelled);
      return cancelled;
    });
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '아이템위너 수집' })).toBeEnabled();
  });

  it('shows a collection stopped with its browser session as stopped, not failed', async () => {
    serverStatus = itemwinnerSource(itemwinnerAttempt('FAILED', ATTEMPT_ID, {
      errorCode: 'COLLECTION_CANCELLED',
      errorMessage: 'Collection was cancelled because no KidItem tab remained.',
    }));
    renderCollection();

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(
      screen.queryByText('Collection was cancelled because no KidItem tab remained.'),
    ).not.toBeInTheDocument();
  });

  it('refreshes the ad reads behind the itemwinner card only after a new collection completes', async () => {
    serverStatus = itemwinnerSource(itemwinnerAttempt('COMPLETE'));
    const { client } = renderCollection();
    client.setQueryData(queryKeys.ads.extensionStatus(), { wing: { kpis: {} } });
    const extensionStatusInvalidated = () =>
      client.getQueryState(queryKeys.ads.extensionStatus())?.isInvalidated ?? false;
    expect(await screen.findByRole('button', { name: '아이템위너 수집' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.itemwinnerSource() }));
    expect(extensionStatusInvalidated()).toBe(false);

    serverStatus = itemwinnerSource(itemwinnerAttempt('COMPLETE', NEXT_ATTEMPT_ID));
    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.itemwinnerSource() }));

    await waitFor(() => expect(extensionStatusInvalidated()).toBe(true));
  });
});
