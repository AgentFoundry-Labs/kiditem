import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const extension = vi.hoisted(() => ({ testMallLoginViaExtension: vi.fn() }));
const accounts = vi.hoisted(() => ({ password: vi.fn(), list: vi.fn() }));
const outcomes = vi.hoisted(() => ({ recordMallOperationOutcome: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('../../order-collection/lib/order-collection-extension', () => extension);
vi.mock('../../order-collection/lib/order-mall-account-api', () => ({ orderMallAccountApi: accounts }));
vi.mock('@/lib/mall-operation-outcomes-api', () => outcomes);

import {
  getMallLoginBlocks,
  isMallAutoLoginBlocked,
  resetMallLoginBlocksForTest,
} from '@/lib/mall-login-block';
import { toLoginTestReasonCode, useMallLoginTest } from './use-mall-login-test';

async function runTest(mallKey = 'kidsnote') {
  const { result } = renderHook(() => useMallLoginTest());
  await act(async () => {
    await result.current.test(mallKey, '키즈노트');
  });
  return result.current.results[mallKey];
}

describe('useMallLoginTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMallLoginBlocksForTest();
    window.localStorage.clear();
    accounts.password.mockResolvedValue({ key: 'kidsnote', password: 'secret-pw' });
    accounts.list.mockResolvedValue([{ key: 'kidsnote', loginId: 'seller' }]);
  });

  it('⭐ does not block auto-login when the test never reached the extension', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: false,
      unavailable: 'extension_outdated',
      error: '확장을 다시 불러오세요.',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
    expect(outcomes.recordMallOperationOutcome).not.toHaveBeenCalled();
  });

  it('⭐ blocks auto-login when the mall kept its login form after the submit', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: false,
      submitted: true,
      errorCode: 'login_rejected',
      error: '로그인 화면이 남아 있습니다.',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(getMallLoginBlocks()).toEqual([expect.objectContaining({ mallKey: 'kidsnote', kind: 'login' })]);
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'login_test',
      outcome: 'failed',
      reasonCode: 'login_rejected',
    }));
  });

  it('clears the block after a login whose form went away', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({ success: true, submitted: true, method: 'exact-text' });

    const result = await runTest();

    expect(result?.outcome).toBe('verified');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'succeeded',
      reasonCode: 'form_submitted',
    }));
  });

  it('never sends the password anywhere but the extension call', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({ success: true, submitted: true });

    await runTest();

    expect(extension.testMallLoginViaExtension).toHaveBeenCalledWith('kidsnote', {
      loginId: 'seller',
      password: 'secret-pw',
    });
    expect(JSON.stringify(outcomes.recordMallOperationOutcome.mock.calls)).not.toContain('secret-pw');
  });
});

describe('toLoginTestReasonCode', () => {
  it('shapes extension codes into the outcome reason-code form', () => {
    expect(toLoginTestReasonCode('OWNER_ATTEMPT_REQUIRED', 'login_failed')).toBe('owner_attempt_required');
    expect(toLoginTestReasonCode('login-rejected', 'login_failed')).toBe('login_rejected');
    expect(toLoginTestReasonCode('42', 'login_failed')).toBe('login_failed');
    expect(toLoginTestReasonCode(undefined, 'login_failed')).toBe('login_failed');
  });
});
