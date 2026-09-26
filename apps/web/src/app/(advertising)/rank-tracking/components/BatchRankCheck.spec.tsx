import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import BatchRankCheck from './BatchRankCheck';

const mocks = vi.hoisted(() => ({ start: vi.fn(), cancelInExtension: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: mocks.start,
  requestOperationCancel: mocks.cancelInExtension,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: async (path: string) => {
      if (path === WING_PATH) return { operations: wingOperations };
      throw new Error(`unexpected GET ${path}`);
    },
    getParsed: async (path: string) => {
      if (path === '/api/channels/accounts') return accounts;
      throw new Error(`unexpected GET ${path}`);
    },
    post: (path: string) => mocks.post(path),
  },
}));

const WING_PATH = '/api/operations?kinds=advertising.wing_rank&limit=20';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const PREVIOUS_ID = '22222222-2222-4222-8222-222222222222';

function operation(id: string, status: 'executing' | 'succeeded' | 'failed', patch: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'advertising.wing_rank',
    status,
    lockKeys: [],
    plan: { channelAccountId: ACCOUNT_ID, maxPages: 5, keywords: [{ keyword: '연필', targets: [] }, { keyword: '슬라임', targets: [] }], selection: {} },
    progress: status === 'executing' ? { current: 1, total: 2, label: '연필' } : null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-26T00:05:00.000Z',
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

let wingOperations: ReturnType<typeof operation>[];
let accounts: unknown[];

function renderCheck(onCompleted = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BatchRankCheck onCompleted={onCompleted} /></QueryClientProvider>);
  return { client, onCompleted };
}

beforeEach(() => {
  vi.clearAllMocks();
  wingOperations = [];
  accounts = [{ id: ACCOUNT_ID, channel: 'coupang', name: '대표 스토어', externalAccountId: null, vendorId: null, sellerId: null, isPrimary: true }];
  mocks.start.mockImplementation(async () => {
    wingOperations = [operation(RUN_ID, 'executing')];
    return { outcome: 'started', operationId: RUN_ID };
  });
  mocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
});

describe('BatchRankCheck (advertising.wing_rank, KID-362)', () => {
  it('starts one Wing rank operation for the primary Coupang account and shows its keyword progress', async () => {
    renderCheck();
    fireEvent.click(await screen.findByRole('button', { name: '전체 상품 순위 수집' }));

    expect(await screen.findByText('수집 중 · 1/2개 키워드')).toBeInTheDocument();
    expect(mocks.start.mock.calls).toEqual([['advertising.wing_rank', { channelAccountId: ACCOUNT_ID }, { capability: 'advertisingKeywordOperationKindsV1' }]]);
  });

  it('refuses to start without a Coupang account and names the reason', async () => {
    accounts = [];
    renderCheck();
    fireEvent.click(await screen.findByRole('button', { name: '전체 상품 순위 수집' }));

    expect(await screen.findByText('쿠팡 윙 계정을 먼저 연결해 주세요.')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('shows the last failure in the operator sentence and refreshes rank reads once a new operation succeeds', async () => {
    wingOperations = [operation(RUN_ID, 'failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'login' }), operation(PREVIOUS_ID, 'succeeded')];
    const { client, onCompleted } = renderCheck();
    expect(await screen.findByRole('alert')).toHaveTextContent('마지막 Wing 순위 수집 실패:');
    expect(onCompleted).not.toHaveBeenCalled();

    wingOperations = [operation('33333333-3333-4333-8333-333333333333', 'succeeded'), ...wingOperations];
    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.wingRankOperations() }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
