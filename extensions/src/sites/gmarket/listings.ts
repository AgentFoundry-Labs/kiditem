import { readMallListings } from '../mall-listings';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 지마켓 · 옥션이 함께 쓰는 ESM Plus 상품 조회/수정 화면과 처리기(옥션 `sites/auction/listings.ts`도 이것을 쓴다). */
export const ESM_LISTINGS_URL = 'https://item.esmplus.com/goods/list';
export const ESM_LISTINGS_FILE = 'content/orders/esm-listings.js';

/**
 * ESM Plus. 로그인 폼 명세가 없는 몰(결정 #3)이라 로그인 화면(signin.esmplus.com)이면 멈추고 운영자가 그 탭에서 로그인한다.
 */
export function esmListingsGuard(displayName: string): PageGuard {
  return {
    allows: (url) => hostWithin(url, ['esmplus.com']),
    isLogin: (url) => hostWithin(url, ['esmplus.com']) && (url.hostname.toLowerCase().startsWith('signin.') || /login|signin/i.test(url.pathname)),
    loginMessage: `${displayName} 로그인이 필요합니다. 열린 ESM Plus 화면에서 로그인한 뒤 다시 가져와 주세요.`,
  };
}

/** ESM Plus 마스터 목록을 500개씩 끝까지 읽어 plan의 몰(gmarket · auction)에 올라간 것만 고른다(옛 읽기기 그대로, KID-381). */
export function createEsmListings(tabs: TabPages, mallKey: 'gmarket' | 'auction', displayName: string) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey,
      displayName,
      startUrl: ESM_LISTINGS_URL,
      file: ESM_LISTINGS_FILE,
      call: 'esm.listings',
      guard: esmListingsGuard(displayName),
    }, plan),
  };
}

registerSite({ name: 'gmarket', create: (deps) => createEsmListings(deps.tabs, 'gmarket', '지마켓') });
