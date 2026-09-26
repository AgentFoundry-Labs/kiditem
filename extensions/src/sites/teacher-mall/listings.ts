import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const TEACHER_LISTINGS_URL = 'https://shop.teacherville.co.kr/selleradmin/goods/catalog';
export const TEACHER_LISTINGS_FILE = 'content/orders/teacher-mall-listings.js';

const isTeacherLogin = (url: URL) => hostWithin(url, ['teacherville.co.kr']) && /login/i.test(url.pathname);

/** 티쳐몰 selleradmin. 로그인이 풀리면 로그인 화면으로 넘어가거나 목록 화면에 비밀번호 칸이 남는다(처리기가 본다). */
export const TEACHER_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['teacherville.co.kr']),
  isLogin: isTeacherLogin,
  loginMessage: '티쳐몰 로그인이 필요합니다. 열린 티쳐몰 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/**
 * 티쳐몰 로그인 입구(옛 `mall-session.js` teacher-mall 줄: 주문 목록이 로그인 입구). 몰 주문 읽기(KID-380)가 같은 명세를
 * `index.ts`에 두면 그쪽 하나로 합친다.
 */
export const TEACHER_LOGIN: LoginSpec = {
  displayName: '티쳐몰',
  loginUrl: 'https://shop.teacherville.co.kr/selleradmin/order/catalog',
  hosts: ['teacherville.co.kr'],
  isLoginUrl: isTeacherLogin,
  fields: ['loginId', 'password'],
};

/** 티쳐몰 등록 상품 목록(KID-381) — 판매상품 목록을 100개씩 한 쪽이 덜 찰 때까지(옛 읽기기 그대로). */
export function createTeacherListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'teacher-mall',
      displayName: '티쳐몰',
      startUrl: TEACHER_LISTINGS_URL,
      file: TEACHER_LISTINGS_FILE,
      call: 'teacher-mall.listings',
      guard: TEACHER_LISTINGS_GUARD,
    }, plan, signIn),
  };
}

registerSite({ name: 'teacher-mall', create: (deps, lease) => createTeacherListings(deps.tabs, createSiteSignIn(TEACHER_LOGIN, lease.credentials, deps)) });
