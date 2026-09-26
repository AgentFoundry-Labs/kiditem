import { readMallListings } from '../mall-listings';
import type { TabPages } from '../tab-page';
import { ICECREAM_PAGE_GUARD } from './index';

export const ICECREAM_LISTINGS_URL = 'https://po.i-screammall.co.kr/goods/goodsMgmt.goodsMgmtView.do';
export const ICECREAM_LISTINGS_FILE = 'content/orders/icecream-listings.js';

/** 아이스크림몰 등록 상품 목록(KID-363 L2) — 목록 조회 + 상품마다 상세(고시 품명)를 읽는다(옛 읽기기 그대로). */
export function createIcecreamListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'icecream-mall',
      displayName: '아이스크림몰',
      startUrl: ICECREAM_LISTINGS_URL,
      file: ICECREAM_LISTINGS_FILE,
      call: 'icecream-mall.listings',
      guard: ICECREAM_PAGE_GUARD,
    }, plan),
  };
}
