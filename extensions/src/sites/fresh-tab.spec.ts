import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import { withFreshTab } from './fresh-tab';
import type { SiteSignIn } from './site-login';
import { fakeTabPages } from './tab-page.fake';

const signIn = (hosts: readonly string[]): SiteSignIn => ({
  hosts,
  onPage: (_page, _returnTo, read) => read(),
  beforeTab: (_tabs, call) => call(),
});

describe('sites/fresh-tab — withFreshTab의 알림 창 가드(KID-380 D4)', () => {
  it('주소를 옮기기 전에 로그인 호스트의 가드를 걸고, 읽기가 끝나면 푼다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logGuards: true });
    await expect(withFreshTab(fake.tabs, 'https://mall.test/orders', async () => 'rows', { signIn: signIn(['mall.test']) })).resolves.toBe('rows');
    expect(fake.log).toEqual(['guard dialogs mall.test', 'open about:blank', 'navigate https://mall.test/orders', 'close 7', 'unguard dialogs mall.test']);
  });

  it('운영자에게 탭을 남겨도 가드는 푼다, dialogGuardHosts로 직접 줄 수 있다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logGuards: true });
    await expect(withFreshTab(fake.tabs, 'https://mall.test/orders', async () => {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, '로그인');
    }, { dialogGuardHosts: ['mall.test'] })).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(fake.log).toEqual(['guard dialogs mall.test', 'open about:blank', 'navigate https://mall.test/orders', 'unguard dialogs mall.test']);
  });

  it('로그인 입구도 가드 호스트도 없으면 가드를 걸지 않는다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true }), logGuards: true });
    await withFreshTab(fake.tabs, 'https://mall.test/orders', async () => 'rows');
    expect(fake.log.some((line) => line.includes('guard'))).toBe(false);
  });
});
