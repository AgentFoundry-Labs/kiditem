import { readMallListings } from '../mall-listings';
import type { SiteSignIn } from '../site-login';
import type { TabPages } from '../tab-page';
import { KKOMANGSE_PAGE_GUARD } from './index';

export const KKOMANGSE_LISTINGS_URL = 'https://nstore.edupre.co.kr/subAdmin/_product.list.php';
export const KKOMANGSE_LISTINGS_FILE = 'content/orders/kkomangse-listings.js';

/** 꼬망세 등록 상품 목록(KID-381) — 배송상품 목록을 쪽 크기 10000으로 한 번에(옛 읽기기 그대로). */
export function createKkomangseListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'kkomangse',
      displayName: '꼬망세',
      startUrl: KKOMANGSE_LISTINGS_URL,
      file: KKOMANGSE_LISTINGS_FILE,
      call: 'kkomangse.listings',
      guard: KKOMANGSE_PAGE_GUARD,
    }, plan, signIn),
  };
}
