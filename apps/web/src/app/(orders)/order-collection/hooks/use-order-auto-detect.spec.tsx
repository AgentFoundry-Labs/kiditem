import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrderAutoDetect } from './use-order-auto-detect';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

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

  it('does not fail an owner attempt again when conversion acknowledgement is uncertain', async () => {
    const reconciliationError = Object.assign(
      new Error('owner reconciliation required'),
      { ownerReconciliationRequired: true },
    );
    const prepareRun = vi.fn().mockResolvedValue({
      attemptId: '11111111-1111-4111-8111-111111111111',
      attemptToken: '22222222-2222-4222-8222-222222222222',
      date: '2026-09-10',
    });
    const collectAccount = vi.fn().mockRejectedValue(reconciliationError);
    const failRun = vi.fn();
    const releaseRun = vi.fn();
    const markCollecting = vi.fn();
    const logActivity = vi.fn();
    const { result } = renderHook(() => useOrderAutoDetect({
      mallAccounts: [ACCOUNT],
      collectAccount,
      prepareRun,
      failRun,
      releaseRun,
      markCollecting,
      logActivity,
    }));

    await act(async () => {
      await result.current.run();
    });

    expect(prepareRun).toHaveBeenCalledWith(
      ACCOUNT,
      undefined,
      undefined,
      expect.objectContaining({ selectionMode: 'automatic' }),
    );
    expect(collectAccount).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ attemptId: '11111111-1111-4111-8111-111111111111' }),
    );
    expect(failRun).not.toHaveBeenCalled();
    expect(releaseRun).toHaveBeenCalledWith(
      ACCOUNT.key,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(markCollecting).toHaveBeenLastCalledWith(ACCOUNT.key, false);
  });
});
