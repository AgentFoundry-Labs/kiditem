import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const ST11_LISTINGS_URL = 'https://soffice.11st.co.kr/view/8006';
export const ST11_LISTINGS_FILE = 'content/orders/11st-listings.js';

/**
 * 11번가 셀러오피스. 로그인 폼 명세가 없는 몰(결정 #3)이라 로그인 화면(login.11st.co.kr)이면 멈추고 운영자가 그 탭에서
 * 로그인한다. 11번가 주문은 셀피아가 모아(KID-105) 이 몰의 주문 사이트는 없다 — 목록만 읽는다.
 */
export const ST11_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['11st.co.kr']),
  isLogin: (url) => hostWithin(url, ['11st.co.kr']) && (url.hostname.toLowerCase().startsWith('login.') || /login/i.test(url.pathname)),
  loginMessage: '11번가 로그인이 필요합니다. 열린 11번가 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/** 11번가 등록 상품 목록(KID-381) — 상품 목록 조회를 100개씩 한 쪽이 덜 찰 때까지(옛 읽기기 그대로). */
export function create11stListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: '11st',
      displayName: '11번가',
      startUrl: ST11_LISTINGS_URL,
      file: ST11_LISTINGS_FILE,
      call: '11st.listings',
      guard: ST11_LISTINGS_GUARD,
    }, plan),
  };
}

registerSite({ name: '11st', create: (deps) => create11stListings(deps.tabs) });
