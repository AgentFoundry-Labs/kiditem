import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const KIDSNOTE_LISTINGS_URL = 'https://shop.kidsnote.com/_manage/?body=2010';
export const KIDSNOTE_LISTINGS_FILE = 'content/orders/kidsnote-listings.js';

const isKidsnoteLogin = (url: URL) => hostWithin(url, ['kidsnote.com']) && /login/i.test(url.pathname + url.search);

/** 키즈노트 관리자. 로그인이 풀리면 로그인 주소로 넘어가거나 관리자 화면에 비밀번호 칸만 남는다(처리기가 본다). */
export const KIDSNOTE_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['kidsnote.com']),
  isLogin: isKidsnoteLogin,
  loginMessage: '키즈노트 로그인이 필요합니다. 열린 키즈노트 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/**
 * 키즈노트 로그인 입구(옛 `mall-session.js` kidsnote 줄: 주문 관리 화면이 로그인 입구). 몰 주문 읽기(KID-380)가 같은
 * 명세를 `index.ts`에 두면 그쪽 하나로 합친다.
 */
export const KIDSNOTE_LOGIN: LoginSpec = {
  displayName: '키즈노트',
  loginUrl: 'https://shop.kidsnote.com/_manage/?body=3010',
  hosts: ['kidsnote.com'],
  isLoginUrl: isKidsnoteLogin,
  fields: ['loginId', 'password'],
};

/** 키즈노트 등록 상품 목록(KID-381) — 판매 상품 내역을 100개씩 전체 수만큼(옛 읽기기 그대로). */
export function createKidsnoteListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'kidsnote',
      displayName: '키즈노트',
      startUrl: KIDSNOTE_LISTINGS_URL,
      file: KIDSNOTE_LISTINGS_FILE,
      call: 'kidsnote.listings',
      guard: KIDSNOTE_LISTINGS_GUARD,
    }, plan, signIn),
  };
}

registerSite({ name: 'kidsnote', create: (deps, lease) => createKidsnoteListings(deps.tabs, createSiteSignIn(KIDSNOTE_LOGIN, lease.credentials, deps)) });
