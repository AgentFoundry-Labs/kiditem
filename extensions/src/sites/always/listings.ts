import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import type { SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const ALWAYS_LISTINGS_URL = 'https://alwayzseller.ilevit.com/items/management';
export const ALWAYS_LISTINGS_FILE = 'content/orders/always-listings.js';

/**
 * 올웨이즈 판매자센터. 로그인 폼 명세가 없는 몰(브라우저 저장소 JWT, 결정 #3)이라 로그인 화면이면 멈추고 운영자가 그 탭에서
 * 로그인한다. 토큰이 없는 화면은 처리기가 `mall_login_required`로 답한다.
 */
export const ALWAYS_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['ilevit.com']),
  isLogin: (url) => hostWithin(url, ['ilevit.com']) && /login|signin/i.test(url.pathname),
  loginMessage: '올웨이즈 로그인이 필요합니다. 열린 올웨이즈 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/**
 * 올웨이즈 등록 상품 목록(KID-381) — 전체 수를 읽고 1쪽부터 100개씩 목록 API를 화면 안에서(옛 읽기기 그대로). `signIn`은
 * 다른 몰 사이트와 같은 모양으로 합칠 수 있게만 받는다 — 올웨이즈는 로그인 폼 명세가 없어 등록은 넘기지 않는다(결정 #3).
 */
export function createAlwaysListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'always',
      displayName: '올웨이즈',
      startUrl: ALWAYS_LISTINGS_URL,
      file: ALWAYS_LISTINGS_FILE,
      call: 'always.listings',
      guard: ALWAYS_LISTINGS_GUARD,
    }, plan, signIn),
  };
}

registerSite({ name: 'always', create: (deps) => createAlwaysListings(deps.tabs) });
