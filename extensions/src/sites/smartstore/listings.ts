import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const SMARTSTORE_LISTINGS_URL = 'https://sell.smartstore.naver.com/#/products/origin-list';
export const SMARTSTORE_LISTINGS_FILE = 'content/orders/smartstore-listings.js';

/**
 * 스마트스토어센터. 로그인 폼 명세가 없는 몰(결정 #3)이라 네이버 로그인(accounts.commerce.naver.com · nid.naver.com)으로
 * 넘어가면 멈추고 운영자가 그 탭에서 로그인한다.
 */
export const SMARTSTORE_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['sell.smartstore.naver.com']),
  isLogin: (url) => hostWithin(url, ['accounts.commerce.naver.com', 'nid.naver.com'])
    || (hostWithin(url, ['naver.com']) && /login/i.test(url.pathname)),
  loginMessage: '스마트스토어 로그인이 필요합니다. 열린 스마트스토어센터 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/** 스마트스토어 등록 상품 목록(KID-381) — 원상품 목록을 화면 안(MAIN)의 `$http`로 100개씩 0쪽부터(옛 읽기기 그대로). */
export function createSmartstoreListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'smartstore',
      displayName: '스마트스토어',
      startUrl: SMARTSTORE_LISTINGS_URL,
      file: SMARTSTORE_LISTINGS_FILE,
      call: 'smartstore.listings',
      world: 'main',
      guard: SMARTSTORE_LISTINGS_GUARD,
    }, plan),
  };
}

registerSite({ name: 'smartstore', create: (deps) => createSmartstoreListings(deps.tabs) });
