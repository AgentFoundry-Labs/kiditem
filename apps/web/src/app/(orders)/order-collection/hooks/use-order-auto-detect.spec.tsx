import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrderAutoDetect } from './use-order-auto-detect';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

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
