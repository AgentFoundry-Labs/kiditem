import { readMallListings } from '../mall-listings';
import type { SiteSignIn } from '../site-login';
import type { TabPages } from '../tab-page';
import { ONCH_PAGE_GUARD } from './index';

export const ONCH_LISTINGS_URL = 'https://www.onch3.co.kr/products_management.php';
export const ONCH_LISTINGS_FILE = 'content/orders/onch-listings.js';

/** 온채널 등록 상품 목록(KID-381) — 등록 상품 관리 화면을 15줄씩 끝 쪽까지(옛 읽기기 그대로). */
export function createOnchListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'onch',
      displayName: '온채널',
      startUrl: ONCH_LISTINGS_URL,
      file: ONCH_LISTINGS_FILE,
      call: 'onch.listings',
      guard: ONCH_PAGE_GUARD,
    }, plan, signIn),
  };
}
