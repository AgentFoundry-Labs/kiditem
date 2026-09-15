import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  fail: vi.fn(),
  readAttempt: vi.fn(),
  collectMall: vi.fn(),
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
}));
vi.mock('@/app/(orders)/order-collection/lib/browser-mall-collection', () => ({
  createBrowserMallCollector: () => mocks.collectMall,
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn().mockRejectedValue(new Error('no status read in this spec')), post: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'sonner';
import { useAllMarketplaceOrderCollection } from './useAllMarketplaceOrderCollection';
import { ApiError } from '@/lib/api-error';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { ORDER_COLLECTION_IN_PROGRESS_MESSAGE } from '@/app/(orders)/order-collection/lib/order-collection-source-owner';
import type { OrderCollectionMallAccount } from '@/app/(orders)/order-collection/lib/order-mall-account-api';

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

const MALLS = [
  mall('kidsnote', '키즈노트'),
  mall('onch', '온채널'),
  mall('domeggook', '도매꾹'),
  mall('kkomangse', '꼬망세'),
  mall('kidkids', '키드키즈'),
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
      'HTTP_409',
      ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
      { code: 'ATTEMPT_IN_PROGRESS', attemptId: attemptFor('kidsnote', 9).attemptId },
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
   * KID-170 D1. 이 조직에 계정 행이 없는 몰은 owner 가 시작을 받지 못한다. 그것을
   * 실패로 세면 전체 수집이 "1개 성공, 10개 실패"로 끝나 운영자가 고장으로 읽는다.
   */
  it('⭐ 설정되지 않은 몰은 실패가 아니라 미설정으로 센다', async () => {
    const logActivity = vi.fn();
    const missing = mall('kidsnote', '키즈노트');
    const ready = mall('onch', '온채널');
    mocks.begin.mockImplementation(async (_key: string, input: { mallKey: string }) => {
      if (input.mallKey === missing.key) {
        throw new ApiError(404, 'Not Found', 'ORDER_COLLECTION_MALL_NOT_FOUND', {});
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
  const kidkids = mall('kidkids', '키드키즈');
  const attempt = attemptFor('kidkids', 5);

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
        mallAccounts: [kidkids],
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
      await result.current.collectionAdapter(kidkids).start?.({}, { status: undefined });
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
    expect(toast.success).toHaveBeenCalledWith('키드키즈 수집 완료');
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
