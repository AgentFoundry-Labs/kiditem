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

import { useAllMarketplaceOrderCollection } from './useAllMarketplaceOrderCollection';
import { ApiError } from '@/lib/api-error';
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

    expect(batch).toEqual({ successCount: 0, failedCount: 0, inProgressCount: 1 });
    expect(mocks.fail).not.toHaveBeenCalled();
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
