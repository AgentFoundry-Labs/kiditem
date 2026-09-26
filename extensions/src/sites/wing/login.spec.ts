import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps, type SiteLease } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import type { WingSite } from './index';
import './index';
import { WING_LOGIN } from './login';
import './reviews';

const XAUTH = 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth?client_id=wing';
const CREDENTIALS = { loginId: 'fake-wing-id', password: 'fake-wing-password' };
const WING_TAB = 3;

/** Wing 경계 가짜: 로그인 전에는 모든 요청이 401, 로그인 화면은 `fakeLoginScreen`. */
function wing(options: { credentials?: typeof CREDENTIALS | null; accept?: boolean; tabId?: number | null } = {}) {
  const login = fakeLoginScreen({ loginAt: XAUTH, ...(options.accept === false ? { accept: false } : {}) });
  const fake = fakeTabPages({ landAt: login.landAt, frames: login.frames, answer: (message) => login.answer(message) ?? { ok: false, error: 'unexpected' } });
  const sent: string[] = [];
  const clock = fastClock();
  const deps: SiteDeps = {
    tabs: fake.tabs,
    randomId: () => 'id',
    ...clock,
    cookies: { async get() { return login.state.signedIn ? { value: 'xsrf' } : null; } },
    async fetch(input) {
      sent.push(String(input));
      if (!login.state.signedIn) return new Response('', { status: 401 });
      return Response.json(String(input).includes('/review/search')
        ? { code: 'OK', data: { content: [], pagination: { totalPages: 0 } } }
        : { data: { productList: [], pagination: { page: 1, countPerPage: 500, totalCount: 0, totalPages: 0 } } });
    },
  };
  const lease: SiteLease = { tabId: options.tabId === undefined ? WING_TAB : options.tabId, credentials: options.credentials === undefined ? CREDENTIALS : options.credentials };
  return { login, fake, sent, deps, lease };
}

describe('wing 자동 로그인(KID-377)', () => {
  it('로그인 입구는 윙 첫 화면 → 판매자 로그인(xauth), 아이디·비밀번호 두 칸(사장님 2026-09-22 "자동로그인 만들어")', () => {
    expect(WING_LOGIN).toMatchObject({ loginUrl: 'https://wing.coupang.com/', hosts: ['wing.coupang.com', 'xauth.coupang.com'], fields: ['loginId', 'password'] });
    expect(WING_LOGIN.isLoginUrl(new URL(XAUTH))).toBe(true);
    expect(WING_LOGIN.isLoginUrl(new URL('https://wing.coupang.com/vendor-inventory/list'))).toBe(false);
  });

  it('카탈로그: 401이면 잠금이 연 윙 탭에서 로그인하고 같은 요청을 한 번 다시 한다', async () => {
    const { login, fake, sent, deps, lease } = wing();
    const site = siteFactoryFor('wing')!.create(deps, lease) as WingSite;
    await expect(site.searchInventory(1, null)).resolves.toMatchObject({ page: 1 });
    expect(login.state.filled).toEqual([{ loginId: 'fake-wing-id', password: 'fake-wing-password' }]);
    expect(sent).toHaveLength(2);
    expect(fake.log).toContain('navigate https://wing.coupang.com/ (continue on timeout)');
    expect(fake.log.some((line) => line.startsWith('open'))).toBe(false);
  });

  it('상품평: 같은 규칙 — 자격이 없으면 로그인하지 않고 SITE_LOGIN_REQUIRED{no_credentials}', async () => {
    const signedIn = wing();
    const reviews = siteFactoryFor('wing-reviews')!.create(signedIn.deps, signedIn.lease) as { searchReviews(input: { start: string; end: string; pageIndex: number }): Promise<unknown> };
    await expect(reviews.searchReviews({ start: '2026-09-01', end: '2026-09-26', pageIndex: 0 })).resolves.toMatchObject({ items: [] });
    expect(signedIn.login.state.filled).toHaveLength(1);

    const none = wing({ credentials: null });
    const blocked = siteFactoryFor('wing-reviews')!.create(none.deps, none.lease) as typeof reviews;
    await expect(blocked.searchReviews({ start: '2026-09-01', end: '2026-09-26', pageIndex: 0 }))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'no_credentials' } });
    expect(none.login.state.filled).toEqual([]);
  });

  it('잠금 탭이 없으면 새 탭에서 로그인하고, 로그인되면 그 탭을 닫는다 / 거절이면 남긴다', async () => {
    const ok = wing({ tabId: null });
    await (siteFactoryFor('wing')!.create(ok.deps, ok.lease) as WingSite).searchInventory(1, null);
    expect(ok.fake.log).toContain('open about:blank');
    expect(ok.fake.log).toContain('close 7');

    const rejected = wing({ tabId: null, accept: false });
    await expect((siteFactoryFor('wing')!.create(rejected.deps, rejected.lease) as WingSite).searchInventory(1, null))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'credentials_rejected' } });
    expect(rejected.fake.log).not.toContain('close 7');
  });
});
