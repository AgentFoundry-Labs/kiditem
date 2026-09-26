import { readMallListings } from '../mall-listings';
import type { SiteSignIn } from '../site-login';
import type { TabPages } from '../tab-page';
import { LOTTE_ON_PAGE_GUARD, LOTTE_ON_TAB_PATTERN } from './index';

export const LOTTEON_LISTINGS_URL = 'https://store.lotteon.com/cm/main/index_SO.wsp';
export const LOTTEON_LISTINGS_FILE = 'content/orders/lotte-on-listings.js';

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
      reuseTabMatching: LOTTE_ON_TAB_PATTERN,
      guard: LOTTE_ON_PAGE_GUARD,
    }, plan, signIn),
  };
}
