import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const LOTTEON_LISTINGS_URL = 'https://store.lotteon.com/cm/main/index_SO.wsp';
export const LOTTEON_LISTINGS_FILE = 'content/orders/lotte-on-listings.js';
/** 롯데ON은 탭마다 로그인(sessionStorage 토큰)이라 열린 판매자센터 탭을 먼저 찾는다(옛 `borrowOpenTab`, KID-380 골격). */
export const LOTTEON_TAB_PATTERN = 'https://store.lotteon.com/*';

const isLotteonLogin = (url: URL) => hostWithin(url, ['lotteon.com']) && /login/i.test(url.pathname);

/** 롯데ON 판매자센터. 로그아웃이면 `login_SO.wsp`로 넘어간다. */
export const LOTTEON_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['lotteon.com']),
  isLogin: isLotteonLogin,
  loginMessage: '롯데ON 로그인이 필요합니다. 열린 롯데ON 판매자센터 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/**
 * 롯데ON 로그인 입구(옛 `mall-session.js` lotte-on 줄). `<form>` 없는 WebSquare 화면이지만 사용자ID/비밀번호 칸과 로그인
 * 링크가 있어 폼 채우기가 된다. 몰 주문 읽기(KID-380)가 같은 명세를 `index.ts`에 두면 그쪽 하나로 합친다.
 */
export const LOTTEON_LOGIN: LoginSpec = {
  displayName: '롯데ON',
  loginUrl: 'https://store.lotteon.com/cm/main/login_SO.wsp',
  hosts: ['lotteon.com'],
  isLoginUrl: isLotteonLogin,
  fields: ['loginId', 'password'],
};

/**
 * 롯데ON 등록 상품 목록(KID-381) — 판매자센터 화면 안(MAIN)에서 화면 함수로 요청 머리를 붙여 우리 거래처로 좁힌 상품 조회를
 * 100개씩(옛 읽기기 그대로). 열린 판매자센터 탭이 있으면 그 탭에서 읽고 닫지 않는다.
 */
export function createLotteonListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'lotte-on',
      displayName: '롯데ON',
      startUrl: LOTTEON_LISTINGS_URL,
      file: LOTTEON_LISTINGS_FILE,
      call: 'lotte-on.listings',
      world: 'main',
      reuseTabMatching: LOTTEON_TAB_PATTERN,
      guard: LOTTEON_LISTINGS_GUARD,
    }, plan, signIn),
  };
}

registerSite({ name: 'lotte-on', create: (deps, lease) => createLotteonListings(deps.tabs, createSiteSignIn(LOTTEON_LOGIN, lease.credentials, deps)) });
