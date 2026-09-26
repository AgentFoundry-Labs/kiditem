import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectBrowserCollectionExtensionIds, detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaOperationsQueryKey } from '@/lib/sellpia-operations';
import { SELLPIA_OPERATION_PING, sellpiaInventoryFreshness, sellpiaOperation } from '@/test/fixtures/sellpia-operations';
import { SellpiaSyncAction } from './SellpiaSyncAction';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

// 셀피아 재고 = 실행 kind products.sellpia_inventory(KID-361 J1). 화면은 확장에 operation.start만 보내고 실행 reader와
// Products 재고 상태 읽기로 도는 실행·발행을 본다. 가짜는 API·확장 경계뿐이다.
const FRESHNESS_PATH = '/api/inventory/sellpia-collection-status';
const OPERATIONS_PATH = '/api/operations?kinds=products.sellpia_inventory&limit=20';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

let operations: OperationView[];
let freshness: ReturnType<typeof sellpiaInventoryFreshness>;
let startReply: Record<string, unknown>;

function renderActions(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

function extensionMessages(action: string) {
  return vi.mocked(sendToExtension).mock.calls.filter(([, message]) => (message as { action: string }).action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  freshness = sellpiaInventoryFreshness();
  startReply = { success: true, operationId: OPERATION_ID, reused: false };
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue(['ext']);
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const action = (message as { action: string }).action;
    if (action === 'ping') return SELLPIA_OPERATION_PING;
    if (action === 'operation.start') {
      if (startReply.success) operations = [sellpiaOperation()];
      return startReply;
    }
    if (action === 'operation.cancel') {
      operations = [sellpiaOperation({ status: 'cancelled', errorCode: 'USER_CANCELLED', finishedAt: '2026-09-26T01:01:00.000Z' })];
      return { success: true };
    }
    throw new Error(`unexpected ${action}`);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === FRESHNESS_PATH) return freshness;
    if (path === OPERATIONS_PATH) return { operations };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === `/api/operations/${OPERATION_ID}/cancel`) return { operation: operations[0] };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('SellpiaSyncAction', () => {
  it('확장에 재고 실행 하나를 시작시키고(scope 없음) 모든 사본이 도는 실행과 중단을 보여 준다', async () => {
    renderActions(
      <>
        <SellpiaSyncAction showStatus />
        <SellpiaSyncAction compact />
      </>,
    );
    const [start] = await screen.findAllByRole('button', { name: '셀피아 재고 동기화' });
    fireEvent.click(start);

    await waitFor(() => expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2));
    expect(extensionMessages('operation.start')).toEqual([
      ['ext', { action: 'operation.start', kind: 'products.sellpia_inventory', scope: {} }, 60_000],
    ]);
    expect(screen.getAllByText('수집 중').length).toBeGreaterThan(0);
  });

  it('다른 셀피아 실행이 로그인을 쥐고 있으면 서버 거절 문장을 보이고 새 실행을 만들지 않는다', async () => {
    startReply = { success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 셀피아 로그인을 쓰는 다른 실행이 진행 중입니다.' };
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 재고 동기화' }));

    expect(await screen.findByText('같은 셀피아 로그인을 쓰는 다른 실행이 진행 중입니다.')).toBeInTheDocument();
    expect(operations).toEqual([]);
  });

  it('셀피아 kind를 모르는 옛 확장에는 시작을 보내지 않고 업데이트를 안내한다', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      ((message as { action: string }).action === 'ping' ? { success: true, capabilities: { operationRuntime: true } } : null));
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 재고 동기화' }));

    expect(await screen.findByText('확장 프로그램을 업데이트해 주세요.')).toBeInTheDocument();
    expect(extensionMessages('operation.start')).toEqual([]);
  });

  it('다른 브라우저가 시작한 실행을 실행 id로 멈춘다(확장 cancel 뒤 서버 cancel)', async () => {
    operations = [sellpiaOperation()];
    renderActions(<SellpiaSyncAction />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '셀피아 재고 동기화' })).toBeEnabled();
    expect(extensionMessages('operation.cancel')).toEqual([['ext', { action: 'operation.cancel', operationId: OPERATION_ID }]]);
  });

  it('마지막 실행이 실패면 실패, 멈췄으면 수집 중단됨(실패 아님)을 보인다', async () => {
    operations = [sellpiaOperation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.', finishedAt: '2026-09-26T01:01:00.000Z' })];
    const failed = renderActions(<SellpiaSyncAction showStatus />);
    expect(await screen.findByText('실패')).toBeInTheDocument();
    failed.unmount();

    operations = [sellpiaOperation({ status: 'cancelled', errorCode: 'USER_CANCELLED', finishedAt: '2026-09-26T01:01:00.000Z' })];
    renderActions(<SellpiaSyncAction showStatus />);
    expect(await screen.findByText('수집 중단됨')).toBeInTheDocument();
    expect(screen.queryByText('실패')).not.toBeInTheDocument();
  });

  it('새 성공 실행이 보일 때만 재고 읽기를 새로 한다', async () => {
    operations = [sellpiaOperation({ id: '22222222-2222-4222-8222-222222222222', status: 'succeeded', finishedAt: '2026-09-26T00:00:00.000Z' })];
    const { client } = renderActions(<SellpiaSyncAction />);
    client.setQueryData(queryKeys.inventory.snapshots(), { rows: [] });
    expect(await screen.findByRole('button', { name: '셀피아 재고 동기화' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: sellpiaOperationsQueryKey('products.sellpia_inventory') }));
    expect(client.getQueryState(queryKeys.inventory.snapshots())?.isInvalidated).toBe(false);

    operations = [sellpiaOperation({ status: 'succeeded', finishedAt: '2026-09-26T01:02:00.000Z' }), ...operations];
    await act(() => client.refetchQueries({ queryKey: sellpiaOperationsQueryKey('products.sellpia_inventory') }));

    await waitFor(() => expect(client.getQueryState(queryKeys.inventory.snapshots())?.isInvalidated).toBe(true));
  });

  it('계정 연결이 확인되지 않았으면 확인 버튼으로 Products 연결을 확인한다', async () => {
    freshness = sellpiaInventoryFreshness({
      status: 'not_collected',
      verifiedGeneration: '0',
      lastCompletedAt: null,
      lastCompletedAttemptId: null,
      sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: null, confirmed: false },
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `${FRESHNESS_PATH}/source-binding`) throw new Error(`unexpected POST ${path}`);
      freshness = sellpiaInventoryFreshness({ status: 'not_collected', verifiedGeneration: '0', lastCompletedAt: null, lastCompletedAttemptId: null });
      return freshness;
    });
    renderActions(<SellpiaSyncAction showStatus />);

    expect(await screen.findByText(/https:\/\/kiditem\.sellpia\.com · kiditem/)).toBeInTheDocument();
    expect(screen.getByText('미수집')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '셀피아 계정 연결 확인' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '셀피아 계정 연결 확인' })).not.toBeInTheDocument());
    expect(apiClient.post).toHaveBeenCalledWith(`${FRESHNESS_PATH}/source-binding`, {
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
  });
});
