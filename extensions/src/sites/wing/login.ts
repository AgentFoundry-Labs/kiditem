import type { SiteCaller, SiteRequestInit } from '../../core/site-caller';
import type { SiteDeps, SiteLease } from '../registry';
import { createSiteLoginGate, ensureLoggedIn, withLoginTab, type LoginOutcome, type LoginSpec } from '../site-login';
import { hostWithin, type TabPage } from '../tab-page';

/**
 * 쿠팡 윙 로그인 입구(옛 `mall-session.js` `coupang` 줄, 사장님 2026-09-22 "자동로그인 만들어"). 로그아웃 상태로 윙 첫 화면에
 * 들어가면 판매자 로그인(`xauth.coupang.com`, Keycloak)으로 넘어간다 — 두 주소 모두 manifest 권한에 있다. 웹은 몰 키
 * `coupang`의 저장 비밀번호를 보낸다. 로그인한 뒤의 윙은 무거워 폼이 사라졌는지 확인하지 못할 수 있다 — 그때는 몰의
 * 말이 없으므로 웹이 막지 않는다.
 */
export const WING_LOGIN: LoginSpec = {
  displayName: '쿠팡 윙',
  loginUrl: 'https://wing.coupang.com/',
  hosts: ['wing.coupang.com', 'xauth.coupang.com'],
  isLoginUrl: (url) => hostWithin(url, ['xauth.coupang.com']) || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(url.pathname),
  fields: ['loginId', 'password'],
};

/**
 * 윙 호출기에 자동 로그인을 건다(KID-377). 윙 요청은 서비스워커 fetch라 탭이 없다 — 401·403·로그인 리다이렉트·XSRF
 * 쿠키 없음(`SITE_LOGIN_REQUIRED`)이면 `account:` 잠금이 연 윙 탭(없으면 새 탭)에서 로그인하고 같은 요청을 한 번 다시 한다.
 * 새로 연 탭은 다시 묻기가 되면 닫는다 — 그래도 로그인 화면이면 운영자가 그 탭에서 로그인한다.
 */
export function wingCallerWithLogin(caller: SiteCaller, deps: Pick<SiteDeps, 'tabs' | 'now' | 'sleep'>, lease: SiteLease): SiteCaller {
  const credentials = lease.credentials;
  const withLogin = createSiteLoginGate(credentials);
  const login = (page: TabPage): Promise<LoginOutcome> =>
    credentials ? ensureLoggedIn(page, WING_LOGIN, credentials, deps) : Promise.resolve({ status: 'unconfirmed' });
  // 잠금 탭이 있으면 그 탭에서(닫는 것은 브라우저 자원), 없으면 새 탭에서 로그인하고 다시 묻기가 되면 닫는다.
  const gate = (call: () => Promise<unknown>) => (lease.tabId !== null
    ? withLogin(call, () => login(deps.tabs.attach(lease.tabId!)))
    : withLoginTab(withLogin, call, () => deps.tabs.open('about:blank'), login));
  return {
    json: <T>(url: string, init?: SiteRequestInit) => gate(() => caller.json<T>(url, init)) as Promise<T>,
    text: (url, init) => gate(() => caller.text(url, init)) as Promise<string>,
    bytes: (url, init) => gate(() => caller.bytes(url, init)) as Promise<Uint8Array>,
  };
}
