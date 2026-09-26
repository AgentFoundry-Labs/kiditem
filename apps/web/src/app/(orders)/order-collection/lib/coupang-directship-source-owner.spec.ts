import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { beginCoupangDirectAttempt } from './coupang-directship-source-owner';

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
});
