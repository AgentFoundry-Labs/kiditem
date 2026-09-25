import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { ActionCheckCard } from './ReadinessRows';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import type { CatalogReadinessState } from './useReadinessCollection';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getNullable: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
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
const ACCOUNT_ID = '71111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '72222222-2222-4222-8222-222222222222';
const LIST_ID = '7a111111-1111-4111-8111-111111111111';
const DETAILS_ID = '7a222222-2222-4222-8222-222222222222';
const OPERATIONS_PATH =
  '/api/operations?kinds=channels.wing_catalog_list,channels.wing_catalog_details,channels.wing_catalog_excel&limit=5';

const productsCheck = {
  key: 'coupang_products',
  label: '쿠팡 상품',
  basis: {
    asOf: null,
    requiredAsOf: null,
    observedAt: null,
    sources: ['wing_catalog'],
    measured: false,
    withheldCount: 0,
  },
  detail: '쿠팡 상품 데이터 없음',
  lastSyncedAt: null,
  count: null,
  referenceDate: null,
  expectedDates: [],
  missingDates: [],
} as unknown as ReadinessCheck;

/** 실행 계약 reader가 돌려주는 Wing 카탈로그 실행 하나. */
function operation(overrides: Partial<OperationView> & Pick<OperationView, 'id' | 'kind'>): OperationView {
  return {
    status: 'executing',
    lockKeys: [`account:${ACCOUNT_ID}`],
    plan: { channelAccountId: ACCOUNT_ID, startedBy: null },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

function catalogState(overrides: Partial<CatalogReadinessState> = {}): CatalogReadinessState {
  return {
    accounts: [{ id: ACCOUNT_ID, channel: 'coupang', name: '키드아이템 스토어', isPrimary: true }],
    accountsLoading: false,
    accountsError: null,
    accountId: ACCOUNT_ID,
    accountLocked: false,
    setAccountId: vi.fn(),
    linkError: null,
    ...overrides,
  };
}

let serverOperations: OperationView[];
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderCard(catalog = catalogState(), onCollect = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ActionCheckCard check={productsCheck} onCollect={onCollect} pending={false} catalog={catalog} />
    </QueryClientProvider>,
  );
  return { onCollect };
}

function sentExtensionMessages(action: string) {
  return vi
    .mocked(sendToExtension)
    .mock.calls.map(([, message]) => message as Record<string, unknown>)
    .filter((message) => message.action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  serverOperations = [];
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true, operationRuntime: true },
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
    if (path === OPERATIONS_PATH) return { operations: serverOperations };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('readiness 상품 받기 control (Wing 카탈로그 실행 kind, KID-354)', () => {
  it('starts the selected account sync as the list operation through the extension and shows it running for that account', async () => {
    extensionReplies['operation.start'] = () => {
      serverOperations = [operation({ id: LIST_ID, kind: 'channels.wing_catalog_list' })];
      return { success: true, operationId: LIST_ID, reused: false };
    };
    const { onCollect } = renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '상품 받기' }));

    expect(await screen.findByText('수집 중 · 키드아이템 스토어')).toBeInTheDocument();
    expect(sentExtensionMessages('operation.start')).toEqual([{
      action: 'operation.start',
      kind: 'channels.wing_catalog_list',
      scope: { channelAccountId: ACCOUNT_ID },
    }]);
    expect(screen.getByText('상품 목록 받는 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    // 실행은 확장이 연다 — 화면은 begin하지 않는다.
    expect(vi.mocked(apiClient.post).mock.calls.map(([path]) => path)).toEqual(['/api/auth/extension-handoff']);
    expect(onCollect).not.toHaveBeenCalled();
  });

  it('shows the server refusal when the account already runs another catalog operation and keeps 상품 받기 available', async () => {
    const message = '같은 실행이 이미 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.';
    extensionReplies['operation.start'] = () => ({ success: false, errorCode: 'OPERATION_IN_PROGRESS', error: message });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '상품 받기' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 받기' })).toBeEnabled();
  });

  it('stops the running operation: the extension run first, then the operation cancel on the server', async () => {
    serverOperations = [operation({ id: DETAILS_ID, kind: 'channels.wing_catalog_details', progress: { detailsDone: 3, detailTargets: 10 } })];
    extensionReplies['operation.cancel'] = () => ({ success: false, errorCode: 'RUNTIME_API_UNREACHABLE', error: 'offline' });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === `/api/operations/${DETAILS_ID}/cancel`) {
        serverOperations = [operation({
          id: DETAILS_ID,
          kind: 'channels.wing_catalog_details',
          status: 'cancelled',
          errorCode: 'OPERATION_CANCELLED',
          lockKeys: [],
          finishedAt: '2026-09-25T00:10:00.000Z',
        })];
        return { operation: serverOperations[0] };
      }
      throw new Error(`unexpected POST ${path}`);
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(sentExtensionMessages('operation.cancel')).toEqual([{ action: 'operation.cancel', operationId: DETAILS_ID }]);
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(`/api/operations/${DETAILS_ID}/cancel`);
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeEnabled();
  });

  it('shows the details progress while the chained details operation runs', async () => {
    serverOperations = [
      operation({ id: DETAILS_ID, kind: 'channels.wing_catalog_details', progress: { detailsDone: 3, detailTargets: 10, absentChecked: 0, absentTotal: 2 } }),
      operation({ id: LIST_ID, kind: 'channels.wing_catalog_list', status: 'succeeded', lockKeys: [], finishedAt: '2026-09-25T00:01:00.000Z' }),
    ];
    const view = renderCard();

    expect(await screen.findByText('상세 3 / 10 · 삭제 확인 0 / 2')).toBeInTheDocument();
    expect(screen.getByText('바뀐 상품 상세 받는 중')).toBeInTheDocument();
    expect(view.onCollect).not.toHaveBeenCalled();
  });

  it('reports what the finished details operation applied, not a whole-catalog completion (KID-351)', async () => {
    serverOperations = [operation({
      id: DETAILS_ID,
      kind: 'channels.wing_catalog_details',
      status: 'succeeded',
      lockKeys: [],
      finishedAt: '2026-09-25T00:10:00.000Z',
      result: { detailTargets: 1, detailApplied: 1, detailUnchanged: 0, deletedProducts: 0, unconfirmedAbsentProductIds: [] },
    })];
    renderCard();

    expect(await screen.findByText('상품 1개 상세 반영')).toBeInTheDocument();
    expect(screen.queryByText('전체 상품 반영 완료')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeEnabled();
  });

  it('says nothing changed when the list operation planned no details', async () => {
    serverOperations = [operation({
      id: LIST_ID,
      kind: 'channels.wing_catalog_list',
      status: 'succeeded',
      lockKeys: [],
      finishedAt: '2026-09-25T00:10:00.000Z',
      result: { listedProductCount: 1260, detailTargetProductIds: [], absentProductIds: [], next: null },
    })];
    renderCard();

    expect(await screen.findByText('바뀐 상품 없음 · 상품 1,260개 최신')).toBeInTheDocument();
  });

  it('ignores another account operation', async () => {
    serverOperations = [operation({
      id: LIST_ID,
      kind: 'channels.wing_catalog_list',
      plan: { channelAccountId: OTHER_ACCOUNT_ID, startedBy: null },
      lockKeys: [`account:${OTHER_ACCOUNT_ID}`],
    })];
    renderCard();

    expect(await screen.findByRole('button', { name: '상품 받기' })).toBeEnabled();
    expect(screen.queryByText(/수집 중/)).not.toBeInTheDocument();
  });

  it('asks for a Coupang account before 상품 받기 can start', async () => {
    renderCard(catalogState({ accountId: null }));

    expect(await screen.findByRole('button', { name: '상품 받기' })).toBeDisabled();
    expect(screen.getByText('쿠팡 계정을 선택해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).not.toHaveBeenCalled());
  });
});
