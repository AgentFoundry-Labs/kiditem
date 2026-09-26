import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  fail: vi.fn(),
  readAttempt: vi.fn(),
  collectMall: vi.fn(),
  collectDirectship: vi.fn(),
  beginDirect: vi.fn(),
  readDirectAttempt: vi.fn(),
  closeTabs: vi.fn(),
  ensureLogin: vi.fn(),
  startOperation: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));
vi.mock('@/app/(orders)/order-collection/lib/order-collection-source-owner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(orders)/order-collection/lib/order-collection-source-owner')>()),
  beginOrderCollectionSourceAttempt: mocks.begin,
  failOrderCollectionSourceAttempt: mocks.fail,
  readOrderCollectionSourceAttempt: mocks.readAttempt,
}));
vi.mock('@/app/(orders)/order-collection/lib/order-collection-extension', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(orders)/order-collection/lib/order-collection-extension')>()),
  detectOrderCollectionSessionExtensionStatus: async () => ({
    status: 'ready',
    extensionId: 'order-extension',
    version: '1.0.86',
  }),
  closeOrderCollectionTabsViaExtension: mocks.closeTabs,
}));
vi.mock('@/app/(orders)/order-collection/lib/browser-mall-collection', () => ({
  createBrowserMallCollector: () => mocks.collectMall,
  ensureMallLoginForRun: mocks.ensureLogin,
  toastNoNewOrders: vi.fn(),
}));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: mocks.startOperation, requestOperationCancel: vi.fn() }));
vi.mock('@/app/(orders)/order-collection/lib/coupang-directship-collection', () => ({
  createCoupangDirectshipCollector: () => mocks.collectDirectship,
}));
vi.mock('@/app/(orders)/order-collection/lib/coupang-directship-source-owner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(orders)/order-collection/lib/coupang-directship-source-owner')>()),
  beginCoupangDirectAttempt: mocks.beginDirect,
  readCoupangDirectAttempt: mocks.readDirectAttempt,
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn().mockRejectedValue(new Error('no status read in this spec')), post: vi.fn(), fetchRaw: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useAllMarketplaceOrderCollection } from './useAllMarketplaceOrderCollection';
import { ApiError } from '@/lib/api-error';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { ORDER_COLLECTION_IN_PROGRESS_MESSAGE } from '@/app/(orders)/order-collection/lib/order-collection-source-owner';
import { COUPANG_DIRECT_MALL_KEY } from '@/app/(orders)/order-collection/lib/coupang-directship-collection-source';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

const mall = (key: string, name: string): OrderCollectionMallAccount => ({
  key,
  name,
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: null,
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
});

// 옛 attempt 경로에 남은 몰(나머지 몰이 옮겨질 때까지)만 쓴다 — 1차 몰 4곳은 실행 kind 경로다(KID-359 H3).
const MALLS = [
  mall('kidsnote', '키즈노트'),
  mall('onch', '온채널'),
  mall('haebub-mall', '해법몰'),
  mall('kkomangse', '꼬망세'),
  mall('lotte-on', '롯데ON'),
];

/** 몰 키마다 서버가 따로 내어 주는 진행 중 시도. */
function attemptFor(mallKey: string, index: number) {
  const id = `00000000-0000-4000-8000-00000000000${index}`;
  return {
    attemptId: id,
    sourceImportRunId: id,
    state: 'RUNNING' as const,
    plan: {
      sourceType: 'order_collection_mall' as const,
      parserVersion: 'order-collection-v1',
      mallKey,
      mallName: mallKey,
      channelAccountId: `channel-${mallKey}`,
      collectionDate: '2026-09-14',
      collectionMode: 'browser' as const,
      selectionMode: 'manual' as const,
    },
    expiresAt: '2026-09-14T12:00:00.000Z',
    artifactId: null,
    coverageStartDate: null,
    coverageEndDate: null,
    errorCode: null,
    errorMessage: null,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

/**
 * 전체 수집은 몰 여러 곳을 함께 돌린다. 서버는 몰마다 진행 중인 시도를 하나씩 허락하므로,
 * 웹이 첫 몰을 시작하는 동안 다른 몰을 '이미 시작되었습니다'로 거절하면 전체 수집이 몰 하나만
 * 돌리고 나머지를 모두 실패로 남긴다.
 */
describe('useAllMarketplaceOrderCollection — 전체 수집', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    const byMall = new Map(MALLS.map((account, index) => [account.key, attemptFor(account.key, index)]));
    const byId = new Map([...byMall.values()].map((attempt) => [attempt.attemptId, attempt]));
    mocks.begin.mockImplementation(async (_idempotencyKey: string, input: { mallKey: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ...byMall.get(input.mallKey)!, attemptToken: '33333333-3333-4333-8333-333333333333' };
    });
    mocks.readAttempt.mockImplementation(async (attemptId: string) => byId.get(attemptId));
    mocks.collectMall.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { rowCount: 2, masked: false, date: '2026-09-14' };
    });
  });

  it('⭐ 몰마다 시도를 받아 모두 수집한다 — 먼저 시작한 몰 때문에 나머지를 거절하지 않는다', async () => {
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: MALLS,
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
      }),
      { wrapper },
    );

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toMatchObject({ successCount: MALLS.length, failedCount: 0 });
    expect(mocks.begin.mock.calls.map(([, input]) => input.mallKey).sort()).toEqual(
      MALLS.map((account) => account.key).sort(),
    );
    expect(mocks.collectMall).toHaveBeenCalledTimes(MALLS.length);
    // 몰마다 제 시작 키를 쓴다 — 다른 몰의 키를 다시 쓰면 서버가 거절한다.
    expect(new Set(mocks.begin.mock.calls.map(([key]) => key)).size).toBe(MALLS.length);
  });

  /**
   * 해법몰 · 도매꾹은 주문이 없다는 확인을 받으면 확장이 시도를 빈 스냅샷으로 끝낸다. 끝난 시도에
   * '신규 주문 없음' 실패를 또 보내면 서버가 거절해(SOURCE_TERMINAL_REPLAY_CONFLICT) 수집
   * 실패로 남는다.
   */
  it('⭐ 확장이 빈 스냅샷으로 끝낸 시도는 실패로 다시 닫지 않는다 — 신규 주문 없음으로 남긴다', async () => {
    const haebub = mall('haebub-mall', '해법몰');
    const completed = { ...attemptFor('haebub-mall', 7), state: 'COMPLETE' as const };
    mocks.begin.mockResolvedValue({ ...attemptFor('haebub-mall', 7), attemptToken: '33333333-3333-4333-8333-333333333333' });
    mocks.readAttempt.mockResolvedValue(completed);
    mocks.collectMall.mockResolvedValue({ rowCount: 0, masked: false, date: '2026-09-14' });
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [haebub],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
      }),
      { wrapper },
    );

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toMatchObject({ successCount: 1, failedCount: 0 });
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  /**
   * KID-106 Q6. 새로고침·다른 탭에서 같은 몰을 다시 시작하면 owner 가 409 로 거절한다. 그 몰은
   * 이미 수집하는 중이지 실패한 것이 아니므로, 실패 수에도 활동 기록에도 남기지 않는다.
   */
  it('⭐ 이미 진행 중인 몰은 실패가 아니라 진행 중으로 센다 — 실패 기록을 남기지 않는다', async () => {
    const kidsnote = mall('kidsnote', '키즈노트');
    const logActivity = vi.fn();
    mocks.begin.mockRejectedValue(new ApiError(
      409,
      'ATTEMPT_IN_PROGRESS',
      ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
      {  attemptId: attemptFor('kidsnote', 9).attemptId },
    ));
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity,
      }),
      { wrapper },
    );

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toEqual({
      successCount: 0,
      failedCount: 0,
      inProgressCount: 1,
      unconfiguredCount: 0,
    });
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  /**
   * KID-117 리뷰 M2. 분류와 특정 문장은 원문·코드로 판정하고, 한국어 choke point(`friendlyError`)는 표시에만 쓴다.
   * 그렇지 않으면 확장의 연결 끊김이 "오류"로, 서버의 시도 분실이 일반 문장으로, 우리 요청 한도가 고장으로 읽힌다.
   */
  it.each([
    ['확장의 "Failed to fetch"는 로그인 필요로', new TypeError('Failed to fetch'), 'login', '키즈노트 연결이 끊겼습니다'],
    [
      '서버가 시도를 모르면 내부 오류 문장으로(안심시키는 말로 덮지 않는다)',
      new ApiError(404, 'NOT_FOUND', 'Not Found', { reason: 'ORDER_COLLECTION_ATTEMPT_NOT_FOUND' }),
      'error',
      '키즈노트 수집이 KidItem 내부 오류로 멈췄습니다(시도를 찾지 못함)',
    ],
    ['우리 API 한도(429)는 잠시 미룬 것으로', new ApiError(429, 'RATE_LIMITED', null), 'error', '요청이 한꺼번에 몰려 키즈노트 수집을 잠시 미뤘습니다'],
  ] as const)('⭐ %s', async (_name, failure, kind, text) => {
    const logActivity = vi.fn();
    const kidsnote = mall('kidsnote', '키즈노트');
    mocks.collectMall.mockRejectedValue(failure);
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity,
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.collectAll();
    });

    expect(logActivity).toHaveBeenCalledWith(kind, '키즈노트', expect.stringContaining(text));
  });

  /**
   * KID-170 D1. 이 조직에 계정 행이 없는 몰은 owner 가 시작을 받지 못한다. 그것을
   * 실패로 세면 전체 수집이 "1개 성공, 10개 실패"로 끝나 운영자가 고장으로 읽는다.
   */
  it('⭐ 설정되지 않은 몰은 실패가 아니라 미설정으로 센다', async () => {
    const logActivity = vi.fn();
    const missing = mall('kidsnote', '키즈노트');
    const ready = mall('onch', '온채널');
    mocks.begin.mockImplementation(async (_key: string, input: { mallKey: string }) => {
      if (input.mallKey === missing.key) {
        throw new ApiError(404, 'NOT_FOUND', null, { reason: 'ORDER_COLLECTION_MALL_NOT_FOUND' });
      }
      return { ...attemptFor(input.mallKey, 1), attemptToken: '33333333-3333-4333-8333-333333333333' };
    });
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [missing, ready],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity,
      }),
      { wrapper },
    );

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toEqual({
      successCount: 1,
      failedCount: 0,
      inProgressCount: 0,
      unconfiguredCount: 1,
    });
    expect(logActivity).not.toHaveBeenCalled();
  });

  /**
   * KID-159. 운영자 중단은 owner 취소가 terminal 이다. 공용 컨트롤의 중단이 이
   * 브라우저의 절차를 끊으면 수집 fetch 가 거절되는데, 그 오류를 화면이
   * `/fail COLLECTION_FAILED` 로 다시 닫으면 owner 취소보다 먼저 닿아 실패
   * 알림이 남는다("멈춰도 실패 알림이 남지 않는다" 위반).
   */
  it('⭐ 운영자 중단으로 끊긴 수집은 실패로 닫지 않는다 — /fail 도 실패 활동도 없다', async () => {
    const kidsnote = mall('kidsnote', '키즈노트');
    const logActivity = vi.fn();
    mocks.begin.mockResolvedValue({
      ...attemptFor('kidsnote', 6),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    mocks.readAttempt.mockResolvedValue(attemptFor('kidsnote', 6));
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity,
      }),
      { wrapper },
    );
    mocks.collectMall.mockImplementation(async (
      _account: OrderCollectionMallAccount,
      run: { attemptId: string },
    ) => {
      // 공용 컨트롤의 중단이 서버 취소에 앞서 이 브라우저의 절차부터 끊는다.
      result.current.sessionControls.abortLocalRun(run.attemptId);
      throw new Error('수집 창이 닫혔습니다.');
    });

    await act(async () => {
      await result.current.collectAll();
    });

    expect(mocks.fail).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('중단이 아닌 진짜 실패는 그대로 COLLECTION_FAILED 로 닫고 활동에 남긴다', async () => {
    const kidsnote = mall('kidsnote', '키즈노트');
    const logActivity = vi.fn();
    mocks.begin.mockResolvedValue({
      ...attemptFor('kidsnote', 6),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    mocks.readAttempt.mockResolvedValue(attemptFor('kidsnote', 6));
    mocks.fail.mockResolvedValue({ ...attemptFor('kidsnote', 6), state: 'FAILED' });
    mocks.collectMall.mockRejectedValue(new Error('주문 표를 읽지 못했습니다.'));
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity,
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.collectAll();
    });

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: attemptFor('kidsnote', 6).attemptId }),
      expect.objectContaining({ code: 'COLLECTION_FAILED' }),
    );
    expect(logActivity).toHaveBeenCalledWith('error', '키즈노트', expect.any(String));
  });

  /**
   * 라이브(2026-09-16): 로그인이 풀린 몰 여섯 곳이 30분 임대가 끝날 때까지 '수집 중'으로 서 있었다.
   * 사장님이 로그인하고 돌아와도 카드가 '중단'만 보여 다시 시작할 수 없었다.
   */
  it('⭐ 로그인·인증이 필요해 멈춘 시도는 그 자리에서 끝낸다 — 카드가 30분 동안 수집 중으로 서 있지 않게', async () => {
    const lotteOn = mall('lotte-on', '롯데ON');
    const logActivity = vi.fn();
    mocks.begin.mockResolvedValue({
      ...attemptFor('lotte-on', 9),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    // 확장이 로그인 화면을 만나 돌아왔을 뿐, owner 의 시도는 아직 돌고 있다.
    mocks.readAttempt.mockResolvedValue(attemptFor('lotte-on', 9));
    mocks.fail.mockResolvedValue({ ...attemptFor('lotte-on', 9), state: 'FAILED' });
    mocks.collectMall.mockRejectedValue(
      Object.assign(new Error('롯데ON 로그인이 필요합니다.'), { errorCode: 'login_required' }),
    );
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [lotteOn],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity,
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.collectAll();
    });

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: attemptFor('lotte-on', 9).attemptId }),
      expect.objectContaining({ code: 'LOGIN_REQUIRED' }),
    );
    expect(logActivity).toHaveBeenCalledWith('login', '롯데ON', expect.any(String));
  });

  /**
   * 사장님: "수집 끝났으면 창 닫아라". 우리가 연 몰 탭은 그 몰의 수집이 끝나는 대로 닫는다.
   * 남기는 것은 본인인증 · OTP 처럼 그 화면에서 사람이 끝내야 하는 몰뿐이다.
   */
  it('⭐ 수집이 끝나면 그 몰의 탭을 닫는다 — 인증이 필요한 몰만 남긴다', async () => {
    const kidsnote = mall('kidsnote', '키즈노트');
    mocks.begin.mockResolvedValue({
      ...attemptFor('kidsnote', 8),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    mocks.readAttempt.mockResolvedValue({ ...attemptFor('kidsnote', 8), state: 'COMPLETE' });
    mocks.collectMall.mockResolvedValue({ rowCount: 2, masked: false, date: '2026-09-14' });
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity: vi.fn(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.collectAccounts([kidsnote]);
    });

    expect(mocks.closeTabs).toHaveBeenCalledWith('order-extension', attemptFor('kidsnote', 8).attemptId);
  });

  it('인증이 필요한 몰의 탭은 사람이 끝내야 하므로 닫지 않는다', async () => {
    const gsshop = mall('gs-shop', 'GS샵');
    mocks.begin.mockResolvedValue({
      ...attemptFor('gs-shop', 8),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    mocks.readAttempt.mockResolvedValue(attemptFor('gs-shop', 8));
    mocks.fail.mockResolvedValue({ ...attemptFor('gs-shop', 8), state: 'FAILED' });
    mocks.collectMall.mockRejectedValue(new Error('GS샵 SMS 인증이 필요합니다.'));
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [gsshop],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity: vi.fn(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.collectAccounts([gsshop]);
    });

    expect(mocks.closeTabs).not.toHaveBeenCalled();
  });

  /**
   * KID-228: owner 가 열어 준 시도가 이미 RUNNING 이 아니면(임대 만료 · 다른 탭의 중단) 넘길
   * 절차가 없어 핸드오프를 건너뛴다. 그때 남는 수집은 `null` 이고 `await null` 은 그냥
   * 통과하므로, 아무것도 안 한 몰이 '수집 완료'로 세어지면 안 된다.
   */
  it('⭐ 시작만 되고 수집 절차가 남지 않은 몰은 성공으로 세지 않는다', async () => {
    const kidsnote = mall('kidsnote', '키즈노트');
    mocks.begin.mockResolvedValue({
      ...attemptFor('kidsnote', 8),
      state: 'COMPLETE' as const,
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        logActivity: vi.fn(),
      }),
      { wrapper },
    );

    let batch: { successCount: number; failedCount: number } | null = null;
    await act(async () => {
      batch = await result.current.collectAccounts([kidsnote]);
    });

    expect(batch).toMatchObject({ successCount: 0, failedCount: 1 });
    // 절차가 없으니 수집도 돌지 않았다.
    expect(mocks.collectMall).not.toHaveBeenCalled();
  });

  it('주문이 없는데 시도가 아직 진행 중이면 신규 주문 없음으로 닫는다', async () => {
    const kidsnote = mall('kidsnote', '키즈노트');
    mocks.begin.mockResolvedValue({ ...attemptFor('kidsnote', 8), attemptToken: '33333333-3333-4333-8333-333333333333' });
    mocks.readAttempt.mockResolvedValue(attemptFor('kidsnote', 8));
    mocks.fail.mockResolvedValue({ ...attemptFor('kidsnote', 8), state: 'FAILED' });
    mocks.collectMall.mockResolvedValue({ rowCount: 0, masked: false, date: '2026-09-14' });
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.collectAll();
    });

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: attemptFor('kidsnote', 8).attemptId }),
      expect.objectContaining({ code: 'NO_NEW_ORDERS' }),
    );
  });
});

/**
 * KID-220. 운영자가 중단하면 서버는 시도를 취소하고 확장은 몰 탭을 닫지만, 그 몰의
 * 제너레이터는 영영 오지 않을 확장 메시지를 기다리며 그대로 서 있을 수 있다(탭을 하나도
 * 열지 못한 카카오, OTP 화면에 멈춘 키드키즈). 중단 안내를 그 약속의 거절에만 매달아
 * 두면 카드는 0.6초 만에 쉬는 상태로 돌아가는데 운영자는 아무 말도 듣지 못하고, 그
 * 약속을 기다리던 전체 수집도 풀리지 않는다.
 */
describe('useAllMarketplaceOrderCollection — 운영자 중단 안내', () => {
  const lotteOn = mall('lotte-on', '롯데ON');
  const attempt = attemptFor('lotte-on', 5);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.begin.mockResolvedValue({
      ...attempt,
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    mocks.readAttempt.mockResolvedValue(attempt);
  });

  function renderOneMall() {
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [lotteOn],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
      }),
      { wrapper },
    );
    return result;
  }

  /** 카드의 공용 컨트롤이 시작하는 것과 같은 자리 — 이 시작만 운영자에게 결과를 알린다. */
  async function startFromCard(result: ReturnType<typeof renderOneMall>) {
    await act(async () => {
      await result.current.mallCollectionAdapter(lotteOn).start?.({}, { status: undefined });
    });
  }

  it('⭐ 확장의 답을 기다리다 멈춘 수집도 중단하면 중단 안내를 한 번 띄운다', async () => {
    mocks.collectMall.mockImplementation(() => new Promise<never>(() => undefined));
    const result = renderOneMall();
    await startFromCard(result);

    await act(async () => {
      result.current.sessionControls.abortLocalRun(attempt.attemptId);
    });

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(COLLECTION_STOPPED_MESSAGE);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('수집이 제대로 끝나면 성공 안내 그대로 — 중단 감시가 결과를 가리지 않는다', async () => {
    mocks.collectMall.mockResolvedValue({ rowCount: 2, masked: false, date: '2026-09-14' });
    const result = renderOneMall();

    await startFromCard(result);
    await act(async () => {
      await Promise.resolve();
    });

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('롯데ON 수집 완료');
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('⭐ 중단한 뒤 제너레이터가 실패로 끝나도 안내는 중단 하나뿐이다', async () => {
    let failCollection: (error: Error) => void = () => undefined;
    mocks.collectMall.mockImplementation(() => new Promise<never>((_resolve, reject) => {
      failCollection = reject;
    }));
    const result = renderOneMall();
    await startFromCard(result);

    await act(async () => {
      result.current.sessionControls.abortLocalRun(attempt.attemptId);
    });
    await act(async () => {
      failCollection(new Error('수집 창이 닫혔습니다.'));
    });

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('⭐ 중단하면 전체 수집의 기다림도 풀린다 — 끝나지 않는 몰에 매달리지 않는다', async () => {
    const result = renderOneMall();
    mocks.collectMall.mockImplementation((
      _account: OrderCollectionMallAccount,
      run: { attemptId: string },
    ) => {
      // 공용 컨트롤의 중단이 이 브라우저의 절차부터 끊는다. 확장은 탭을 닫았지만 몰
      // 제너레이터는 오지 않을 메시지를 계속 기다린다.
      result.current.sessionControls.abortLocalRun(run.attemptId);
      return new Promise<never>(() => undefined);
    });

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toMatchObject({ successCount: 0, failedCount: 1 });
    // 전체 수집은 운영자에게 몰 하나하나를 알리지 않는다.
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

/**
 * 전체 수집은 원천마다 절차가 달라도 결과를 같은 저울로 센다(KID-255). 직배송만 따로
 * 세면 "성공 4개"라는 문장이 어느 원천은 빼고 말한 것이 되고, 사장님은 돌지 않은 몰을
 * 돌았다고 읽는다.
 */
describe('useAllMarketplaceOrderCollection — 원천이 달라도 집계는 같다', () => {
  const ROCKET_CHANNEL_ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
  const DIRECT_ATTEMPT_ID = '00000000-0000-4000-8000-0000000000d1';
  const kidsnote = mall('kidsnote', '키즈노트');
  const directship = mall(COUPANG_DIRECT_MALL_KEY, '쿠팡직배송');

  const directAttempt = (state: 'RUNNING' | 'COMPLETE' = 'RUNNING') => ({
    attemptId: DIRECT_ATTEMPT_ID,
    sourceImportRunId: DIRECT_ATTEMPT_ID,
    state,
    attemptToken: '33333333-3333-4333-8333-333333333333',
    plan: {
      sourceType: 'coupang_direct_order_capture' as const,
      parserVersion: 'coupang-direct-order-v1' as const,
      channelAccountId: ROCKET_CHANNEL_ACCOUNT_ID,
      captureMode: 'browser' as const,
      transportScope: 'ALL' as const,
    },
    expiresAt: '2026-09-14T12:00:00.000Z',
    artifactId: null,
    contentChecksum: null,
    errorCode: null,
    errorMessage: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.begin.mockResolvedValue({
      ...attemptFor(kidsnote.key, 1),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    });
    mocks.readAttempt.mockResolvedValue(attemptFor(kidsnote.key, 1));
    mocks.beginDirect.mockResolvedValue(directAttempt());
    mocks.readDirectAttempt.mockResolvedValue(directAttempt('COMPLETE'));
    mocks.collectMall.mockResolvedValue({ rowCount: 2, masked: false, date: '2026-09-14' });
    mocks.collectDirectship.mockResolvedValue({ rowCount: 3, masked: false, date: '2026-09-14' });
  });

  function collectBoth() {
    return renderHook(
      () => useAllMarketplaceOrderCollection({
        mallAccounts: [kidsnote, directship],
        rocketChannelAccountId: ROCKET_CHANNEL_ACCOUNT_ID,
        addGeneratedFile: vi.fn(),
      }),
      { wrapper },
    );
  }

  it('⭐ 두 원천이 함께 수집되면 둘 다 성공 하나로 센다', async () => {
    const { result } = collectBoth();

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toEqual({
      successCount: 2,
      failedCount: 0,
      inProgressCount: 0,
      unconfiguredCount: 0,
    });
    // 몰 절차는 몰만, 직배송 절차는 직배송만 돈다 — 한 원천이 남의 절차를 타지 않는다.
    expect(mocks.collectMall).toHaveBeenCalledTimes(1);
    expect(mocks.collectDirectship).toHaveBeenCalledTimes(1);
  });

  it('⭐ 어느 원천이 실패해도 실패 하나로 센다 — 집계가 원천을 가리지 않는다', async () => {
    mocks.collectDirectship.mockRejectedValue(new Error('쿠팡직배송 발주 수집에 실패했습니다.'));
    const { result } = collectBoth();

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toMatchObject({ successCount: 1, failedCount: 1, inProgressCount: 0 });
  });

  /** KID-106 Q6 — 이미 수집 중인 원천은 실패가 아니라 진행 중이다. 직배송도 같다. */
  it('⭐ 이미 진행 중인 직배송도 실패가 아니라 진행 중으로 센다', async () => {
    mocks.beginDirect.mockRejectedValue(new ApiError(
      409,
      'ATTEMPT_IN_PROGRESS',
      ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
      {  attemptId: DIRECT_ATTEMPT_ID },
    ));
    const { result } = collectBoth();

    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toMatchObject({ successCount: 1, failedCount: 0, inProgressCount: 1 });
    expect(mocks.collectDirectship).not.toHaveBeenCalled();
  });
});

describe('useAllMarketplaceOrderCollection — 실행 kind로 옮긴 몰(KID-359 H3)', () => {
  const OPERATION_ID = '77777777-7777-4777-8777-777777777777';
  const kidkids = { ...mall('kidkids', '키드키즈'), channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11' };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.startOperation.mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
    vi.mocked(apiClient.get).mockResolvedValue({
      operation: {
        id: OPERATION_ID, kind: 'orders.mall_orders', status: 'succeeded', lockKeys: [],
        plan: { mallKey: 'kidkids' }, progress: null, result: { rowCount: 2, mallKey: 'kidkids' }, window: null,
        errorCode: null, errorMessage: null, startedAt: '2026-09-26T00:00:00.000Z', finishedAt: '2026-09-26T00:00:03.000Z',
        expiresAt: '2026-09-26T00:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
      },
    });
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response('xls', {
      status: 201,
      headers: { 'X-Order-Collection-Source-Rows': '2', 'X-Order-Collection-Product-Rows': '2', 'X-Order-Collection-Output-Rows': '4' },
    }));
  });

  it('⭐ 1차 몰은 옛 시도·옛 로그인 없이 실행 시작(로그인은 확장이 실행 안에서, KID-377) → 실행 id로 변환해 성공으로 센다', async () => {
    const addGeneratedFile = vi.fn();
    const { result } = renderHook(
      () => useAllMarketplaceOrderCollection({ mallAccounts: [kidkids], rocketChannelAccountId: null, addGeneratedFile }),
      { wrapper },
    );
    let batch: Awaited<ReturnType<typeof result.current.collectAll>> | undefined;
    await act(async () => {
      batch = await result.current.collectAll();
    });

    expect(batch).toMatchObject({ successCount: 1, failedCount: 0 });
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.collectMall).not.toHaveBeenCalled();
    expect(mocks.ensureLogin).not.toHaveBeenCalled();
    expect(mocks.startOperation).toHaveBeenCalledWith('orders.mall_orders', expect.objectContaining({ mallKey: 'kidkids', channelAccountId: kidkids.channelAccountId }), expect.anything());
    expect(apiClient.fetchRaw).toHaveBeenCalledWith(`/api/orders/collection/attempts/${OPERATION_ID}/convert`, expect.objectContaining({ body: JSON.stringify({ operationId: OPERATION_ID }) }));
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({ mallKey: 'kidkids', collectedRows: 2 }));
    expect(toast.success).toHaveBeenCalledTimes(0);
  });
});
