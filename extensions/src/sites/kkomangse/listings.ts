import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const KKOMANGSE_LISTINGS_URL = 'https://nstore.edupre.co.kr/subAdmin/_product.list.php';
export const KKOMANGSE_LISTINGS_FILE = 'content/orders/kkomangse-listings.js';

const isKkomangseLogin = (url: URL) => hostWithin(url, ['edupre.co.kr']) && /login/i.test(url.pathname);

/** 꼬망세 입점관리자. 로그인이 풀리면 로그인 화면으로 넘어간다. */
export const KKOMANGSE_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['edupre.co.kr']),
  isLogin: isKkomangseLogin,
  loginMessage: '꼬망세 로그인이 필요합니다. 열린 꼬망세 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/**
 * 꼬망세 로그인 입구(옛 `mall-session.js` kkomangse 줄: 주문 상품 목록이 로그인 입구). 몰 주문 읽기(KID-380)가 같은 명세를
 * `index.ts`에 두면 그쪽 하나로 합친다.
 */
export const KKOMANGSE_LOGIN: LoginSpec = {
  displayName: '꼬망세',
  loginUrl: 'https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000',
  hosts: ['edupre.co.kr'],
  isLoginUrl: isKkomangseLogin,
  fields: ['loginId', 'password'],
};

/** 꼬망세 등록 상품 목록(KID-381) — 배송상품 목록을 쪽 크기 10000으로 한 번에(옛 읽기기 그대로). */
export function createKkomangseListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'kkomangse',
      displayName: '꼬망세',
      startUrl: KKOMANGSE_LISTINGS_URL,
      file: KKOMANGSE_LISTINGS_FILE,
      call: 'kkomangse.listings',
      guard: KKOMANGSE_LISTINGS_GUARD,
    }, plan, signIn),
  };
}

registerSite({ name: 'kkomangse', create: (deps, lease) => createKkomangseListings(deps.tabs, createSiteSignIn(KKOMANGSE_LOGIN, lease.credentials, deps)) });
