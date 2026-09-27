import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const THIRTYMALL_LISTINGS_URL = 'https://partner.shopby.co.kr/product/list';
export const THIRTYMALL_LISTINGS_FILE = 'content/orders/thirtymall-listings.js';

/**
 * 떠리몰(샵바이 파트너 어드민). 로그인 폼 명세가 없는 몰(결정 #3)이라 로그인 화면(`/login`)이면 멈추고 운영자가 그 탭에서
 * 로그인한다. 파트너 쿠키가 없는 화면은 처리기가 `mall_login_required`로 답한다.
 */
export const THIRTYMALL_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['shopby.co.kr']),
  isLogin: (url) => hostWithin(url, ['shopby.co.kr']) && /login/i.test(url.pathname),
  loginMessage: '떠리몰 로그인이 필요합니다. 열린 떠리몰 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/** 떠리몰 등록 상품 목록(KID-381) — 상품 검색 API를 100개씩 1쪽부터 끝까지(옛 읽기기 그대로). */
export function createThirtymallListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'thirtymall',
      displayName: '떠리몰',
      startUrl: THIRTYMALL_LISTINGS_URL,
      file: THIRTYMALL_LISTINGS_FILE,
      call: 'thirtymall.listings',
      guard: THIRTYMALL_LISTINGS_GUARD,
    }, plan),
  };
}

registerSite({ name: 'thirtymall', create: (deps) => createThirtymallListings(deps.tabs) });
