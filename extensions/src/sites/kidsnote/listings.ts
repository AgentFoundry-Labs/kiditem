import { readMallListings } from '../mall-listings';
import type { SiteSignIn } from '../site-login';
import type { TabPages } from '../tab-page';
import { KIDSNOTE_PAGE_GUARD } from './index';

export const KIDSNOTE_LISTINGS_URL = 'https://shop.kidsnote.com/_manage/?body=2010';
export const KIDSNOTE_LISTINGS_FILE = 'content/orders/kidsnote-listings.js';

/** 키즈노트 등록 상품 목록(KID-381) — 판매 상품 내역을 100개씩 전체 수만큼(옛 읽기기 그대로). */
export function createKidsnoteListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'kidsnote',
      displayName: '키즈노트',
      startUrl: KIDSNOTE_LISTINGS_URL,
      file: KIDSNOTE_LISTINGS_FILE,
      call: 'kidsnote.listings',
      guard: KIDSNOTE_PAGE_GUARD,
    }, plan, signIn),
  };
}
