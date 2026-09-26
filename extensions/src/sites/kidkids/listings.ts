import { readMallListings } from '../mall-listings';
import type { TabPages } from '../tab-page';
import { KIDKIDS_PAGE_GUARD } from './index';

export const KIDKIDS_LISTINGS_URL = 'https://partner.kidkids.net/sales/goods_list_renewal.htm?pNum=1';
export const KIDKIDS_LISTINGS_FILE = 'content/orders/kidkids-listings.js';

/** 키드키즈 등록 상품 목록(KID-363 L2) — 상품리스트 다운로드로 전체를 한 번에(옛 읽기기 그대로). */
export function createKidkidsListings(tabs: TabPages) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'kidkids',
      displayName: '키드키즈',
      startUrl: KIDKIDS_LISTINGS_URL,
      file: KIDKIDS_LISTINGS_FILE,
      call: 'kidkids.listings',
      guard: KIDKIDS_PAGE_GUARD,
    }, plan),
  };
}
