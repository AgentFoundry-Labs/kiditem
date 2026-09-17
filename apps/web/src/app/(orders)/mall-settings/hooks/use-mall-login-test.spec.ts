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
    accounts.list.mockResolvedValue([
      { key: 'kidsnote', loginId: 'seller', siteUrl: 'https://shop.kidsnote.com' },
    ]);
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

  /**
   * 카카오(토큰) · 올웨이즈(브라우저 저장소 JWT)는 확장이 채울 로그인 폼이 없다. 확장이 탭도
   * 열지 않고 `no_login_form` 으로 답하므로, 화면은 왜 확인하지 못했는지 그대로 말해야 한다 —
   * "실패"로 굳히거나 자동 로그인을 막지 않는다.
   */
  it('⭐ says why a mall with no fillable login form could not be checked', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: false,
      reason: 'no_login_form',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('unverified');
    expect(result?.detail).toBe('이 몰은 확장이 채울 로그인 폼이 없어 확인하지 못했습니다.');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'login_test',
      outcome: 'attention',
      reasonCode: 'no_login_form',
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

  /**
   * 몰은 대개 알림 창으로 답한다("아이디 또는 비밀번호가 일치하지 않습니다"). 백그라운드 탭의
   * 알림 창은 사장님께 보이지 않아, 값만 채워진 로그인 화면이 남고 "버튼을 안 눌렀다"처럼 보였다.
   */
  it('⭐ 몰이 아이디·비밀번호를 거부했다고 말하면 그 말을 보여 주고 자동 로그인을 막는다', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(result?.detail).toContain('아이디 또는 비밀번호가 일치하지 않습니다.');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(true);
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith({
      mallKey: 'kidsnote',
      operation: 'login_test',
      outcome: 'failed',
      reasonCode: 'credentials_rejected',
    });
    // 몰의 말은 화면에만 — 관찰 기록은 개수와 이유 코드만 담는다.
    expect(JSON.stringify(outcomes.recordMallOperationOutcome.mock.calls))
      .not.toContain('아이디 또는 비밀번호가 일치하지 않습니다.');
  });

  it('몰이 다른 말을 남기면 그대로 보여 주되 막지는 않는다', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '시스템 점검 중입니다.',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('unverified');
    expect(result?.detail).toContain('시스템 점검 중입니다.');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
  });

  /**
   * 몰 문장에는 아이디가 섞인다. 관찰 기록은 개수와 이유 코드만 담는다 — 그 말은 화면에만 둔다.
   */
  it('⭐ 몰이 돌려준 말은 화면에만 두고 관찰 기록에는 싣지 않는다', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '아이디(abc123)가 존재하지 않습니다.',
    });

    const result = await runTest();

    expect(result?.detail).toContain('아이디(abc123)가 존재하지 않습니다.');
    // 결과 · 이유 코드뿐이다. 글 칸 자체를 넘기지 않는다.
    expect(outcomes.recordMallOperationOutcome).toHaveBeenCalledWith({
      mallKey: 'kidsnote',
      operation: 'login_test',
      outcome: 'attention',
      reasonCode: 'login_form_remains',
    });
    expect(JSON.stringify(outcomes.recordMallOperationOutcome.mock.calls)).not.toContain('abc123');
  });

  it('never sends the password anywhere but the extension call', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({ success: true, submitted: true, verified: true });

    await runTest();

    expect(extension.testMallLoginViaExtension).toHaveBeenCalledWith('kidsnote', {
      loginId: 'seller',
      password: 'secret-pw',
      siteUrl: 'https://shop.kidsnote.com',
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
