import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { mallAutoLoginBlock, resetMallLoginBlocksForTest } from '@/lib/mall-login-block';
import { beginCoupangDirectAttempt, readCoupangDirectAttempt } from './coupang-directship-source-owner';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), getParsed: vi.fn() } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const ACCOUNT_ID = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
});

describe('beginCoupangDirectAttempt — 직배송 실행 시작(KID-377)', () => {
  it('로켓 계정(coupang-direct)의 저장 자격을 실어 시작한다 — 서플라이어 허브가 로그인 화면이면 확장이 로그인한다', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/api/orders/collection/malls/coupang-direct/password') return { key: 'coupang-direct', loginId: 'fake-rocket-id', supplierLoginId: null, password: 'fake-rocket-password' };
      throw new Error(`unexpected GET ${path}`);
    });
    await expect(beginCoupangDirectAttempt('key-1', ACCOUNT_ID)).resolves.toMatchObject({ attemptId: OPERATION_ID, state: 'RUNNING' });
    expect(requestOperationStart).toHaveBeenCalledWith('orders.coupang_directship', { channelAccountId: ACCOUNT_ID }, {
      idempotencyKey: 'key-1',
      credentials: { loginId: 'fake-rocket-id', password: 'fake-rocket-password' },
    });
  });

  it('저장 자격을 읽지 못하면 자격 없이 시작한다', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'));
    await beginCoupangDirectAttempt('key-2', ACCOUNT_ID);
    expect(requestOperationStart).toHaveBeenCalledWith('orders.coupang_directship', { channelAccountId: ACCOUNT_ID }, { idempotencyKey: 'key-2' });
  });

  it('서플라이어 허브가 로켓 계정 자격을 거절해 끝난 실행을 읽으면 coupang-direct 자동 로그인을 멈춘다', async () => {
    resetMallLoginBlocksForTest();
    vi.mocked(apiClient.getParsed).mockResolvedValue({ operation: {
      id: OPERATION_ID, kind: 'orders.coupang_directship', status: 'failed', lockKeys: [], plan: { channelAccountId: ACCOUNT_ID },
      progress: null, result: { login: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' } }, window: null,
      errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '쿠팡 서플라이어 허브 로그인이 필요합니다.',
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), expiresAt: new Date().toISOString(),
      attempts: 1, maxAttempts: 1, scheduledFor: null,
    } } as never);
    await expect(readCoupangDirectAttempt(OPERATION_ID)).resolves.toMatchObject({ state: 'FAILED' });
    expect(mallAutoLoginBlock('coupang-direct')).toMatchObject({ reason: '아이디 또는 비밀번호가 일치하지 않습니다.' });
  });
});
