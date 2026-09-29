import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const extension = vi.hoisted(() => ({ testMallLoginViaExtension: vi.fn() }));
const accounts = vi.hoisted(() => ({ password: vi.fn(), list: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('../../order-collection/lib/order-collection-extension', () => extension);
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: accounts }));

import {
  blockMallAutoLogin,
  getMallLoginBlocks,
  isMallAutoLoginBlocked,
  resetMallLoginBlocksForTest,
} from '@/lib/mall-login-block';
import { useMallLoginTest } from './use-mall-login-test';

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
  });

  /**
   * 확인하지 못한 것을 '비밀번호 틀림'으로 굳히지 않는다. 지원 안 하는 몰 · 폼이 없거나 바뀐 몰 · 결과 미확인 ·
   * 로그인 페이지를 못 연 경우는 registry 문장으로 이유를 말하고 자동 로그인을 막지 않는다.
   */
  it.each([
    ['MALL_LOGIN_UNSUPPORTED', '이 몰은 자동 로그인을 지원하지 않습니다. 몰 화면에서 직접 로그인해 주세요.'],
    ['MALL_CONTRACT_CHANGED', '몰 화면이 바뀌어 읽지 못했습니다. 개발자에게 알려 주세요.'],
    ['MALL_LOGIN_UNCONFIRMED', '로그인 결과를 확인하지 못했습니다. 몰 화면에서 확인해 주세요.'],
    ['MALL_LOGIN_PAGE_UNREACHABLE', '몰 로그인 페이지를 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.'],
  ])('⭐ %s is could-not-check, told in the registry sentence, never a blocked password', async (errorCode, text) => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: errorCode === 'MALL_LOGIN_UNCONFIRMED',
      verified: false,
      errorCode,
    });

    const result = await runTest();

    expect(result?.outcome).toBe('unverified');
    expect(result?.detail).toBe(text);
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
  });

  it('⭐ blocks auto-login when the extension says the mall rejected the login', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      errorCode: 'MALL_LOGIN_REJECTED',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(result?.detail).toBe('몰이 로그인을 거절했습니다. 아이디와 비밀번호를 확인해 주세요.');
    expect(getMallLoginBlocks()).toEqual([expect.objectContaining({ mallKey: 'kidsnote', kind: 'login' })]);
  });

  it('⭐ waits for a person when the mall asks for verification, as a verification block', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      errorCode: 'SITE_VERIFICATION_REQUIRED',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(getMallLoginBlocks()).toEqual([expect.objectContaining({ mallKey: 'kidsnote', kind: 'verification' })]);
  });

  it('⭐ does not block when the extension itself failed (our side, not the password)', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: false,
      errorCode: 'SITE_REQUEST_FAILED',
      error: '사이트 요청이 실패했습니다.',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('failed');
    expect(result?.detail).toBe('사이트 요청이 실패했습니다. 잠시 뒤 다시 시도해 주세요.');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
  });

  it('clears the block after a login whose form went away', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true, submitted: true, verified: true, errorCode: null,
    });

    const result = await runTest();

    expect(result?.outcome).toBe('verified');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
  });

  /** 이미 로그인된 브라우저는 저장된 비밀번호를 넣어 보지 않았다 — 막아 둔 자동 로그인을 풀 근거가 아니다. */
  it('⭐ keeps a login block when the browser was already signed in, since no password was tried', async () => {
    blockMallAutoLogin('kidsnote', '몰이 아이디·비밀번호를 거부했습니다.');
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true, submitted: false, verified: true, errorCode: null,
    });

    const result = await runTest();

    expect(result?.outcome).toBe('unverified');
    expect(result?.detail).toBe('브라우저가 이미 로그인되어 있어 저장된 비밀번호를 확인하지 못했습니다.');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(true);
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
  });

  it('몰이 다른 말을 남기면 그대로 보여 주되 막지는 않는다', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '시스템 점검 중입니다.',
      errorCode: 'MALL_LOGIN_UNCONFIRMED',
    });

    const result = await runTest();

    expect(result?.outcome).toBe('unverified');
    expect(result?.detail).toContain('시스템 점검 중입니다.');
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(false);
  });

  it('⭐ 몰이 돌려준 말은 현재 결과에만 둔다', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '아이디(abc123)가 존재하지 않습니다.',
    });

    const result = await runTest();

    expect(result?.detail).toContain('아이디(abc123)가 존재하지 않습니다.');
  });

  it('never sends the password anywhere but the extension call', async () => {
    extension.testMallLoginViaExtension.mockResolvedValue({ success: true, submitted: true, verified: true });

    await runTest();

    expect(extension.testMallLoginViaExtension).toHaveBeenCalledWith('kidsnote', {
      loginId: 'seller',
      password: 'secret-pw',
      siteUrl: 'https://shop.kidsnote.com',
    });
    expect(extension.testMallLoginViaExtension).toHaveBeenCalledTimes(1);
  });
});
