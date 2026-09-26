import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useRocketPoCollection } from '@/hooks/use-rocket-po-source';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { rocketPoSourceView } from '@/lib/rocket-po-collection';
import { OperationListResponseSchema } from '@kiditem/shared/operation';

// 로켓 PO 수집 = 실행 kind orders.coupang_rocket_po(KID-359). 확장 경계(`sendToExtension`)와 HTTP 경계만 가짜로 둔다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(async () => []),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '55555555-5555-4555-8555-555555555555';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ID = '33333333-3333-4333-8333-333333333333';
const RANGE = { from: '2026-07-01', to: '2026-07-31' };

function operation(channelAccountId: string, status: string, id = OPERATION_ID, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'orders.coupang_rocket_po',
    status,
    lockKeys: status === 'executing' ? [`account:${channelAccountId}`] : [],
    plan: { channelAccountId, ...RANGE, status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true, vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null } },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-07-31T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-07-31T01:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

let operations: Array<Record<string, unknown>>;
let startReply: unknown;

function RocketControl({ accountId, label }: { accountId: string; label: string }) {
  const control = useRocketPoCollection(accountId);
  return (
    <section aria-label={label}>
      <CollectionStartControl control={control} startLabel="로켓 PO 수집" onStart={() => control.start(RANGE)} onStop={control.stop} />
    </section>
  );
}

function renderControls(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}
const extensionMessages = (action: string) =>
  vi.mocked(sendToExtension).mock.calls.filter(([, message]) => (message as { action: string }).action === action).map(([, message]) => message);

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  startReply = { success: true, operationId: OPERATION_ID, reused: false };
  vi.mocked(detectExtensionId).mockResolvedValue('rocket-extension');
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const action = (message as { action: string }).action;
    if (action === 'ping') return { success: true, version: '1', capabilities: { operationRuntime: true } };
    if (action === 'operation.start') {
      operations = [operation(ACCOUNT_A, 'executing')];
      return startReply;
    }
    if (action === 'operation.cancel') return { success: true };
    return undefined;
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    // 로켓 계정의 저장 자격(KID-377): 몰 목록의 coupang-direct 행과 그 비밀번호.
    if (path === '/api/orders/collection/malls') return [{ key: 'coupang-direct', name: '쿠팡직배송', loginId: 'fake-rocket-id', hasPassword: true }];
    if (path === '/api/orders/collection/malls/coupang-direct/password') return { key: 'coupang-direct', password: 'fake-rocket-password' };
    if (!path.startsWith('/api/operations?kinds=orders.coupang_rocket_po')) throw new Error(`unexpected GET ${path}`);
    return { operations };
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (!path.endsWith('/cancel')) throw new Error(`unexpected POST ${path}`);
    operations = operations.map((item) => ({ ...item, status: 'cancelled', errorCode: 'USER_CANCELLED', lockKeys: [] }));
    return { operation: operations[0] };
  });
});

describe('로켓 PO 수집 컨트롤(실행 계약)', () => {
  it('확장에 계정·기간 scope로 실행을 시작시키고, 같은 계정의 모든 컨트롤이 진행 중을 본다', async () => {
    renderControls(<>
      <RocketControl accountId={ACCOUNT_A} label="확인 패널" />
      <RocketControl accountId={ACCOUNT_A} label="대시보드" />
      <RocketControl accountId={ACCOUNT_B} label="다른 계정" />
    </>);
    const panel = screen.getByRole('region', { name: '확인 패널' });
    fireEvent.click(await within(panel).findByRole('button', { name: '로켓 PO 수집' }));
    expect(await within(panel).findByText('수집 중 · 2026-07-01 ~ 2026-07-31')).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: '대시보드' })).findByText('수집 중 · 2026-07-01 ~ 2026-07-31')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '다른 계정' })).getByRole('button', { name: '로켓 PO 수집' })).toBeInTheDocument();
    expect(extensionMessages('operation.start')).toEqual([{
      action: 'operation.start',
      kind: 'orders.coupang_rocket_po',
      scope: { channelAccountId: ACCOUNT_A, ...RANGE, status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true },
      // 서플라이어 허브가 로그인 화면이면 확장이 이 자격으로 로그인한다(KID-377).
      credentials: { loginId: 'fake-rocket-id', password: 'fake-rocket-password' },
    }]);
  });

  it('중단은 이 브라우저의 실행을 멈추고 서버 실행을 취소한다', async () => {
    operations = [operation(ACCOUNT_A, 'executing')];
    renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);
    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));
    await waitFor(() => expect(extensionMessages('operation.cancel')).toEqual([{ action: 'operation.cancel', operationId: OPERATION_ID }]));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`));
  });

  it('같은 계정의 다른 실행이 돌면 서버 문장으로 거절을 보인다', async () => {
    startReply = { success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 실행이 이미 진행 중입니다.' };
    renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);
    fireEvent.click(await screen.findByRole('button', { name: '로켓 PO 수집' }));
    expect(await screen.findByText(/같은 실행이 이미 진행 중입니다/)).toBeInTheDocument();
  });

  it('새로 성공한 실행이 보이면 저장 발주 목록·대시보드 수집 시각을 다시 읽는다', async () => {
    operations = [operation(ACCOUNT_A, 'succeeded')];
    const { client } = renderControls(<RocketControl accountId={ACCOUNT_A} label="확인 패널" />);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await screen.findByRole('button', { name: '로켓 PO 수집' });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.orders.rocketSavedPoLists() });
    operations = [operation(ACCOUNT_A, 'succeeded', NEXT_ID), operation(ACCOUNT_A, 'succeeded')];
    await client.refetchQueries({ queryKey: queryKeys.orders.rocketPoOperations() });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.orders.rocketSavedPoLists() }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.collections() });
  });
});

describe('readRocketPoOperations — 성공한 실행은 넓게 읽는다(리뷰 M1)', () => {
  it('최근 창을 실패·취소가 채워도 계정의 마지막 성공을 찾는다', async () => {
    const { readRocketPoOperations } = await import('@/lib/rocket-po-collection');
    const failed = Array.from({ length: 5 }, (_, index) => operation(ACCOUNT_A, 'failed', `4444444${index}-4444-4444-8444-444444444444`, { startedAt: `2026-08-0${index + 1}T00:00:00.000Z` }));
    const success = operation(ACCOUNT_A, 'succeeded', NEXT_ID);
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => (
      path.includes('status=succeeded') ? { operations: [success] } : { operations: failed }
    ));
    const merged = await readRocketPoOperations();
    expect(vi.mocked(apiClient.get).mock.calls.map(([path]) => path)).toEqual([
      '/api/operations?kinds=orders.coupang_rocket_po&limit=5',
      '/api/operations?kinds=orders.coupang_rocket_po&status=succeeded&limit=20',
    ]);
    expect(merged.operations[0]!.id).toBe(failed[4]!.id);
    expect(rocketPoSourceView(merged, ACCOUNT_A, new Date('2026-08-01T03:00:00.000Z')).latestComplete?.attemptId).toBe(NEXT_ID);
  });
});

describe('rocketPoSourceView — 계정 하나의 원천 보기', () => {
  const list = (items: unknown[]) => OperationListResponseSchema.parse({ operations: items });
  const now = new Date('2026-08-01T03:00:00.000Z');
  it('어제(KST)까지 덮는 성공 실행이면 준비됨, 도는 실행이 있으면 아니다; 다른 계정의 실행은 보지 않는다', () => {
    const complete = operation(ACCOUNT_A, 'succeeded');
    expect(rocketPoSourceView(list([complete]), ACCOUNT_A, now)).toEqual({
      ready: true,
      latestAttempt: { attemptId: OPERATION_ID, state: 'COMPLETE', errorCode: null, errorMessage: null },
      latestComplete: { attemptId: OPERATION_ID, actualCutoffAt: '2026-07-31T01:00:00.000Z' },
      latestCompleteCoverage: RANGE,
    });
    expect(rocketPoSourceView(list([operation(ACCOUNT_A, 'executing', NEXT_ID), complete]), ACCOUNT_A, now).ready).toBe(false);
    expect(rocketPoSourceView(list([complete]), ACCOUNT_A, new Date('2026-08-03T03:00:00.000Z')).ready).toBe(false);
    expect(rocketPoSourceView(list([complete]), ACCOUNT_B, now)).toEqual({ ready: false, latestAttempt: null, latestComplete: null, latestCompleteCoverage: null });
  });

  it('취소는 USER_CANCELLED 실패로(“수집 중단됨”), 실패는 코드·문장을 그대로', () => {
    expect(rocketPoSourceView(list([operation(ACCOUNT_A, 'cancelled', NEXT_ID, { errorCode: null })]), ACCOUNT_A, now).latestAttempt)
      .toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });
    expect(rocketPoSourceView(list([operation(ACCOUNT_A, 'failed', NEXT_ID, { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '로그인 필요' })]), ACCOUNT_A, now).latestAttempt)
      .toMatchObject({ state: 'FAILED', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '로그인 필요' });
  });
});
