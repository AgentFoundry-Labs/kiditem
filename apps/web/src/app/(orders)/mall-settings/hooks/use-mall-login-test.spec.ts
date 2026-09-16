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

  /** 몰마다 로그인 뒤 화면이 다르다. 확인하지 못한 것을 '비밀번호 틀림'으로 굳히지 않는다. */
  it('⭐ reports an unverified login without blocking when the login form stayed', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      verifyReason: 'login_form_remains',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('unverified');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'login_test',
      outcome: 'attention',
      reasonCode: 'login_form_remains',
    }));
  });

  it('⭐ blocks auto-login only when the mall itself rejected the credentials', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: false,
      submitted: true,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(getMallLoginBlocks()).toEqual([expect.objectContaining({ mallKey: 'kidsnote', kind: 'login' })]);
  });

  it('⭐ does not block when our own server refused the request (rate limit)', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: false,
      error: 'ThrottlerException: Too Many Requests',
    });

    await runTest();

    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
  });

  it('clears the block after a login whose form went away', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true, submitted: true, verified: true, method: 'exact-text',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('verified');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'succeeded',
      reasonCode: 'form_submitted',
    }));
  });

  it('never sends the password anywhere but the extension call', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({ success: true, submitted: true, verified: true });

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
