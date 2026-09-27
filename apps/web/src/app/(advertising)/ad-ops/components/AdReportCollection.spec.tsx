import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectBrowserCollectionExtensionIds, detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { AdReportCollection } from './AdReportCollection';
import { adReportOperationsQueryKey } from '../lib/ad-report-collection';

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
const OPERATIONS_PATH = '/api/operations?kinds=advertising.ad_report&limit=5';

function result(values: Record<string, unknown> = {}) {
  return {
    startDate: '2026-09-12',
    endDate: '2026-09-26',
    confirmedEndDate: '2026-09-26',
    productRowCount: 10,
    keywordRowCount: 4,
    campaignCount: 2,
    adCount: 3,
    settlementRowCount: 5,
    spendTotal: 10_000,
    billedTotal: 9_900,
    unsettledCampaignDays: 0,
    accountAdjustmentRows: 0,
    warnings: [],
    ...values,
  };
}

function operation(
  status: 'executing' | 'succeeded' | 'failed' | 'cancelled',
  { id = OPERATION_ID, errorCode = null, operationResult = null }: { id?: string; errorCode?: string | null; operationResult?: Record<string, unknown> | null } = {},
) {
  return {
    id,
    kind: 'advertising.ad_report',
    status,
    lockKeys: status === 'executing' ? [`resource:ad-center:${ACCOUNT_ID}`] : [],
    plan: { channelAccountId: ACCOUNT_ID, vendorId: 'A001', startDate: '2026-09-12', endDate: '2026-09-26', settlementDomains: ['SELLER', 'RETAIL'], startedAt: '2026-09-27T01:00:00.000Z' },
    progress: null,
    result: operationResult,
    window: { start: '2026-09-12', end: '2026-09-26' },
    errorCode,
    errorMessage: null,
    startedAt: '2026-09-27T01:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-27T01:01:00.000Z',
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
        <AdReportCollection />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  extensionReplies = {
    ping: () => ({ success: true, capabilities: { operationRuntime: true, advertisingAdReportOperationKindV1: true } }),
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
      return [{ id: ACCOUNT_ID, channel: 'coupang', name: 'Wing', externalAccountId: null, vendorId: 'A001', sellerId: null, isPrimary: true }];
    }
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('AdReportCollection', () => {
  it('starts the advertising.ad_report operation for the primary Coupang account through the extension', async () => {
    extensionReplies['operation.start'] = () => {
      operations = [operation('executing')];
      return { success: true, operationId: OPERATION_ID, reused: false };
    };
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '광고 보고서 수집' }));

    expect(await screen.findByText('수집 중 · 2026-09-12 ~ 2026-09-26')).toBeInTheDocument();
    const starts = vi.mocked(sendToExtension).mock.calls.map(([, message]) => message)
      .filter((message) => (message as { action: string }).action === 'operation.start');
    expect(starts).toEqual([{ action: 'operation.start', kind: 'advertising.ad_report', scope: { channelAccountId: ACCOUNT_ID } }]);
  });

  it('refuses to start on an extension build without the ad report kind', async () => {
    extensionReplies.ping = () => ({ success: true, capabilities: { operationRuntime: true } });
    renderCollection();

    fireEvent.click(await screen.findByRole('button', { name: '광고 보고서 수집' }));

    expect(await screen.findByText('확장 프로그램을 업데이트해 주세요.')).toBeInTheDocument();
  });

  it('shows the confirmed window of the last run and its settlement warnings', async () => {
    operations = [operation('succeeded', {
      operationResult: result({
        confirmedEndDate: '2026-09-25',
        unsettledCampaignDays: 1,
        warnings: [
          { date: '2026-09-20', campaignId: '11', reportSpend: 5_000, settlementSpend: 6_001 },
          { date: '2026-09-21', campaignId: '11', reportSpend: 5_000, settlementSpend: 6_500 },
        ],
      }),
    })];
    renderCollection();

    expect(await screen.findByTestId('ad-report-last-run')).toHaveTextContent('최근 수집 2026-09-12 ~ 2026-09-25');
    expect(screen.getByTestId('ad-report-warnings')).toHaveTextContent('정산 대조 경고 2건 · 정산 미확인 1일');
  });

  it('shows no settlement warning line when the last run reconciled', async () => {
    operations = [operation('succeeded', { operationResult: result() })];
    renderCollection();

    expect(await screen.findByTestId('ad-report-last-run')).toHaveTextContent('최근 수집 2026-09-12 ~ 2026-09-26');
    expect(screen.queryByTestId('ad-report-warnings')).not.toBeInTheDocument();
  });

  it('shows a failed operation with its operator sentence', async () => {
    operations = [operation('failed', { errorCode: 'SITE_LOGIN_REQUIRED' })];
    renderCollection();

    expect(await screen.findByTestId('ad-report-failure')).toHaveTextContent('로그인');
  });

  it('refreshes the ad reads only after a new operation succeeds', async () => {
    operations = [operation('succeeded', { operationResult: result() })];
    const { client } = renderCollection();
    client.setQueryData(queryKeys.ads.extensionStatus(), { wing: { kpis: {} } });
    const invalidated = () => client.getQueryState(queryKeys.ads.extensionStatus())?.isInvalidated ?? false;
    expect(await screen.findByRole('button', { name: '광고 보고서 수집' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: adReportOperationsQueryKey }));
    expect(invalidated()).toBe(false);

    operations = [operation('succeeded', { id: NEXT_OPERATION_ID, operationResult: result() }), operation('succeeded', { operationResult: result() })];
    await act(() => client.refetchQueries({ queryKey: adReportOperationsQueryKey }));

    await waitFor(() => expect(invalidated()).toBe(true));
  });
});
