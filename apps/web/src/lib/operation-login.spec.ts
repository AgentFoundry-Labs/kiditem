import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { toast } from 'sonner';
import {
  blockMallAutoLogin,
  mallAutoLoginBlock,
  mallAutoLoginRetryAt,
  markMallAutoLoginAttempt,
  resetMallLoginBlocksForTest,
} from './mall-login-block';
import { orderMallAccountApi } from './order-mall-account-api';
import {
  loadOperationLoginCredentials,
  loadOperationLoginCredentialsForMall,
  noteOperationLoginFailure,
} from './operation-login';

vi.mock('./order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn(), list: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const ACCOUNT = { key: 'kidkids', name: '키드키즈', loginId: 'fake-id', supplierLoginId: null, hasPassword: true };

function failed(result: Record<string, unknown> | null, errorCode = 'SITE_LOGIN_REQUIRED'): OperationView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'orders.mall_orders',
    status: 'failed',
    lockKeys: [],
    plan: null,
    progress: null,
    result,
    window: null,
    errorCode,
    errorMessage: '키드키즈 로그인이 필요합니다.',
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: '2026-09-26T00:01:00.000Z',
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetMallLoginBlocksForTest();
  vi.mocked(orderMallAccountApi.password).mockResolvedValue({ key: 'kidkids', password: 'fake-password' });
});

describe('operation-login — 실행에 실어 보낼 저장 자격(KID-377)', () => {
  it('아이디·저장 비밀번호가 있으면 그 몰 하나의 비밀번호만 그때 읽어 자격을 만든다(공급사 아이디는 있을 때만)', async () => {
    await expect(loadOperationLoginCredentials(ACCOUNT, { automatic: false })).resolves.toEqual({ loginId: 'fake-id', password: 'fake-password' });
    expect(orderMallAccountApi.password).toHaveBeenCalledWith('kidkids');
    await expect(loadOperationLoginCredentials({ ...ACCOUNT, key: 'art09', supplierLoginId: 'fake-supplier' }, { automatic: false }))
      .resolves.toEqual({ loginId: 'fake-id', supplierLoginId: 'fake-supplier', password: 'fake-password' });
  });

  it('아이디·비밀번호가 없거나 비밀번호를 읽지 못하면 자격 없이 시작한다', async () => {
    await expect(loadOperationLoginCredentials({ ...ACCOUNT, hasPassword: false }, { automatic: false })).resolves.toBeUndefined();
    await expect(loadOperationLoginCredentials({ ...ACCOUNT, loginId: null }, { automatic: false })).resolves.toBeUndefined();
    expect(orderMallAccountApi.password).not.toHaveBeenCalled();
    vi.mocked(orderMallAccountApi.password).mockRejectedValueOnce(new Error('403'));
    await expect(loadOperationLoginCredentials(ACCOUNT, { automatic: false })).resolves.toBeUndefined();
  });

  it('자동 로그인을 멈춘 몰은 자격을 보내지 않는다(비밀번호도 읽지 않는다)', async () => {
    blockMallAutoLogin('kidkids', '비밀번호가 일치하지 않습니다.');
    await expect(loadOperationLoginCredentials(ACCOUNT, { automatic: false })).resolves.toBeUndefined();
    expect(orderMallAccountApi.password).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalled();
  });

  it('스스로 도는 수집은 한 시간에 한 번만 자격을 보내고, 보낼 때 시도를 적는다 — 사람이 누른 수집은 간격을 보지 않는다', async () => {
    await expect(loadOperationLoginCredentials(ACCOUNT, { automatic: true })).resolves.toMatchObject({ loginId: 'fake-id' });
    expect(mallAutoLoginRetryAt('kidkids')).not.toBeNull();
    await expect(loadOperationLoginCredentials(ACCOUNT, { automatic: true })).resolves.toBeUndefined();
    expect(orderMallAccountApi.password).toHaveBeenCalledTimes(1);

    markMallAutoLoginAttempt('kidkids');
    await expect(loadOperationLoginCredentials(ACCOUNT, { automatic: false })).resolves.toMatchObject({ loginId: 'fake-id' });
  });

  it('몰 키 하나로 저장 자격을 그때 읽는다(로켓 계정 coupang-direct·윙 coupang) — 저장 안 됨·읽기 실패는 자격 없음', async () => {
    vi.mocked(orderMallAccountApi.password).mockResolvedValue({ key: 'coupang', loginId: 'fake-wing-id', supplierLoginId: null, password: 'fake-wing-password' });
    await expect(loadOperationLoginCredentialsForMall('coupang')).resolves.toEqual({ loginId: 'fake-wing-id', password: 'fake-wing-password' });
    expect(orderMallAccountApi.password).toHaveBeenCalledWith('coupang');
    expect(orderMallAccountApi.list).not.toHaveBeenCalled();

    vi.mocked(orderMallAccountApi.password).mockResolvedValue({ key: 'coupang-direct', loginId: null, supplierLoginId: null, password: 'fake-rocket-password' });
    await expect(loadOperationLoginCredentialsForMall('coupang-direct')).resolves.toBeUndefined();
    vi.mocked(orderMallAccountApi.password).mockResolvedValue({ key: 'coupang-direct', loginId: 'fake-rocket-id', supplierLoginId: null, password: null });
    await expect(loadOperationLoginCredentialsForMall('coupang-direct')).resolves.toBeUndefined();
    vi.mocked(orderMallAccountApi.password).mockRejectedValueOnce(new Error('403'));
    await expect(loadOperationLoginCredentialsForMall('coupang-direct')).resolves.toBeUndefined();
  });

  it('막힌 몰 키는 비밀번호를 읽지 않는다', async () => {
    blockMallAutoLogin('coupang-direct', '비밀번호가 일치하지 않습니다.');
    await expect(loadOperationLoginCredentialsForMall('coupang-direct')).resolves.toBeUndefined();
    expect(orderMallAccountApi.password).not.toHaveBeenCalled();
  });
});

describe('operation-login — 끝난 실행의 로그인 결과로 차단을 갱신한다', () => {
  it('몰이 아이디·비밀번호를 거부했다고 말하면 그 몰의 자동 로그인을 멈춘다', () => {
    noteOperationLoginFailure(ACCOUNT, failed({ login: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' } }));
    expect(mallAutoLoginBlock('kidkids')).toMatchObject({ reason: '아이디 또는 비밀번호가 일치하지 않습니다.', kind: 'login' });
    expect(toast.error).toHaveBeenCalled();
  });

  it('몰의 말이 거절이 아니거나 없거나, 확인 못 함·자격 없음·본인확인·다른 실패는 막지 않는다', () => {
    for (const operation of [
      failed({ login: { reason: 'credentials_rejected', mallMessage: '점검 중입니다.' } }),
      failed({ login: { reason: 'credentials_rejected' } }),
      failed({ login: { reason: 'login_unconfirmed' } }),
      failed({ login: { reason: 'no_credentials' } }),
      failed({ login: { reason: 'verification_required' } }),
      failed(null),
      failed({ login: { reason: 'credentials_rejected', mallMessage: '비밀번호가 일치하지 않습니다.' } }, 'SITE_REQUEST_FAILED'),
    ]) noteOperationLoginFailure(ACCOUNT, operation);
    expect(mallAutoLoginBlock('kidkids')).toBeNull();
  });
});

