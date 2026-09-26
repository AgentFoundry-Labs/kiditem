import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { mallAutoLoginBlock, resetMallLoginBlocksForTest } from '@/lib/mall-login-block';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import { detectOrderCollectionSessionExtensionStatus } from './order-collection-extension';
import { saveIcecreamDeliveryIndex } from './icecream-delivery-index';
import { addSeenOrderKeys } from './order-detect';
import {
  collectMallOrderOperation,
  collectsViaMallOrderOperation,
  mallOrderOperationSource,
} from './mall-order-operation-source';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), fetchRaw: vi.fn() } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));
vi.mock('./order-collection-extension', () => ({
  detectOrderCollectionSessionExtensionStatus: vi.fn(),
  orderCollectionExtensionUnavailableMessage: () => '확장 프로그램을 연결해 주세요.',
}));
vi.mock('./order-collection-page-model', async (original) => ({
  ...(await original<typeof import('./order-collection-page-model')>()),
  todayYmd: () => '2026-09-26',
}));
vi.mock('./icecream-delivery-index', () => ({ saveIcecreamDeliveryIndex: vi.fn() }));
vi.mock('./order-detect', () => ({ addSeenOrderKeys: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const ACCOUNT_ID = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const EARLIER = '22222222-2222-4222-8222-222222222222';

const account: OrderCollectionMallAccount = {
  key: 'kidkids',
  name: '키드키즈',
  configured: true,
  enabled: true,
  loginId: 'kid',
  supplierLoginId: null,
  hasPassword: true,
  siteUrl: null,
  memo: null,
  passwordUpdatedAt: null,
  sortOrder: null,
  channelAccountId: ACCOUNT_ID,
  updatedAt: null,
} as OrderCollectionMallAccount;

function operation(id: string, status: OperationView['status'], patch: Partial<OperationView> = {}): OperationView {
  return {
    id,
    kind: 'orders.mall_orders',
    status,
    lockKeys: [],
    plan: { mallKey: 'kidkids', channelAccountId: ACCOUNT_ID, collectionDate: '2026-09-26' },
    progress: null,
    result: status === 'succeeded' ? { rowCount: 3, mallKey: 'kidkids', captured: 3 } : null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

const CREDENTIALS = { loginId: 'fake-id', password: 'fake-password' };
/** 엑셀·blob 몰 — 몰마다 확장 사이트가 다 되면 더한다(KID-380). */
const EXCEL_MALLS = ['kkomangse', 'teacher-mall', 'boribori'];

function source(overrides: Partial<Parameters<typeof mallOrderOperationSource>[0]> = {}) {
  const handOff = vi.fn().mockResolvedValue(undefined);
  const loadLoginCredentials = vi.fn().mockResolvedValue(CREDENTIALS);
  const adapter = mallOrderOperationSource({ organizationId: 'org-1', account, handOff, loadLoginCredentials, ...overrides });
  return { adapter, handOff, loadLoginCredentials };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetMallLoginBlocksForTest();
  vi.mocked(detectOrderCollectionSessionExtensionStatus).mockResolvedValue({ status: 'ready', extensionId: 'ext-1' } as never);
});

describe('mall order operation source (orders.mall_orders, KID-359 H3)', () => {
  it('옮긴 몰(1차 4곳 + 엑셀·blob 몰, KID-380)만 실행 kind로 수집한다', () => {
    expect(['icecream-mall', 'kidkids', 'art09', 'domeggook', ...EXCEL_MALLS].every(collectsViaMallOrderOperation)).toBe(true);
    expect(collectsViaMallOrderOperation('kidsnote')).toBe(false);
  });

  it.each(EXCEL_MALLS)('%s: 옛 attempt 없이 그 계정의 operation.start로 시작해 절차에 넘긴다(KID-380)', async (mallKey) => {
    vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
    const { adapter, handOff } = source({ account: { ...account, key: mallKey } });
    await expect(adapter.start!({}, { status: undefined })).resolves.toEqual({ outcome: 'started', attemptId: OPERATION_ID });
    expect(requestOperationStart).toHaveBeenCalledWith('orders.mall_orders', {
      channelAccountId: ACCOUNT_ID,
      mallKey,
      collectionDate: '2026-09-26',
      collectionMode: 'browser',
      selectionMode: 'manual',
    }, { capability: 'orderCaptureOperationKindsV1', credentials: CREDENTIALS });
    expect(handOff).toHaveBeenCalledWith(expect.objectContaining({ operationId: OPERATION_ID }));
  });

  it('시작: 저장 자격(차단·간격 규칙을 지난 것)을 실어 그 계정·오늘·선택 방식으로 실행을 연 뒤 절차에 넘긴다(KID-377 — 확장이 실행 안에서 로그인)', async () => {
    vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
    const { adapter, handOff, loadLoginCredentials } = source();
    const outcome = await adapter.start!({ selectionMode: 'automatic', seenRowKeys: ['A'] }, { status: undefined });
    expect(outcome).toEqual({ outcome: 'started', attemptId: OPERATION_ID });
    expect(loadLoginCredentials).toHaveBeenCalledWith(account, { automatic: true });
    expect(requestOperationStart).toHaveBeenCalledWith('orders.mall_orders', {
      channelAccountId: ACCOUNT_ID,
      mallKey: 'kidkids',
      collectionDate: '2026-09-26',
      collectionMode: 'browser',
      selectionMode: 'automatic',
      seenRowKeys: ['A'],
    }, { capability: 'orderCaptureOperationKindsV1', credentials: CREDENTIALS });
    expect(handOff).toHaveBeenCalledWith({ extensionId: 'ext-1', operationId: OPERATION_ID, input: { selectionMode: 'automatic', seenRowKeys: ['A'] }, collectionDate: '2026-09-26' });
  });

  it('시작: 보낼 자격이 없으면(막힌 몰·한 시간 간격·저장 안 됨) 자격 없이 연다 — 세션이 살아 있으면 그대로 수집된다', async () => {
    vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
    const loadLoginCredentials = vi.fn().mockResolvedValue(undefined);
    const { adapter } = source({ loadLoginCredentials });
    await adapter.start!({}, { status: undefined });
    expect(loadLoginCredentials).toHaveBeenCalledWith(account, { automatic: false });
    expect(vi.mocked(requestOperationStart).mock.calls[0]![2]).toEqual({ capability: 'orderCaptureOperationKindsV1' });
  });

  it('계정 행이 없는 몰은 아무것도 부르지 않고 설정 안내, 같은 계정이 이미 돌면 거절 문장이나 그 실행', async () => {
    const unconfigured = source({ account: { ...account, channelAccountId: null } });
    await expect(unconfigured.adapter.start!({}, { status: undefined })).resolves.toMatchObject({ outcome: 'refused' });
    expect(unconfigured.loadLoginCredentials).not.toHaveBeenCalled();

    vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'refused', message: '같은 실행이 이미 진행 중입니다.' });
    const refused = source();
    await expect(refused.adapter.start!({}, { status: undefined })).resolves.toEqual({ outcome: 'refused', message: '같은 실행이 이미 진행 중입니다.' });
    expect(refused.handOff).not.toHaveBeenCalled();

    vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'running', operationId: EARLIER });
    await expect(source().adapter.start!({}, { status: undefined })).resolves.toEqual({ outcome: 'running', attemptId: EARLIER });
  });

  it('상태: 이 몰 실행만 보고 도는 것·마지막 성공을 읽고, 중단은 이 브라우저 절차 → 확장 → 서버', async () => {
    const abortLocalRun = vi.fn();
    const { adapter } = source({ abortLocalRun });
    const status = {
      operations: [
        operation(OPERATION_ID, 'executing'),
        operation('33333333-3333-4333-8333-333333333333', 'succeeded', { plan: { mallKey: 'art09' } }),
        operation(EARLIER, 'succeeded'),
      ],
    };
    expect(adapter.readRunning(status)).toEqual({ attemptId: OPERATION_ID, scopeLabel: '키드키즈' });
    expect(adapter.readCompleteId(status)).toBe(EARLIER);
    await adapter.cancelInExtension!(OPERATION_ID, { status });
    expect(abortLocalRun).toHaveBeenCalledWith(OPERATION_ID);
    expect(requestOperationCancel).toHaveBeenCalledWith(OPERATION_ID);
    await adapter.cancelOnServer!(OPERATION_ID, { status });
    expect(apiClient.post).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`);
  });
});

describe('collectMallOrderOperation — 실행이 끝나면 실행 id로 변환해 생성 파일을 남긴다', () => {
  const sleep = async () => undefined;

  it('성공한 실행을 실행 id로 다시 변환하고(본문 operationId), 수집 행 수를 생성 파일에 적는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'succeeded') });
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response('xls', {
      status: 201,
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''%ED%82%A4%EB%93%9C%ED%82%A4%EC%A6%88.xls",
        'X-Order-Collection-Source-Rows': '3',
        'X-Order-Collection-Product-Rows': '4',
        'X-Order-Collection-Output-Rows': '7',
        'X-Order-Collection-Skipped-Rows': '0',
      },
    }));
    const addGeneratedFile = vi.fn();
    const collected = await collectMallOrderOperation({ account, operationId: OPERATION_ID, collectionDate: '2026-09-26', addGeneratedFile, sleep });
    expect(collected).toEqual({ rowCount: 3, masked: false, date: '2026-09-26' });
    expect(apiClient.fetchRaw).toHaveBeenCalledWith(`/api/orders/collection/attempts/${OPERATION_ID}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: OPERATION_ID }),
    });
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      mallKey: 'kidkids',
      mallName: '키드키즈',
      collectionMode: 'browser',
      collectionDate: '2026-09-26',
      collectedRows: 3,
      outputRows: 7,
      fileName: '키드키즈.xls',
    }));
  });

  it('아이스크림몰은 변환 뒤 continuation으로 배송 색인을 만들고 고른 행을 본 행으로 적는다', async () => {
    const icecream = { ...account, key: 'icecream-mall', name: '아이스크림몰' } as OrderCollectionMallAccount;
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'succeeded', { plan: { mallKey: 'icecream-mall' }, result: { rowCount: 1, mallKey: 'icecream-mall', captured: 1, masked: true, orderNumbers: ['order-2'] } }) });
    vi.mocked(apiClient.fetchRaw)
      .mockResolvedValueOnce(Response.json({
        mallKey: 'icecream-mall',
        headers: ['주문번호', '배송번호', '배송순번'],
        originalRows: [['order-1', 'delivery-1', '1'], ['order-2', 'delivery-2', '1']],
        selectedRows: [['order-2', 'delivery-2', '1']],
        selectedRowKeys: ['order-2\u001fdelivery-2\u001f1'],
        selectionMode: 'automatic',
        sourceRows: 1,
      }))
      .mockResolvedValueOnce(new Response('xls', { status: 201, headers: { 'X-Order-Collection-Source-Rows': '1', 'X-Order-Collection-Output-Rows': '2' } }));
    const addGeneratedFile = vi.fn();
    // 마스킹 표시는 결과에 실려 화면 안내("일부 개인정보가 마스킹")로 이어진다(리뷰 S2), 주문번호는 생성 파일 항목으로(S3).
    await expect(collectMallOrderOperation({ account: icecream, operationId: OPERATION_ID, collectionDate: '2026-09-10', addGeneratedFile, sleep }))
      .resolves.toEqual({ rowCount: 1, masked: true, date: '2026-09-10' });
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({ orderNumbers: ['order-2'] }));
    expect(apiClient.fetchRaw).toHaveBeenNthCalledWith(1, `/api/orders/collection/attempts/${OPERATION_ID}/continuation?operationId=${OPERATION_ID}`, { method: 'GET' });
    expect(saveIcecreamDeliveryIndex).toHaveBeenCalledWith(['주문번호', '배송번호', '배송순번'], [['order-1', 'delivery-1', '1'], ['order-2', 'delivery-2', '1']]);
    expect(addSeenOrderKeys).toHaveBeenCalledWith('icecream-mall', ['order-2\u001fdelivery-2\u001f1']);
  });

  it('아이스크림몰은 고른 행이 없어도(자동 선택에 새 행 없음) 원본 행이 있으면 배송 색인을 만든다(리뷰 S4)', async () => {
    const icecream = { ...account, key: 'icecream-mall', name: '아이스크림몰' } as OrderCollectionMallAccount;
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'succeeded', { plan: { mallKey: 'icecream-mall' }, result: { rowCount: 0, mallKey: 'icecream-mall', captured: 0, masked: false, orderNumbers: [] } }) });
    vi.mocked(apiClient.fetchRaw).mockResolvedValueOnce(Response.json({
      mallKey: 'icecream-mall',
      headers: ['주문번호', '배송번호', '배송순번'],
      originalRows: [['order-1', 'delivery-1', '1']],
      selectedRows: [],
      selectedRowKeys: [],
      selectionMode: 'automatic',
      sourceRows: 0,
    }));
    await expect(collectMallOrderOperation({ account: icecream, operationId: OPERATION_ID, collectionDate: '2026-09-10', addGeneratedFile: vi.fn(), sleep }))
      .resolves.toEqual({ rowCount: 0, masked: false, date: '2026-09-10' });
    expect(apiClient.fetchRaw).toHaveBeenCalledTimes(1);
    expect(saveIcecreamDeliveryIndex).toHaveBeenCalledWith(['주문번호', '배송번호', '배송순번'], [['order-1', 'delivery-1', '1']]);
    expect(addSeenOrderKeys).not.toHaveBeenCalled();
  });

  it('주문이 없던 실행은 변환하지 않고 0건, 로그인에 막힌 실행은 로그인 필요로 분류되는 실패', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'succeeded', { result: { rowCount: 0, mallKey: 'kidkids', captured: 0 } }) });
    const addGeneratedFile = vi.fn();
    await expect(collectMallOrderOperation({ account, operationId: OPERATION_ID, collectionDate: '2026-09-26', addGeneratedFile, sleep }))
      .resolves.toEqual({ rowCount: 0, masked: false, date: '2026-09-26' });
    expect(apiClient.fetchRaw).not.toHaveBeenCalled();
    expect(addGeneratedFile).not.toHaveBeenCalled();

    // 캡처는 있는데 변환기가 신규 주문이 없다고 한 날: 서버가 204로 답하고 0건이다.
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'succeeded', { result: { rowCount: 0, mallKey: 'kidkids', captured: 4 } }) });
    vi.mocked(apiClient.fetchRaw).mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'X-Order-Collection-Output-Rows': '0' } }));
    await expect(collectMallOrderOperation({ account, operationId: OPERATION_ID, collectionDate: '2026-09-26', addGeneratedFile, sleep }))
      .resolves.toEqual({ rowCount: 0, masked: false, date: '2026-09-26' });
    expect(addGeneratedFile).not.toHaveBeenCalled();

    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '키드키즈 로그인이 필요합니다.' }) });
    await expect(collectMallOrderOperation({ account, operationId: OPERATION_ID, collectionDate: '2026-09-26', addGeneratedFile, sleep }))
      .rejects.toMatchObject({ errorCode: 'login_required', message: '키드키즈 로그인이 필요합니다.' });
  });

  it('몰이 저장된 아이디·비밀번호를 거부해 멈춘 실행은 그 몰의 자동 로그인을 멈추고 로그인 필요로 실패한다(KID-377)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(OPERATION_ID, 'failed', {
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '키드키즈 로그인이 필요합니다. 저장된 아이디·비밀번호로 로그인하지 못했습니다: 아이디 또는 비밀번호가 일치하지 않습니다.',
      result: { login: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' } },
    }) });
    await expect(collectMallOrderOperation({ account, operationId: OPERATION_ID, collectionDate: '2026-09-26', addGeneratedFile: vi.fn(), sleep }))
      .rejects.toMatchObject({ errorCode: 'login_required' });
    expect(mallAutoLoginBlock('kidkids')).toMatchObject({ reason: '아이디 또는 비밀번호가 일치하지 않습니다.' });
  });
});
