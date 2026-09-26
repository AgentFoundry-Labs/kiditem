import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectBrowserCollectionExtensionIds, detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { WingItemwinnerCollection } from './WingItemwinnerCollection';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const EXTENSION_ID = 'kiditem-extension';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_OPERATION_ID = '33333333-3333-4333-8333-333333333333';
const OPERATIONS_PATH = '/api/operations?kinds=advertising.wing_itemwinner&limit=5';

function operation(status: 'executing' | 'succeeded' | 'failed' | 'cancelled', id = OPERATION_ID, errorCode: string | null = null) {
  return {
    id,
    kind: 'advertising.wing_itemwinner',
    status,
    lockKeys: status === 'executing' ? [`account:${ACCOUNT_ID}`, `resource:wing-daily:${ACCOUNT_ID}`] : [],
    plan: { channelAccountId: ACCOUNT_ID, businessDate: '2026-09-07' },
    progress: null,
    result: null,
    window: { start: '2026-09-07', end: '2026-09-07' },
    errorCode,
    errorMessage: null,
    startedAt: '2026-09-07T01:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-07T01:01:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  };
}

let operations: Array<ReturnType<typeof operation>>;
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderCollection(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
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
  operations = [];
  extensionReplies = {
    ping: () => ({ success: true, capabilities: { operationRuntime: true, wingDailyOperationKindsV1: true } }),
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
    if (path === OPERATIONS_PATH) return { operations };
    if (path.startsWith('/api/operations/')) {
      const found = operations.find((entry) => entry.id === path.slice('/api/operations/'.length));
      if (found) return { operation: found };
    }
    if (path === '/api/channels/accounts') {
      return [
        { id: '44444444-4444-4444-8444-444444444444', channel: 'naver', name: 'Naver', externalAccountId: null, vendorId: null, sellerId: null, isPrimary: true },
        { id: ACCOUNT_ID, channel: 'coupang', name: 'Wing', externalAccountId: null, vendorId: 'A001', sellerId: null, isPrimary: true },
      ];
    }
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('WingItemwinnerCollection', () => {
  it('starts the advertising.wing_itemwinner operation for the primary Coupang account through the extension', async () => {
    extensionReplies['operation.start'] = () => {
      operations = [operation('executing')];
      return { success: true, operationId: OPERATION_ID, reused: false };
    };
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '아이템위너 수집' }));

    expect(await screen.findByText('수집 중 · 2026-09-07 기준')).toBeInTheDocument();
    const starts = vi.mocked(sendToExtension).mock.calls.map(([, message]) => message)
      .filter((message) => (message as { action: string }).action === 'operation.start');
    expect(starts).toEqual([{ action: 'operation.start', kind: 'advertising.wing_itemwinner', scope: { channelAccountId: ACCOUNT_ID } }]);
  });

  it('refuses to start on an extension build without the Wing daily kinds', async () => {
    extensionReplies.ping = () => ({ success: true, capabilities: { operationRuntime: true } });
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '아이템위너 수집' }));

    expect(await screen.findByText('확장 프로그램을 업데이트해 주세요.')).toBeInTheDocument();
  });

  it('stops a running operation in the extension and on the server', async () => {
    operations = [operation('executing')];
    extensionReplies['operation.cancel'] = () => ({ success: true });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `/api/operations/${OPERATION_ID}/cancel`) throw new Error(`unexpected POST ${path}`);
      operations = [operation('cancelled', OPERATION_ID, 'USER_CANCELLED')];
      return { operation: operations[0] };
    });
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '아이템위너 수집' })).toBeEnabled();
  });

  it('shows a failed operation with its operator sentence', async () => {
    operations = [operation('failed', OPERATION_ID, 'SITE_LOGIN_REQUIRED')];
    renderCollection();

    expect(await screen.findByTestId('wing-itemwinner-failure')).toBeInTheDocument();
  });

  it('refreshes the ad reads behind the itemwinner card only after a new operation succeeds', async () => {
    operations = [operation('succeeded')];
    const { client } = renderCollection();
    client.setQueryData(queryKeys.ads.extensionStatus(), { wing: { kpis: {} } });
    const invalidated = () => client.getQueryState(queryKeys.ads.extensionStatus())?.isInvalidated ?? false;
    expect(await screen.findByRole('button', { name: '아이템위너 수집' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.itemwinnerOperations() }));
    expect(invalidated()).toBe(false);

    operations = [operation('succeeded', NEXT_OPERATION_ID), operation('succeeded')];
    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.itemwinnerOperations() }));

    await waitFor(() => expect(invalidated()).toBe(true));
  });
});
