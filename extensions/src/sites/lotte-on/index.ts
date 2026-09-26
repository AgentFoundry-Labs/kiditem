import { withFreshTab } from '../fresh-tab';
import { mallExcelRows, type MallExcelAnswer } from '../mall-excel';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 롯데ON 판매자센터 첫 화면. 로그아웃이면 `login_SO.wsp`로 넘어간다(2026-09-16 실측). */
export const LOTTE_ON_ORDER_URL = 'https://store.lotteon.com/cm/main/index_SO.wsp';
export const LOTTE_ON_LOGIN_URL = 'https://store.lotteon.com/cm/main/login_SO.wsp';
/** 판매자센터 탭 무늬 — 토큰이 탭별 sessionStorage라 열린 탭을 재사용한다(KID-380 결정 #5). */
export const LOTTE_ON_TAB_PATTERN = 'https://store.lotteon.com/*';
export const LOTTE_ON_ORDERS_FILE = 'content/page-call/lotte-on-orders.js';
/** 몰 상수(옛 worker.js `scrapeLotteonOrders` 값 그대로): 개인정보 다운로드 사유(saveDownloadReason). */
export const LOTTE_ON_DOWNLOAD_REASON = '배송을 위한 주문정보 다운로드';
/** 옛 수집기의 주입 제한 시간. */
const READ_TIMEOUT_MS = 120_000;
/** 옛 수집기가 로그인으로 읽던 실패 문장(`collectLotteonOrders`). */
const LOGIN_FAILURE = /로그인|인증|세션/;
const LOGIN_MESSAGE =
  '롯데ON 판매자센터 로그인이 필요합니다. 쇼핑몰 계정의 아이디·비밀번호를 확인하거나 롯데ON 에 직접 로그인한 뒤 다시 수집해 주세요.';

const isLotteOnLogin = (url: URL) => hostWithin(url, ['lotteon.com']) && /login_so|\/login(?:[/?#.]|$)/i.test(url.pathname);

export const LOTTE_ON_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['store.lotteon.com']),
  isLogin: isLotteOnLogin,
  loginMessage: LOGIN_MESSAGE,
};

/**
 * 롯데ON 로그인 입구(옛 `mall-session.js` lotte-on 줄, KID-380). `<form>` 없는 WebSquare 화면이지만 사용자ID·비밀번호 칸과
 * `<a id="mf_btn_login">로그인</a>`이 있어 폼 채우기가 된다(2026-09-01 DOM 확인).
 */
export const LOTTE_ON_LOGIN: LoginSpec = {
  displayName: '롯데ON',
  loginUrl: LOTTE_ON_LOGIN_URL,
  hosts: ['store.lotteon.com'],
  isLoginUrl: isLotteOnLogin,
  fields: ['loginId', 'password'],
};

/**
 * 롯데ON 주문 읽기(KID-380, `orders.mall_orders`, 옛 worker.js `collectLotteonOrders` 이식). soapi 토큰이 탭별
 * sessionStorage(`AuthToken`)라 열린 판매자센터 탭을 재사용한다(`withFreshTab` `reuseTabMatching` — 운영자 탭이라 옮기지도
 * 닫지도 않는다, 옛 `borrowOpenTab`). 읽기는 soapi 요청뿐이라 그 탭이 어느 판매자센터 화면에 있든 된다.
 * 열린 탭이 없으면 새 탭을 여는데, 새 탭에는 토큰이 없어 로그인 화면으로 넘어가므로 실행 자격으로 그 탭에서 한 번 로그인한 뒤
 * 읽는다(자격이 없으면 SITE_LOGIN_REQUIRED로 탭을 남긴다). ISOLATED 처리기(`content/page-call/lotte-on-orders.js`, 옛
 * `scrapeLotteonOrders`)가 다운로드 사유 등록 → 신규주문 엑셀 요청 → 파일을 받아 base64로 돌려준다. 읽기만 한다.
 */
export function createLotteOnSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readOrders(): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, LOTTE_ON_ORDER_URL, async (page) => {
        const answer = await callPage<MallExcelAnswer>(page, 'lotte-on.orders', { downloadReason: LOTTE_ON_DOWNLOAD_REASON }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: LOTTE_ON_PAGE_GUARD,
          isolated: [LOTTE_ON_ORDERS_FILE],
          displayName: '롯데ON',
        });
        const loginFailure = answer?.success !== true && LOGIN_FAILURE.test(answer?.error ?? '');
        return mallExcelRows(loginFailure ? { ...answer, pendingLogin: true, error: LOGIN_MESSAGE } : answer, {
          displayName: '롯데ON',
          url: LOTTE_ON_ORDER_URL,
          fileName: '롯데ON.xlsx',
        });
      }, { reuseTabMatching: LOTTE_ON_TAB_PATTERN, ...(signIn ? { signIn } : {}) });
    },
  };
}

registerSite({ name: 'lotte-on', create: (deps, lease) => createLotteOnSite(deps.tabs, createSiteSignIn(LOTTE_ON_LOGIN, lease.credentials, deps)) });
