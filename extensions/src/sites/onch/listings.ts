import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const ONCH_LISTINGS_URL = 'https://www.onch3.co.kr/products_management.php';
export const ONCH_LISTINGS_FILE = 'content/orders/onch-listings.js';

const isOnchLogin = (url: URL) => hostWithin(url, ['onch3.co.kr']) && /login/i.test(url.pathname);

/** 온채널 공급사. 로그아웃이면 `/login/login_web.php`로 넘어간다(2026-09-12 실측). */
export const ONCH_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['onch3.co.kr']),
  isLogin: isOnchLogin,
  loginMessage: '온채널 로그인이 필요합니다. 열린 온채널 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/**
 * 온채널 로그인 입구(옛 `mall-session.js` onch 줄: 공급사 주문 목록이 로그인 입구). 몰 주문 읽기(KID-380)가 같은 명세를
 * `index.ts`에 두면 그쪽 하나로 합친다.
 */
export const ONCH_LOGIN: LoginSpec = {
  displayName: '온채널',
  loginUrl: 'https://www.onch3.co.kr/supplier/orders.php?state=all',
  hosts: ['onch3.co.kr'],
  isLoginUrl: isOnchLogin,
  fields: ['loginId', 'password'],
};

/** 온채널 등록 상품 목록(KID-381) — 등록 상품 관리 화면을 15줄씩 끝 쪽까지(옛 읽기기 그대로). */
export function createOnchListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'onch',
      displayName: '온채널',
      startUrl: ONCH_LISTINGS_URL,
      file: ONCH_LISTINGS_FILE,
      call: 'onch.listings',
      guard: ONCH_LISTINGS_GUARD,
    }, plan, signIn),
  };
}

registerSite({ name: 'onch', create: (deps, lease) => createOnchListings(deps.tabs, createSiteSignIn(ONCH_LOGIN, lease.credentials, deps)) });
