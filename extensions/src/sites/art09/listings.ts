import { readMallListings } from '../mall-listings';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const ART09_LISTINGS_URL = 'https://zzogzzog1.cafe24.com/disp/admin/shop1/product/ProductManage';
export const ART09_LISTINGS_FILE = 'content/orders/art09-listings.js';

/** 상품목록 화면이 아니면 로그인 화면이다(로그인이 풀리면 카페24가 로그인으로 넘긴다). */
export const ART09_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['cafe24.com']),
  isLogin: (url) => hostWithin(url, ['cafe24.com']) && !/\/product\/ProductManage$/i.test(url.pathname),
  loginMessage: '아트공구 로그인이 필요합니다. 열린 아트공구 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/** 아트공구(카페24) 등록 상품 목록(KID-363 L2) — 상품목록을 100개씩 끝까지(옛 읽기기 그대로). */
export function createArt09Listings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'art09',
      displayName: '아트공구',
      startUrl: ART09_LISTINGS_URL,
      file: ART09_LISTINGS_FILE,
      call: 'art09.listings',
      guard: ART09_LISTINGS_GUARD,
    }, plan),
  };
}
