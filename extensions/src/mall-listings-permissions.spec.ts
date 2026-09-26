import { describe, expect, it } from 'vitest';
import { MALL_ADMIN_LISTING_READERS, type MallAdminListingMallKey } from '@kiditem/shared/mall-admin-listings';
import manifestSource from '../kiditem-os/manifest.json?raw';
import { ST11_LISTINGS_URL } from './sites/11st/listings';
import { ALWAYS_LISTINGS_URL } from './sites/always/listings';
import { ESM_LISTINGS_URL } from './sites/gmarket/listings';
import { KAKAO_LISTINGS_URL } from './sites/kakao/listings';
import { KIDSNOTE_LISTINGS_URL } from './sites/kidsnote/listings';
import { KKOMANGSE_LISTINGS_URL } from './sites/kkomangse/listings';
import { LOTTEON_LISTINGS_URL } from './sites/lotte-on/listings';
import { ONCH_LISTINGS_URL } from './sites/onch/listings';
import { SMARTSTORE_LISTINGS_URL } from './sites/smartstore/listings';
import { TEACHER_LISTINGS_URL } from './sites/teacher-mall/listings';
import { THIRTYMALL_LISTINGS_URL } from './sites/thirtymall/listings';

// 옮긴 몰(KID-381)의 목록 시작 화면이 계약의 관리자 주소이고 확장 권한 안인가 — 지운 옛 스위트(`mall-admin-listings.test.mjs`)의
// 잠금. 권한 밖 호스트에 주입하면 Chrome이 실행을 죽이고, 계약 origin과 다르면 서버 plan이 거절한다.
const START_URLS: Record<string, string> = {
  onch: ONCH_LISTINGS_URL,
  kkomangse: KKOMANGSE_LISTINGS_URL,
  always: ALWAYS_LISTINGS_URL,
  thirtymall: THIRTYMALL_LISTINGS_URL,
  kidsnote: KIDSNOTE_LISTINGS_URL,
  '11st': ST11_LISTINGS_URL,
  gmarket: ESM_LISTINGS_URL,
  auction: ESM_LISTINGS_URL,
  kakao: KAKAO_LISTINGS_URL,
  'lotte-on': LOTTEON_LISTINGS_URL,
  smartstore: SMARTSTORE_LISTINGS_URL,
  'teacher-mall': TEACHER_LISTINGS_URL,
};
/** 처리기가 목록 화면 밖에서 부르는 API 호스트. */
const API_HOSTS: Record<string, string[]> = {
  always: ['https://alwayz-seller-back.ilevit.com'],
  'lotte-on': ['https://soapi.lotteon.com'],
};

describe('mall admin listing hosts (KID-381)', () => {
  it('몰마다 시작 화면이 계약의 관리자 주소(origin)이고, 그 주소와 처리기의 API 호스트가 확장 권한에 있다', () => {
    const hostPermissions = (JSON.parse(manifestSource) as { host_permissions: string[] }).host_permissions;
    expect(Object.keys(START_URLS).sort()).toEqual(
      Object.keys(MALL_ADMIN_LISTING_READERS).filter((mallKey) => !['kidkids', 'icecream-mall', 'art09', 'domeggook'].includes(mallKey)).sort(),
    );
    for (const [mallKey, startUrl] of Object.entries(START_URLS)) {
      const origin = MALL_ADMIN_LISTING_READERS[mallKey as MallAdminListingMallKey].origin;
      expect(new URL(startUrl).origin, mallKey).toBe(origin);
      for (const host of [origin, ...(API_HOSTS[mallKey] ?? [])]) {
        expect(hostPermissions, `${mallKey} ${host}`).toContain(`${host}/*`);
      }
    }
  });
});
