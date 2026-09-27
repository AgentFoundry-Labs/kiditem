import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import { withFreshTab } from './fresh-tab';
import type { SiteSignIn } from './site-login';
import { fakeTabPages } from './tab-page.fake';

const signIn = (hosts: readonly string[]): SiteSignIn => ({
  hosts,
  isLoginUrl: (url) => url.includes('/login'),
  onPage: (_page, _returnTo, read) => read(),
  beforeTab: (_tabs, call) => call(),
});

describe('sites/fresh-tab — withFreshTab의 알림 창 가드(KID-380 D4)', () => {
  it('주소를 옮기기 전에 로그인 호스트의 가드를 걸고, 읽기가 끝나면 푼다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logBookkeeping: true });
    await expect(withFreshTab(fake.tabs, 'https://mall.test/orders', async () => 'rows', { signIn: signIn(['mall.test']) })).resolves.toBe('rows');
    expect(fake.log).toEqual(['guard dialogs mall.test', 'open about:blank', 'navigate https://mall.test/orders', 'close 7', 'unguard dialogs mall.test']);
  });

  it('운영자에게 탭을 남겨도 가드는 푼다, dialogGuardHosts로 직접 줄 수 있다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logBookkeeping: true });
    await expect(withFreshTab(fake.tabs, 'https://mall.test/orders', async () => {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, '로그인');
    }, { dialogGuardHosts: ['mall.test'] })).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(fake.log).toEqual(['guard dialogs mall.test', 'open about:blank', 'navigate https://mall.test/orders', 'keep for https://mall.test 7', 'unguard dialogs mall.test']);
  });

  it('로그인 입구도 가드 호스트도 없으면 가드를 걸지 않는다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logBookkeeping: true });
    await withFreshTab(fake.tabs, 'https://mall.test/orders', async () => 'rows');
    expect(fake.log.some((line) => line.includes('guard'))).toBe(false);
  });
});

describe('sites/fresh-tab — 운영자에게 남긴 탭 다시 쓰기(KID-380 D8)', () => {
  it('지난 실행이 남긴 그 사이트 탭이 있으면 새 탭을 열지 않고 그 탭을 옮겨 쓴다 — 실패마다 로그인 탭이 쌓이지 않는다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logBookkeeping: true });
    const loginRequired = async () => {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, '로그인');
    };
    await expect(withFreshTab(fake.tabs, 'https://store.lotteon.com/cm/main/index_SO.wsp', loginRequired)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    await expect(withFreshTab(fake.tabs, 'https://store.lotteon.com/cm/main/index_SO.wsp', loginRequired)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    await expect(withFreshTab(fake.tabs, 'https://store.lotteon.com/cm/main/index_SO.wsp', async () => 'rows')).resolves.toBe('rows');
    expect(fake.log).toEqual([
      'open about:blank',
      'navigate https://store.lotteon.com/cm/main/index_SO.wsp',
      'keep for https://store.lotteon.com 7',
      'reclaim https://store.lotteon.com 7',
      'navigate https://store.lotteon.com/cm/main/index_SO.wsp',
      'keep for https://store.lotteon.com 7',
      'reclaim https://store.lotteon.com 7',
      'navigate https://store.lotteon.com/cm/main/index_SO.wsp',
      'close 7',
    ]);
  });
});

describe('sites/fresh-tab — 로그인 화면에 닿으면 다 그려지기를 기다리지 않는다(실기기 R1)', () => {
  it('로그인 입구가 있으면 그 로그인 주소를 멈출 곳으로 준다 — 느린 로그인 화면이 시간 초과로 탭을 닫지 않게', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://mall.test/login?next=orders', answer: () => ({ ok: true }) });
    await withFreshTab(fake.tabs, 'https://mall.test/orders', async () => 'rows', { signIn: signIn(['mall.test']) });
    expect(fake.stops).toEqual(['https://mall.test/login?next=orders']);
  });
});

describe('sites/fresh-tab — 본인확인·캡차에서 멈춘 로그인 탭(재QA 3 D1)', () => {
  it('로그인 단계가 verification_required로 멈추면 탭을 남기고 앞으로 가져온다 — 운영자가 그 탭에서 캡차를 푼다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }) });
    await expect(withFreshTab(fake.tabs, 'https://mall.test/orders', async () => {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, '로그인', { reason: 'verification_required' });
    })).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(fake.log).toEqual(['open about:blank', 'navigate https://mall.test/orders', 'focus 7']);

    const plain = fakeTabPages({ answer: () => ({ ok: true }) });
    await withFreshTab(plain.tabs, 'https://mall.test/orders', async () => {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, '로그인', { reason: 'no_credentials' });
    }).catch(() => undefined);
    expect(plain.log).not.toContain('focus 7');
  });
});
