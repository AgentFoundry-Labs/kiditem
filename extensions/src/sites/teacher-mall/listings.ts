import { readMallListings } from '../mall-listings';
import type { SiteSignIn } from '../site-login';
import type { TabPages } from '../tab-page';
import { TEACHER_MALL_PAGE_GUARD } from './index';

export const TEACHER_LISTINGS_URL = 'https://shop.teacherville.co.kr/selleradmin/goods/catalog';
export const TEACHER_LISTINGS_FILE = 'content/orders/teacher-mall-listings.js';

/** 티쳐몰 등록 상품 목록(KID-381) — 판매상품 목록을 100개씩 한 쪽이 덜 찰 때까지(옛 읽기기 그대로). */
export function createTeacherListings(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readListings: (plan: Record<string, unknown>) => readMallListings(tabs, {
      mallKey: 'teacher-mall',
      displayName: '티쳐몰',
      startUrl: TEACHER_LISTINGS_URL,
      file: TEACHER_LISTINGS_FILE,
      call: 'teacher-mall.listings',
      guard: TEACHER_MALL_PAGE_GUARD,
    }, plan, signIn),
  };
}
