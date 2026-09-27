import { describe, expect, it } from 'vitest';
import { MALL_ADMIN_LISTING_MALL_KEYS, mallListingSiteCapability } from '@kiditem/shared/mall-admin-listings';
import { MALL_ORDER_OPERATION_MALLS, mallOrderSiteCapability } from '@kiditem/shared/orders-operations';
import { siteFactoryFor } from '../sites/registry';
import './index';
import { mallSiteCapabilities } from './mall-site-capabilities';

describe('mall site capabilities (KID-380 T4)', () => {
  it('ping은 이 빌드가 사이트를 가진 몰마다 mallOrderSite.<몰>·mallListingSite.<몰>을 싣는다 — 옮긴 몰 전부', () => {
    const capabilities = mallSiteCapabilities();
    for (const mallKey of MALL_ORDER_OPERATION_MALLS) {
      expect(capabilities[mallOrderSiteCapability(mallKey)], mallKey).toBe(true);
    }
    for (const mallKey of MALL_ADMIN_LISTING_MALL_KEYS) {
      expect(capabilities[mallListingSiteCapability(mallKey)], mallKey).toBe(true);
    }
    expect(capabilities['mallOrderSite.kakao']).toBeUndefined();
  });

  it('사이트가 없는 몰은 싣지 않는다 — 옛 빌드가 그 몰을 돌 수 있다고 말하지 않게', () => {
    const capabilities = mallSiteCapabilities((name) => (name === 'kidkids' ? siteFactoryFor(name) : null));
    expect(capabilities).toEqual({ 'mallOrderSite.kidkids': true, 'mallListingSite.kidkids': true });
  });
});
