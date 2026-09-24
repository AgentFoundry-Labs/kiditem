import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useRocketPoCollection } from '@/hooks/use-rocket-po-source';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  detectBrowserCollectionExtensionIds,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '55555555-5555-4555-8555-555555555555';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const BEGIN_PATH = '/api/channels/rocket-po/attempts';
const RANGE = { from: '2026-07-01', to: '2026-07-31' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';

function attempt(
  channelAccountId: string,
  state: AttemptState,
  attemptId = ATTEMPT_ID,
  patch: Record<string, unknown> = {},
) {
  return {
    attemptId,
    channelAccountId,
    state,
    generation: '1',
    plan: {
      channelAccountId,
      from: RANGE.from,
      to: RANGE.to,
      status: '',
      dateType: 'WAREHOUSING_PLAN_DATE',
      requireConfirmation: true,
      sourceType: 'coupang_rocket_po_catalog',
      parserVersion: 'rocket-po-v1',
      vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null },
    },
    expiresAt: '2099-01-01T00:00:00Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-07-31T01:00:00Z' : null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

let sources: Record<string, Record<string, unknown>>;

function RocketControl({ accountId, label }: { accountId: string; label: string }) {
  const control = useRocketPoCollection(accountId);
  return (
    <section aria-label={label}>
      <CollectionStartControl
        control={control}
        startLabel="로켓 PO 수집"
        onStart={() => control.start(RANGE)}
        onStop={control.stop}
      />
    </section>
  );
}

function renderControls(ui: React.ReactNode) {
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
  sources = {
    [ACCOUNT_A]: { ready: false, latestAttempt: null, latestComplete: null, latestCompleteCoverage: null },
    [ACCOUNT_B]: { ready: false, latestAttempt: null, latestComplete: null, latestCompleteCoverage: null },
  };
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'rocket-extension',
    version: '1',
  });
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message) ?? new Promise(() => undefined));
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    const accountId = new URL(path, 'http://localhost').searchParams.get('channelAccountId') ?? '';
    const source = sources[accountId];
    if (!source) throw new Error(`unexpected GET ${path}`);
    return source;
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path !== BEGIN_PATH) throw new Error(`unexpected POST ${path}`);
    sources[ACCOUNT_A] = { ready: false, latestAttempt: attempt(ACCOUNT_A, 'RUNNING'), latestComplete: null, latestCompleteCoverage: null };
    return { ...attempt(ACCOUNT_A, 'RUNNING'), attemptToken: '44444444-4444-4444-8444-444444444444' };
  });
});

describe('Rocket PO collection control', () => {
  it("begins the account's attempt, sends only its id and shows it running on every copy for that account", async () => {
    renderControls(
      <>
        <RocketControl accountId={ACCOUNT_A} label="확인 패널" />
        <RocketControl accountId={ACCOUNT_A} label="대시보드" />
        <RocketControl accountId={ACCOUNT_B} label="다른 계정" />
      </>,
    );
    const panel = screen.getByRole('region', { name: '확인 패널' });

    fireEvent.click(await within(panel).findByRole('button', { name: '로켓 PO 수집' }));

    expect(await within(panel).findByText('수집 중 · 2026-07-01 ~ 2026-07-31')).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: '대시보드' })).findByText('수집 중 · 2026-07-01 ~ 2026-07-31'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '다른 계정' })).getByRole('button', { name: '로켓 PO 수집' }),
    ).toBeEnabled();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([[
      BEGIN_PATH,
      {
        channelAccountId: ACCOUNT_A,
        from: RANGE.from,
        to: RANGE.to,
        status: '',
        dateType: 'WAREHOUSING_PLAN_DATE',
        requireConfirmation: true,
      },
      { headers: { 'Idempotency-Key': expect.stringMatching(UUID) } },
    ]]);
    expect(extensionMessages('collectRocketPoRows')).toEqual([
      ['rocket-extension', { action: 'collectRocketPoRows', attemptId: ATTEMPT_ID }, 190_000],
    ]);
  });

  it('stops the attempt it opened and gives the reason when the extension cannot be reached', async () => {
    const cancelPath = `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`;
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
      if ((message as { action: string }).action === 'collectRocketPoRows') {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      return null;
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === BEGIN_PATH) {
        return { ...attempt(ACCOUNT_A, 'RUNNING'), attemptToken: '44444444-4444-4444-8444-444444444444' };
      }
      if (path === cancelPath) return attempt(ACCOUNT_A, 'FAILED');
      throw new Error(`unexpected POST ${path}`);
    });
    renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);

    fireEvent.click(await screen.findByRole('button', { name: '로켓 PO 수집' }));

    expect(
      await screen.findByText('확장 프로그램이 수집을 넘겨받지 못했습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.'),
    ).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(cancelPath);
  });

  it('joins the collection the owner already runs for the account', async () => {
    vi.mocked(apiClient.post).mockImplementation(async () => {
      sources[ACCOUNT_A] = { ready: false, latestAttempt: attempt(ACCOUNT_A, 'RUNNING'), latestComplete: null, latestCompleteCoverage: null };
      throw new ApiError(409, 'Conflict', 'Conflict', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: ATTEMPT_ID,
      });
    });
    renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);

    fireEvent.click(await screen.findByRole('button', { name: '로켓 PO 수집' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(extensionMessages('collectRocketPoRows')).toEqual([]);
  });

  it('stops through the owner route when no extension holds the session', async () => {
    sources[ACCOUNT_A] = { ready: false, latestAttempt: attempt(ACCOUNT_A, 'RUNNING'), latestComplete: null, latestCompleteCoverage: null };
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`) throw new Error(`unexpected POST ${path}`);
      const cancelled = attempt(ACCOUNT_A, 'FAILED', ATTEMPT_ID, {
        errorCode: 'USER_CANCELLED',
        errorMessage: '운영자가 수집을 중단했습니다.',
      });
      sources[ACCOUNT_A] = { ready: false, latestAttempt: cancelled, latestComplete: null, latestCompleteCoverage: null };
      return cancelled;
    });
    renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '로켓 PO 수집' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(`${BEGIN_PATH}/${ATTEMPT_ID}/cancel`);
  });

  it('opens no attempt while the order collection extension is outdated', async () => {
    vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
      status: 'incompatible',
      extensionId: 'rocket-extension',
      version: '1',
      missingCapabilities: ['coupangRocketPoSourceOwnerV1'],
    });
    renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);

    fireEvent.click(await screen.findByRole('button', { name: '로켓 PO 수집' }));

    expect(await screen.findByText(/주문수집 확장프로그램이 이전 버전입니다/)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refreshes the saved Rocket PO lists and the dashboard collection times only after a new complete collection', async () => {
    sources[ACCOUNT_A] = {
      ready: true,
      latestAttempt: attempt(ACCOUNT_A, 'COMPLETE'),
      latestComplete: attempt(ACCOUNT_A, 'COMPLETE'),
      latestCompleteCoverage: null,
    };
    const { client } = renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);
    const savedListKey = [...queryKeys.orders.rocketSavedPoLists(), 'month'];
    // The dashboard's Rocket PO cell shows when the collection last completed.
    const dashboardCollectionsKey = queryKeys.dashboard.collections();
    client.setQueryData(savedListKey, []);
    client.setQueryData(dashboardCollectionsKey, { lastCompleted: {} });
    expect(await screen.findByRole('button', { name: '로켓 PO 수집' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.orders.rocketPoSource(ACCOUNT_A) }));
    expect(client.getQueryState(savedListKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(dashboardCollectionsKey)?.isInvalidated).toBe(false);

    const next = attempt(ACCOUNT_A, 'COMPLETE', NEXT_ATTEMPT_ID);
    sources[ACCOUNT_A] = { ready: true, latestAttempt: next, latestComplete: next, latestCompleteCoverage: null };
    await act(() => client.refetchQueries({ queryKey: queryKeys.orders.rocketPoSource(ACCOUNT_A) }));

    await waitFor(() => {
      expect(client.getQueryState(savedListKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(dashboardCollectionsKey)?.isInvalidated).toBe(true);
    });
  });
});
