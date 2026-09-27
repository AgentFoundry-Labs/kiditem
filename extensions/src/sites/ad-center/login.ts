import { callPage } from '../page-call';
import { LOGIN_FILL_FILE, type LoginDeps, type LoginSpec } from '../site-login';
import { hostWithin, type PageGuard, type TabPage } from '../tab-page';
import { WING_LOGIN } from '../wing/login';

/**
 * 쿠팡 광고센터 로그인 입구(KID-371). 로그아웃 상태로 `/marketing`에 들어가면 광고센터 `/user/login`(계정 유형 선택)으로
 * 넘어가고, 거기서 "쿠팡 wing 로그인"을 누르면 판매자 로그인(`xauth.coupang.com`, Wing과 같은 Keycloak 폼)으로 간다 — 두 호스트
 * 모두 manifest 권한에 있다. 옛 광고 수집(`ads-report.js` attemptAdvertisingLoginAutoSubmit, `ad-center-collector.js`
 * externalLoginUrl)이 본 로그인 화면이 이 둘이다.
 *
 * 폼 칸은 Wing 로그인(`../wing/login`)과 같은 아이디·비밀번호 둘이고, 채우기는 공용 `login-fill.js`가 한다. 계정 유형 선택은
 * 옛 `ads-report.js`가 하던 이동 클릭을 `chooseWingAccount`(페이지 호출 `content/ad-center/account-choice.js`)가 한 번 한다 —
 * 자격증명은 싣지 않는다. 누를 버튼이 없거나 누른 뒤에도 폼이 오지 않으면 로그인 단계가 `login_unconfirmed`로 멈추고 탭을
 * 운영자에게 남긴다.
 */
export const AD_CENTER_LOGIN: LoginSpec = {
  displayName: '쿠팡 광고센터',
  loginUrl: 'https://advertising.coupang.com/marketing',
  hosts: ['advertising.coupang.com', 'xauth.coupang.com'],
  // 광고센터 쪽은 옛 `startsWith('/user/login')`처럼 넓게 본다.
  isLoginUrl: (url) => hostWithin(url, ['xauth.coupang.com']) || isAccountChoiceUrl(url),
  fields: WING_LOGIN.fields,
};

/** 계정 유형 선택 처리기(ISOLATED 페이지 호출, 읽고 한 번 누르기만). */
export const AD_CENTER_ACCOUNT_CHOICE_FILE = 'content/ad-center/account-choice.js';
const NAVIGATION_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 5_000;
/** 누른 뒤 xauth 폼을 기다리는 시간과 간격. */
const FORM_WAIT_MS = 15_000;
const FORM_POLL_MS = 500;

function isAccountChoiceUrl(url: URL): boolean {
  return url.hostname.toLowerCase() === 'advertising.coupang.com' && url.pathname.startsWith('/user/login');
}

function parsed(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const GUARD: PageGuard = {
  allows: (url) => hostWithin(url, AD_CENTER_LOGIN.hosts),
  isLogin: () => false,
  loginMessage: `${AD_CENTER_LOGIN.displayName} 로그인이 필요합니다.`,
};

/**
 * 로그인 폼을 채우기 전 단계: 탭을 로그인 화면으로 옮기고, 광고센터 계정 유형 선택 화면이면 "쿠팡 wing 로그인"을 한 번 누른 뒤
 * xauth 폼(비밀번호 칸)이 보일 때까지 기다린다. 던지지 않는다 — 폼이 오지 않으면 다음 단계(`ensureLoggedIn`)가 판정한다.
 */
export async function chooseWingAccount(page: TabPage, deps: LoginDeps): Promise<void> {
  const loginUrl = (value: string) => {
    const url = parsed(value);
    return url !== null && AD_CENTER_LOGIN.isLoginUrl(url);
  };
  let current = await page.currentUrl().catch(() => '');
  if (!loginUrl(current)) {
    current = await page.navigate(AD_CENTER_LOGIN.loginUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true, stopAt: loginUrl }).catch(() => '');
  }
  const url = parsed(current);
  if (!url || !isAccountChoiceUrl(url)) return;
  const answer = await callPage<{ state?: string }>(page, 'adCenter.chooseWingAccount', {}, {
    timeoutMs: CALL_TIMEOUT_MS,
    guard: GUARD,
    displayName: AD_CENTER_LOGIN.displayName,
    isolated: [AD_CENTER_ACCOUNT_CHOICE_FILE],
  }).catch(() => null);
  if (answer?.state !== 'clicked') return;
  const deadline = deps.now() + FORM_WAIT_MS;
  while (deps.now() < deadline) {
    const frames = await page.frames<{ loginForm?: boolean }>([LOGIN_FILL_FILE]).catch(() => []);
    if (frames.some((frame) => frame.result?.loginForm === true)) return;
    await deps.sleep(FORM_POLL_MS);
  }
}
