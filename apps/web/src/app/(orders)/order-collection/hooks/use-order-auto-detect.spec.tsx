import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrderAutoDetect } from './use-order-auto-detect';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

const ACCOUNT: OrderCollectionMallAccount = {
  key: 'kidsnote',
  name: '키즈노트',
  configured: true,
  enabled: true,
  loginId: null,
  hasPassword: false,
  siteUrl: null,
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
};

describe('useOrderAutoDetect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * KID-187(KID-106 Q1). 자동 감지는 사람이 시작한다. 새로고침 · 탭 복원 뒤에 저 혼자
   * 다시 돌면 사장님이 보지 않는 사이에 몰을 열고 수집을 건다.
   */
  it('⭐ 새로고침해도 자동 감지가 저 혼자 켜지지 않는다 — 간격만 기억한다', () => {
    window.localStorage.setItem('kiditem-order-auto-detect', '1');
    window.localStorage.setItem('kiditem-order-auto-interval', '15');
    const startMall = vi.fn();

    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      startMall,
      logActivity: vi.fn(),
    }));

    expect(result.current.enabled).toBe(false);
    expect(result.current.nextRunAt).toBeNull();
    expect(result.current.intervalMin).toBe(15);
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(startMall).not.toHaveBeenCalled();
  });

  it('운영자가 켠 자동 감지는 저장되지 않는다 — 다음에 열면 다시 꺼져 있다', () => {
    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      startMall: vi.fn().mockResolvedValue({ outcome: { outcome: 'running', attemptId: null }, collection: null }),
      logActivity: vi.fn(),
    }));

    act(() => {
      result.current.toggle();
    });

    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem('kiditem-order-auto-detect')).toBeNull();
  });

  it('starts each tick through the mall shared control and waits for its collection', async () => {
    const collection = Promise.resolve({ rowCount: 3, masked: false, date: '2026-09-10' });
    const startMall = vi.fn().mockResolvedValue({
      outcome: { outcome: 'started', attemptId: ATTEMPT_ID },
      collection,
    });
    const logActivity = vi.fn();
    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      startMall,
      logActivity,
    }));

    await act(async () => {
      await result.current.run();
    });

    expect(startMall).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ selectionMode: 'automatic' }),
    );
    expect(logActivity).not.toHaveBeenCalled();
  });

  /** KID-106 Q6. 앞선 tick 의 수집이 아직 돌고 있으면 owner 가 진행 중이라고 답한다. 실패가 아니다. */
  it('⭐ leaves a mall that is still collecting alone — no failure, no activity record', async () => {
    const startMall = vi.fn().mockResolvedValue({
      outcome: { outcome: 'running', attemptId: ATTEMPT_ID },
      collection: null,
    });
    const logActivity = vi.fn();
    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      startMall,
      logActivity,
    }));

    await act(async () => {
      await result.current.run();
    });

    expect(logActivity).not.toHaveBeenCalled();
  });

  /**
   * KID-199. 수집 절차가 이미 활동 기록을 남기고 실패를 다시 던진다. 여기서 또 남기면
   * 한 번 실패한 몰이 활동 기록에 두 줄로 선다.
   */
  it('⭐ 수집 절차가 남긴 실패를 자동 감지가 또 남기지 않는다', async () => {
    const startMall = vi.fn().mockResolvedValue({
      outcome: { outcome: 'started', attemptId: ATTEMPT_ID },
      collection: Promise.reject(new Error('키즈노트 파일 생성 실패')),
    });
    const logActivity = vi.fn();
    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      startMall,
      logActivity,
    }));

    await act(async () => {
      await result.current.run();
    });

    expect(logActivity).not.toHaveBeenCalled();
  });

  it('records why a mall could not be started at all', async () => {
    const startMall = vi.fn().mockRejectedValue(
      new Error('주문수집 확장프로그램을 찾지 못했습니다.'),
    );
    const logActivity = vi.fn();
    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      startMall,
      logActivity,
    }));

    await act(async () => {
      await result.current.run();
    });

    expect(logActivity).toHaveBeenCalledWith(
      'error',
      ACCOUNT.name,
      '주문수집 확장프로그램을 찾지 못했습니다.',
    );
  });
});
