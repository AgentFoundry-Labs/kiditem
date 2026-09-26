import { isMallAdminListingMallKey } from '@kiditem/shared/mall-admin-listings';
import { registerSite, siteFactoryFor } from '../registry';

/**
 * 몰 관리자 목록 라우터(KID-363 L2·KID-381). 수집기 `channels.mall_admin_listings`는 사이트를 하나만 선언하므로, 이 사이트가
 * plan의 몰 키로 그 몰 사이트(`sites/<mallKey>`, 목록 읽기는 `listings.ts`)를 찾아 준다 — 읽기기가 있는 몰
 * (`MALL_ADMIN_LISTING_READERS`)만. 같은 등록표의 다른 사이트(셀피아·윙)를 plan 값으로 부르지 못하게. 몰마다 탭을 스스로 열고 닫는다(`opensOwnTabs`).
 */
export const MALL_ADMIN_LISTINGS_SITE = 'mall-admin-listings';

registerSite({
  name: MALL_ADMIN_LISTINGS_SITE,
  opensOwnTabs: true,
  create: (deps, lease) => ({
    reader: (mallKey: string) => (isMallAdminListingMallKey(mallKey) ? siteFactoryFor(mallKey)?.create(deps, lease) ?? null : null),
  }),
});
