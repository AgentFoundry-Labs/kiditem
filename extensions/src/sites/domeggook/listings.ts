import { readMallListings } from '../mall-listings';
import type { TabPages } from '../tab-page';
import { DOMEGGOOK_PAGE_GUARD } from './index';

export const DOMEGGOOK_LISTINGS_URL = 'https://www.domeggook.com/sc/item/lstAll';
export const DOMEGGOOK_LISTINGS_FILE = 'content/orders/domeggook-listings.js';

/** 도매꾹 등록 상품 목록(KID-363 L2) — 목록 조회를 500개씩(옛 읽기기 그대로). */
export function createDomeggookListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'domeggook',
      displayName: '도매꾹',
      startUrl: DOMEGGOOK_LISTINGS_URL,
      file: DOMEGGOOK_LISTINGS_FILE,
      call: 'domeggook.listings',
      guard: DOMEGGOOK_PAGE_GUARD,
    }, plan),
  };
}
