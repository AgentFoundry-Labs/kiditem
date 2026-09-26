import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { orderMallAccountApi } from '@/lib/order-mall-account-api';
import { mallAutoLoginBlock } from '@/lib/mall-login-block';
import { mallPublishingApi } from './mall-publishing-api';
import { mallAdminListingsCollection, mallAdminListingsSourceQueryOptions } from './mall-admin-listings-collection';

// 1차 몰 가져오기 시작이 그 몰의 저장 자격을 싣는가(KID-363 × KID-377). 실행 시작(`operation-start`)은 진짜이고,
// 가짜는 확장 메시지 경계와 저장 자격 API뿐이다. 자격은 확장이 `operationLoginV1`을 알릴 때만 실린다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn() } }));
vi.mock('./mall-publishing-api', () => ({ mallPublishingApi: { mallAdminListingsSource: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '55555555-5555-4555-8555-555555555555';
const status = {
  malls: [{
    mallKey: 'kidkids', mallName: '키드키즈', channelAccountId: ACCOUNT,
    latestAttempt: null, latestComplete: null, latestPublication: null, latestOperation: null, latestSucceeded: null,
  }],
};

function extension(capabilities: Record<string, boolean>) {
  const starts: Array<Record<string, unknown>> = [];
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const body = message as Record<string, unknown>;
    if (body.action === 'ping') return { success: true, capabilities } as never;
    starts.push(body);
    return { success: true, operationId: OPERATION_ID, reused: false } as never;
  });
  return starts;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(orderMallAccountApi.password).mockResolvedValue({ loginId: 'kid-id', password: 'kid-pw' } as never);
});

describe('몰 관리자 1차 몰 시작의 자동 로그인 자격', () => {
  it('⭐ 확장이 operationLoginV1을 알리면 그 몰의 저장 자격을 operation.start에 싣는다', async () => {
    const starts = extension({ operationRuntime: true, channelsOperationKindsV1: true, operationLoginV1: true });
    await expect(mallAdminListingsCollection('kidkids').start!(undefined, { status: status as never }))
      .resolves.toEqual({ outcome: 'started', attemptId: OPERATION_ID });
    expect(orderMallAccountApi.password).toHaveBeenCalledWith('kidkids');
    expect(starts).toEqual([{
      action: 'operation.start',
      kind: 'channels.mall_admin_listings',
      scope: { channelAccountId: ACCOUNT, mallKey: 'kidkids' },
      credentials: { loginId: 'kid-id', password: 'kid-pw' },
    }]);
  });

  it('operationLoginV1이 없는 옛 빌드에는 자격을 싣지 않는다', async () => {
    const starts = extension({ operationRuntime: true, channelsOperationKindsV1: true });
    await mallAdminListingsCollection('kidkids').start!(undefined, { status: status as never });
    expect(starts).toHaveLength(1);
    expect(starts[0]).not.toHaveProperty('credentials');
  });

  it('끝난 실행이 몰의 아이디·비밀번호 거절로 멈췄으면 source를 읽을 때 그 몰의 자동 로그인을 멈춘다', async () => {
    vi.mocked(mallPublishingApi.mallAdminListingsSource).mockResolvedValue({
      malls: [{ ...status.malls[0], latestOperation: {
        id: OPERATION_ID, kind: 'channels.mall_admin_listings', status: 'failed', lockKeys: [], plan: null, progress: null,
        result: { login: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' } },
        window: null, errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: null, startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), attempts: 1, maxAttempts: 1, scheduledFor: null,
      } }],
    } as never);
    expect(mallAutoLoginBlock('kidkids')).toBeFalsy();
    await (mallAdminListingsSourceQueryOptions().queryFn as () => Promise<unknown>)();
    expect(mallAutoLoginBlock('kidkids')).toBeTruthy();
  });
});
