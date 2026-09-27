import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const KAKAO_LISTINGS_URL = 'https://shopping-seller.kakao.com/product/store-seller/list';
export const KAKAO_LISTINGS_FILE = 'content/orders/kakao-listings.js';

/**
 * 카카오 톡스토어 판매자센터. 채울 로그인 폼이 없는 몰(카카오 계정 토큰, 결정 #3)이라 카카오 로그인(accounts.kakao.com)으로
 * 넘어가면 멈추고 운영자가 그 탭에서 로그인한다. 카카오 주문은 범위 밖이다.
 */
export const KAKAO_LISTINGS_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['shopping-seller.kakao.com']),
  isLogin: (url) => hostWithin(url, ['kakao.com']) && (url.hostname.toLowerCase().startsWith('accounts.') || /login/i.test(url.pathname)),
  loginMessage: '카카오 톡스토어 로그인이 필요합니다. 열린 카카오 톡스토어 화면에서 로그인한 뒤 다시 가져와 주세요.',
};

/** 카카오 톡스토어 등록 상품 목록(KID-381) — 목록 API를 100개씩 0쪽부터(옛 읽기기 그대로). */
export function createKakaoListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'kakao',
      displayName: '카카오 톡스토어',
      startUrl: KAKAO_LISTINGS_URL,
      file: KAKAO_LISTINGS_FILE,
      call: 'kakao.listings',
      guard: KAKAO_LISTINGS_GUARD,
    }, plan),
  };
}

registerSite({ name: 'kakao', create: (deps) => createKakaoListings(deps.tabs) });
