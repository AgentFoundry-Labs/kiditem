import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  detectBrowserCollectionExtensionIds,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import { SellpiaSyncAction } from './SellpiaSyncAction';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FRESHNESS_PATH = '/api/inventory/sellpia-freshness';
const BEGIN_PATH = '/api/inventory/sellpia-source/attempts';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOPPED = '운영자가 수집을 중단했습니다.';

type AttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';

function attempt(state: AttemptState, patch: Record<string, unknown> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
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
    ...patch,
  };
}

function freshness(
  status: 'fresh' | 'refresh_required' | 'syncing' | 'failed',
  patch: Record<string, unknown> = {},
) {
  return {
    status,
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: 'kiditem',
      confirmed: true,
    },
    lastVerifiedAt: '2026-09-14T00:30:00.000Z',
    expiresAt: null,
    requestedGeneration: '7',
    verifiedGeneration: '7',
    refreshRequestedAt: null,
    refreshReason: null,
    requestedSyncScope: 'inventory',
    syncNotBefore: null,
    activeSync: status === 'syncing'
      ? {
          attemptId: ATTEMPT_ID,
          generation: '8',
          scope: 'inventory',
          startedAt: '2026-09-14T01:00:00.000Z',
          leaseExpiresAt: '2099-01-01T00:00:00.000Z',
          canControl: false,
        }
      : null,
    lastAttempt: status === 'failed'
      ? {
          attemptedAt: '2026-09-14T01:00:00.000Z',
          trigger: 'manual_request',
          scope: 'inventory',
          errorCode: null,
          errorMessage: '셀피아 로그인이 필요합니다.',
        }
      : null,
    ...patch,
  };
}

/** How the owner records a stopped attempt: cancelled, with no failure code or message. */
function stoppedLastAttempt() {
  return {
    attemptedAt: '2026-09-14T01:00:00.000Z',
    status: 'cancelled',
    trigger: 'manual_request',
    scope: 'inventory',
    errorCode: null,
    errorMessage: null,
  };
}

let freshnessView: ReturnType<typeof freshness>;

function renderActions(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

function extensionMessages(action: string) {
  return vi
    .mocked(sendToExtension)
    .mock.calls.filter(([, message]) => (message as { action: string }).action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  freshnessView = freshness('refresh_required');
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'sellpia-extension',
    version: '1',
  });
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  // The extension answers only when the collection ends; its session shows it took the attempt.
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message) ?? new Promise(() => undefined));
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === FRESHNESS_PATH) return freshnessView;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === BEGIN_PATH) {
      freshnessView = freshness('syncing');
      return attempt('RUNNING');
    }
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('SellpiaSyncAction', () => {
  it('begins one attempt, sends only its id to the extension and shows it running on every copy', async () => {
    renderActions(
      <>
        <SellpiaSyncAction showStatus />
        <SellpiaSyncAction compact />
      </>,
    );
    const [start] = await screen.findAllByRole('button', { name: '셀피아 재고 동기화' });

    fireEvent.click(start);

    await waitFor(() => expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2));
    const begins = vi.mocked(apiClient.post).mock.calls.filter(([path]) => path === BEGIN_PATH);
    expect(begins).toHaveLength(1);
    expect(begins[0]?.[1]).toEqual({ scope: 'inventory', trigger: 'manual_request' });
    expect(begins[0]?.[2]?.headers).toEqual({ 'Idempotency-Key': expect.stringMatching(UUID) });
    expect(extensionMessages('collectSellpiaInventory')).toEqual([
      ['sellpia-extension', { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID }, 190_000],
    ]);
  });

  it('asks for a retry after a failed collection', async () => {
    freshnessView = freshness('failed');
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      BEGIN_PATH,
      { scope: 'inventory', trigger: 'retry' },
      expect.anything(),
    ));
  });

  it('joins the attempt the owner reports as already running instead of starting another', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== BEGIN_PATH) throw new Error(`unexpected POST ${path}`);
      freshnessView = freshness('syncing');
      throw new ApiError(409, 'Conflict', 'Conflict', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: ATTEMPT_ID,
      });
    });
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 재고 동기화' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(extensionMessages('collectSellpiaInventory')).toEqual([]);
  });

  it('shows a live lease that names no attempt, such as a manual upload, as running without a stop', async () => {
    const syncing = freshness('syncing');
    freshnessView = freshness('syncing', { activeSync: { ...syncing.activeSync, attemptId: null } });
    renderActions(<SellpiaSyncAction />);

    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '셀피아 재고 동기화' })).not.toBeInTheDocument();
  });

  it('stops a collection another browser started, by the attempt the owner read names', async () => {
    freshnessView = freshness('syncing');
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`) throw new Error(`unexpected POST ${path}`);
      freshnessView = freshness('refresh_required', { lastAttempt: stoppedLastAttempt() });
      return attempt('FAILED', { errorCode: 'USER_CANCELLED', errorMessage: STOPPED });
    });
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '셀피아 재고 동기화' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(`${BEGIN_PATH}/${ATTEMPT_ID}/cancel`);
  });

  it('shows a stopped collection as stopped, not failed, and begins the next one as a manual request', async () => {
    freshnessView = freshness('refresh_required', { lastAttempt: stoppedLastAttempt() });
    renderActions(<SellpiaSyncAction showStatus />);

    expect(await screen.findByText('수집 중단됨')).toBeInTheDocument();
    expect(screen.queryByText('실패')).not.toBeInTheDocument();
    const start = screen.getByRole('button', { name: '셀피아 재고 동기화' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      BEGIN_PATH,
      { scope: 'inventory', trigger: 'manual_request' },
      expect.anything(),
    ));
  });

  it('opens no attempt when the Sellpia extension is not connected', async () => {
    vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({ status: 'not_found' });
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 재고 동기화' }));

    expect(
      await screen.findByText('셀피아 재고 수집 익스텐션을 연결한 뒤 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refreshes inventory readers only when a newer verified generation appears', async () => {
    freshnessView = freshness('fresh');
    const { client } = renderActions(<SellpiaSyncAction />);
    client.setQueryData(queryKeys.inventory.snapshots(), { rows: [] });
    expect(await screen.findByRole('button', { name: '셀피아 재고 동기화' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.inventory.freshness() }));
    expect(client.getQueryState(queryKeys.inventory.snapshots())?.isInvalidated).toBe(false);

    freshnessView = freshness('fresh', { verifiedGeneration: '8', requestedGeneration: '8' });
    await act(() => client.refetchQueries({ queryKey: queryKeys.inventory.freshness() }));

    await waitFor(() =>
      expect(client.getQueryState(queryKeys.inventory.snapshots())?.isInvalidated).toBe(true),
    );
  });

  it('confirms the Sellpia source binding when the owner reports it missing', async () => {
    freshnessView = freshness('refresh_required', {
      sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: null, confirmed: false },
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `${FRESHNESS_PATH}/source-binding`) throw new Error(`unexpected POST ${path}`);
      freshnessView = freshness('refresh_required');
      return freshnessView;
    });
    renderActions(<SellpiaSyncAction showStatus />);

    expect(await screen.findByText(/https:\/\/kiditem\.sellpia\.com · kiditem/)).toBeInTheDocument();
    expect(screen.getByText('갱신 필요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '셀피아 계정 연결 확인' }));

    await waitFor(() => expect(
      screen.queryByRole('button', { name: '셀피아 계정 연결 확인' }),
    ).not.toBeInTheDocument());
    expect(apiClient.post).toHaveBeenCalledWith(`${FRESHNESS_PATH}/source-binding`, {
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
  });
});
