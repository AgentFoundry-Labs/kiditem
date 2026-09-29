import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_READINESS_LABELS } from '@kiditem/shared/source-readiness';
import { SellpiaSyncAction } from '@/app/(inventory)/_shared/SellpiaSyncAction';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import { ActionCheckCard, AdReportRow, StockSyncRow } from './ReadinessRows';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getNullable: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
// Wing 판매순위 테스트만 시작 호출을 바꿔 끼운다. 기본은 실제 구현(확장 경계 가짜를 거친다) — 셀피아 컨트롤이 그걸 쓴다.
const operationMocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  actual: null as null | typeof import('@/lib/operation-start'),
}));
vi.mock('@/lib/operation-start', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operation-start')>();
  operationMocks.actual = actual;
  return { ...actual, requestOperationStart: operationMocks.start, requestOperationCancel: operationMocks.cancel };
});
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionId: vi.fn(),
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

const SELLPIA_COLLECTION_STATUS_PATH = '/api/inventory/sellpia-collection-status';

function sellpiaCollectionStatus(
  status: 'not_collected' | 'complete' | 'running' | 'failed',
  lastCompletedAt: string | null,
  errorMessage: string | null = null,
) {
  return {
    status,
    sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: 'kiditem', confirmed: true },
    requestedGeneration: '7',
    verifiedGeneration: '7',
    lastCompletedAttemptId: lastCompletedAt ? ATTEMPT_ID : null,
    lastCompletedAt,
    lastAttemptId: null,
    activeSync: status === 'running'
      ? {
          attemptId: ATTEMPT_ID,
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
          trigger: 'manual_request',
          scope: 'inventory',
          errorCode: null,
          errorMessage,
        }
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  operationMocks.start.mockReset().mockImplementation((...args: Parameters<typeof import('@/lib/operation-start').requestOperationStart>) =>
    operationMocks.actual!.requestOperationStart(...args));
  operationMocks.cancel.mockReset().mockImplementation((...args: Parameters<typeof import('@/lib/operation-start').requestOperationCancel>) =>
    operationMocks.actual!.requestOperationCancel(...args));
  localStorage.clear();
  statuses = {};
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: EXTENSION_ID,
    version: '1',
  });
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true },
    }),
    setAuthToken: () => ({ success: true, environmentId: 'local' }),
    // A web-opened attempt shows as taken once the extension holds its session.
    getCollectionSession: (message) => extensionSessionReply(message),
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


describe('readiness Sellpia row', () => {
  // 셀피아 재고 = 실행 kind products.sellpia_inventory(KID-361 J1): 도는 실행·실패·중단은 실행 reader, 완료 시각은 Products 상태.
  const OPERATIONS_PATH = '/api/operations?kinds=products.sellpia_inventory&limit=20';
  const operation = (overrides: Record<string, unknown> = {}) => ({
    id: ATTEMPT_ID,
    kind: 'products.sellpia_inventory',
    status: 'executing',
    lockKeys: ['resource:sellpia:login'],
    plan: {},
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-06T01:00:00.000Z',
    finishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  });
  const collected = (lastCompletedAt: string | null) => ({
    ...sellpiaCollectionStatus(lastCompletedAt ? 'complete' : 'not_collected', lastCompletedAt),
    verifiedGeneration: lastCompletedAt ? '7' : '0',
  });

  beforeEach(() => {
    statuses[OPERATIONS_PATH] = { operations: [] };
    extensionReplies.ping = () => ({ success: true, capabilities: { operationRuntime: true, sellpiaOperationKindsV1: true } });
  });

  it('derives the Sellpia chip from the published completion and its KST date', async () => {
    statuses[SELLPIA_COLLECTION_STATUS_PATH] = collected('2026-09-05T16:30:00.000Z');
    const view = renderRow(<StockSyncRow />);
    expect(await screen.findByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();

    statuses[SELLPIA_COLLECTION_STATUS_PATH] = collected(null);
    await act(() => view.client.refetchQueries({ queryKey: queryKeys.inventory.collectionStatus() }));
    expect(await screen.findByText(SOURCE_READINESS_LABELS.missing)).toBeInTheDocument();
  });

  it('shows a running operation as running and a failed one through its operator message', async () => {
    statuses[SELLPIA_COLLECTION_STATUS_PATH] = collected('2026-09-05T16:30:00.000Z');
    statuses[OPERATIONS_PATH] = { operations: [operation()] };
    const view = renderRow(<StockSyncRow />);
    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '재고 동기화' })).not.toBeInTheDocument();
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();

    statuses[OPERATIONS_PATH] = {
      operations: [operation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.', finishedAt: '2026-09-06T01:01:00.000Z' })],
    };
    await act(() => view.client.refetchQueries({ queryKey: ['sellpia-operations', 'products.sellpia_inventory'] }));
    expect(await screen.findByText('셀피아 로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재고 동기화' })).toBeEnabled();
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
  });

  it('shows a stopped operation as stopped, not a failure, while the previous snapshot stays in use', async () => {
    statuses[SELLPIA_COLLECTION_STATUS_PATH] = collected('2026-09-05T16:30:00.000Z');
    statuses[OPERATIONS_PATH] = { operations: [operation({ status: 'cancelled', errorCode: 'USER_CANCELLED', finishedAt: '2026-09-06T01:01:00.000Z' })] };
    renderRow(<StockSyncRow />);

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재고 동기화' })).toBeEnabled();
    expect(screen.getByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();
  });

  it('starts Sellpia inventory once and shows it running on the stock screen control as well', async () => {
    statuses[SELLPIA_COLLECTION_STATUS_PATH] = collected(null);
    extensionReplies['operation.start'] = () => {
      statuses[OPERATIONS_PATH] = { operations: [operation()] };
      return { success: true, operationId: ATTEMPT_ID, reused: false };
    };
    renderRow(
      <>
        <StockSyncRow />
        <SellpiaSyncAction />
      </>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '재고 동기화' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2));
    expect(vi.mocked(sendToExtension).mock.calls.filter(([, message]) => (message as { action: string }).action === 'operation.start')).toHaveLength(1);
  });
});

describe('readiness Sellpia sales card', () => {
  // 셀피아 판매현황 = 실행 kind analytics.sellpia_sales(KID-361 J2).
  const SALES_OPERATIONS_PATH = '/api/operations?kinds=analytics.sellpia_sales&limit=20';
  const SALES_RANGE = { from: '2026-07-12', to: '2026-07-15' };
  const salesCheck = {
    key: 'wing_sales',
    label: 'Wing 매출',
    basis: {
      asOf: null,
      requiredAsOf: '2026-07-14',
      observedAt: null,
      sources: ['sellpia_orders'],
      measured: false,
      withheldCount: 0,
    },
    detail: '어제 매출 데이터 없음',
    lastSyncedAt: null,
    count: null,
    referenceDate: '2026-07-14',
    expectedDates: ['2026-07-12', '2026-07-13', '2026-07-14'],
    missingDates: ['2026-07-14', '2026-07-12'],
  } as unknown as ReadinessCheck;

  it('collects the missing dates through the shared Sellpia sales control, not the readiness handler', async () => {
    statuses[SALES_OPERATIONS_PATH] = { operations: [] };
    extensionReplies.ping = () => ({ success: true, capabilities: { operationRuntime: true, sellpiaOperationKindsV1: true } });
    extensionReplies['operation.start'] = () => {
      statuses[SALES_OPERATIONS_PATH] = {
        operations: [{
          id: ATTEMPT_ID,
          kind: 'analytics.sellpia_sales',
          status: 'executing',
          lockKeys: ['resource:sellpia:login'],
          plan: {},
          progress: null,
          result: null,
          window: { start: SALES_RANGE.from, end: SALES_RANGE.to },
          errorCode: null,
          errorMessage: null,
          startedAt: '2026-07-15T01:00:00.000Z',
          finishedAt: null,
          expiresAt: '2099-01-01T00:00:00.000Z',
          attempts: 1,
          maxAttempts: 1,
          scheduledFor: null,
        }],
      };
      return { success: true, operationId: ATTEMPT_ID, reused: false };
    };
    const onCollect = vi.fn();
    renderRow(<ActionCheckCard check={salesCheck} onCollect={onCollect} pending={false} />);
    const start = await screen.findByRole('button', { name: '매출 받기' });
    await waitFor(() => expect(start).toBeEnabled());

    fireEvent.click(start);

    expect(await screen.findByText('수집 중 · 2026-07-12 ~ 2026-07-15')).toBeInTheDocument();
    expect(vi.mocked(sendToExtension).mock.calls.filter(([, message]) => (message as { action: string }).action === 'operation.start')).toEqual([
      [EXTENSION_ID, { action: 'operation.start', kind: 'analytics.sellpia_sales', scope: { startDate: SALES_RANGE.from, endDate: SALES_RANGE.to } }, 60_000],
    ]);
    expect(onCollect).not.toHaveBeenCalled();
  });
});

describe('readiness Wing rank card', () => {
  const OPERATIONS_PATH = '/api/operations?kinds=advertising.wing_rank&limit=20';
  const COUPANG_ACCOUNT = '55555555-5555-4555-8555-555555555555';
  const runningRank = {
    id: NEXT_ATTEMPT_ID,
    kind: 'advertising.wing_rank',
    status: 'executing',
    lockKeys: [`account:${COUPANG_ACCOUNT}`, 'resource:keyword:연필'],
    plan: { channelAccountId: COUPANG_ACCOUNT, maxPages: 5, keywords: [{ keyword: '연필', targets: [] }], selection: {} },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-05T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  };
  const rankCheck = {
    key: 'wing_rank',
    label: 'Wing 판매순위',
    basis: {
      asOf: null,
      requiredAsOf: '2026-09-05',
      observedAt: null,
      sources: ['wing_rank'],
      measured: false,
      withheldCount: 0,
    },
    detail: 'Wing 판매순위 수집 이력 없음',
    lastSyncedAt: null,
    count: null,
    referenceDate: '2026-09-05',
    expectedDates: [],
    missingDates: [],
  } as unknown as ReadinessCheck;

  function serveRank(operations: () => unknown[]) {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === OPERATIONS_PATH) return { operations: operations() };
      throw new Error(`unexpected GET ${path}`);
    });
    vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
      if (path === '/api/channels/accounts') {
        return [{ id: COUPANG_ACCOUNT, channel: 'coupang', name: '대표', externalAccountId: null, vendorId: null, sellerId: null, isPrimary: true }];
      }
      throw new Error(`unexpected GET ${path}`);
    });
  }

  it('starts advertising.wing_rank with the primary Coupang account through the shared control, not the readiness handler', async () => {
    let operations: unknown[] = [];
    serveRank(() => operations);
    operationMocks.start.mockImplementation(async () => {
      operations = [runningRank];
      return { outcome: 'started', operationId: NEXT_ATTEMPT_ID };
    });
    const onCollect = vi.fn();
    renderRow(<ActionCheckCard check={rankCheck} onCollect={onCollect} pending={false} />);
    const start = await screen.findByRole('button', { name: '순위 받기' });
    await waitFor(() => expect(start).toBeEnabled());

    fireEvent.click(start);

    expect(await screen.findByText('수집 중 · 0/1개 키워드')).toBeInTheDocument();
    expect(operationMocks.start.mock.calls).toEqual([
      ['advertising.wing_rank', { channelAccountId: COUPANG_ACCOUNT }, { capability: 'advertisingKeywordOperationKindsV1' }],
    ]);
    expect(onCollect).not.toHaveBeenCalled();
  });

  it('links the running operation to rank tracking', async () => {
    serveRank(() => [runningRank]);
    renderRow(<ActionCheckCard check={rankCheck} onCollect={vi.fn()} pending={false} />);

    const link = await screen.findByRole('link', { name: '진행 보기' });
    expect(link).toHaveAttribute('href', '/rank-tracking');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('readiness ad report row', () => {
  it('offers the ad report collection, the one ad collector, instead of the retired sweep and keyword rows', async () => {
    statuses['/api/operations?kinds=advertising.ad_report&limit=5'] = { operations: [] };
    renderRow(<AdReportRow />);

    expect(screen.getByRole('heading', { name: '광고 보고서 수집' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '광고 보고서 수집' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '광고 동기화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '키워드 수집' })).not.toBeInTheDocument();
  });
});
