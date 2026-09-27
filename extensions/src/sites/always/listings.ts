import { readMallListings } from '../mall-listings';
import type { TabPages } from '../tab-page';
import { ALWAYS_PAGE_GUARD } from './index';

export const ALWAYS_LISTINGS_URL = 'https://alwayzseller.ilevit.com/items/management';
export const ALWAYS_LISTINGS_FILE = 'content/orders/always-listings.js';

/**
 * 올웨이즈 등록 상품 목록(KID-381) — 전체 수를 읽고 1쪽부터 100개씩 목록 API를 화면 안에서(옛 읽기기 그대로). 로그인 폼
 * 명세가 없어(결정 #3) 로그인 문턱 없이 읽는다 — 로그인 화면이면 탭을 남긴다.
 */
export function createAlwaysListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'always',
      displayName: '올웨이즈',
      startUrl: ALWAYS_LISTINGS_URL,
      file: ALWAYS_LISTINGS_FILE,
      call: 'always.listings',
      guard: ALWAYS_PAGE_GUARD,
    }, plan),
  };
}
