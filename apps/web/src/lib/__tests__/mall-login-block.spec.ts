import { afterEach, describe, expect, it } from 'vitest';
import {
  blockMallAutoLogin,
  clearMallAutoLoginBlock,
  getMallLoginBlocks,
  isMallAutoLoginBlocked,
  mallAutoLoginBlock,
  resetMallLoginBlocksForTest,
  subscribeMallLoginBlocks,
} from '../mall-login-block';

afterEach(() => {
  resetMallLoginBlocksForTest();
  window.localStorage.clear();
});

describe('자동 로그인 차단', () => {
  it('⭐ 한 번 실패하면 막히고, 그 뒤로는 다시 시도하지 않는다는 표시가 남는다', () => {
    expect(isMallAutoLoginBlocked('onch')).toBe(false);
    blockMallAutoLogin('onch', '비밀번호가 맞지 않습니다.', 'login', 1_000);
    expect(isMallAutoLoginBlocked('onch')).toBe(true);
    expect(mallAutoLoginBlock('onch')).toEqual({
      mallKey: 'onch',
      at: 1_000,
      reason: '비밀번호가 맞지 않습니다.',
      kind: 'login',
    });
  });

  /** 로그인 문제와 인증 문제는 사람이 할 일이 다르다 — 화면도 다른 말을 해야 한다. */
  it('⭐ 인증(본인확인 · OTP · 캡차)으로 막힌 것은 로그인 문제와 따로 적는다', () => {
    blockMallAutoLogin('kidkids', '본인확인이 필요합니다.', 'verification', 2_000);
    expect(mallAutoLoginBlock('kidkids')?.kind).toBe('verification');
    blockMallAutoLogin('onch', '로그인 실패');
    expect(mallAutoLoginBlock('onch')?.kind).toBe('login');
  });

  it('사람이 직접 로그인하면 풀린다', () => {
    blockMallAutoLogin('onch', '로그인 실패');
    clearMallAutoLoginBlock('onch');
    expect(isMallAutoLoginBlocked('onch')).toBe(false);
    expect(getMallLoginBlocks()).toEqual([]);
  });

  it('⭐ 브라우저를 껐다 켜도 남는다 — 다시 켜자마자 또 시도하지 않게', () => {
    blockMallAutoLogin('kidsnote', '캡차가 떴습니다.', 'verification', 2_000);
    resetMallLoginBlocksForTest();
    expect(isMallAutoLoginBlocked('kidsnote')).toBe(true);
    expect(mallAutoLoginBlock('kidsnote')?.kind).toBe('verification');
  });

  it('구독자는 막히고 풀릴 때마다 듣는다 — 최근에 막힌 몰이 앞에 온다', () => {
    let calls = 0;
    const unsubscribe = subscribeMallLoginBlocks(() => {
      calls += 1;
    });
    blockMallAutoLogin('onch', '로그인 실패', 'login', 1_000);
    blockMallAutoLogin('kidsnote', '캡차', 'verification', 3_000);
    expect(getMallLoginBlocks().map((block) => block.mallKey)).toEqual(['kidsnote', 'onch']);
    clearMallAutoLoginBlock('onch');
    expect(calls).toBe(3);
    unsubscribe();
  });
});
