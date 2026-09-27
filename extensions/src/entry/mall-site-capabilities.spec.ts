import { describe, expect, it } from 'vitest';
import { MALL_ADMIN_LISTING_MALL_KEYS, mallListingSiteCapability } from '@kiditem/shared/mall-admin-listings';
import { MALL_ORDER_OPERATION_MALLS, mallOrderSiteCapability } from '@kiditem/shared/orders-operations';
import { findChannel } from '@kiditem/shared/channel-registry';
import { registeredMallWriters } from '../sites/mall-write/writer';
import { siteFactoryFor } from '../sites/registry';
import './index';
import { mallSiteCapabilities, mallWriteCapabilities } from './mall-site-capabilities';

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

describe('mall write capabilities (KID-256)', () => {
  it('ping은 이 빌드가 쓰기 모듈을 가진 몰마다 mallWriteSite.<몰>을 싣는다', () => {
    const capabilities = mallWriteCapabilities();
    expect(capabilities['mallWriteSite.domeggook']).toBe(true);
    expect(capabilities['mallWriteSite.sellpia']).toBeUndefined();
  });

  it('쓰기 모듈의 몰 키는 모두 채널 레지스트리 키다 — 옛 별칭(artgonggu·alwayz·gsshop·lotteon·esmplus·icecream·teacherville)은 없다(KID-250)', () => {
    const keys = Object.keys(mallWriteCapabilities()).map((capability) => capability.replace(/^mallWriteSite\./, ''));
    expect(keys.length).toBeGreaterThanOrEqual(19);
    for (const key of keys) expect(findChannel(key), key).toBeTruthy();
    for (const alias of ['artgonggu', 'alwayz', 'gsshop', 'lotteon', 'esmplus', 'icecream', 'teacherville']) expect(keys).not.toContain(alias);
  });

  it('등록 폼이 없어도 판매 상태 모듈만 있는 몰(옥션)과 쿠팡 윙도 싣는다', () => {
    const capabilities = mallWriteCapabilities();
    expect(capabilities['mallWriteSite.auction']).toBe(true);
    expect(capabilities['mallWriteSite.coupang']).toBe(true);
  });

  it('쓰기 모듈이 없는 몰은 싣지 않는다', () => {
    expect(mallWriteCapabilities([{ mallKey: 'onch' }])).toEqual({ 'mallWriteSite.onch': true });
  });
});

describe('몰 쓰기 [등록] 누르기 잠금(ADR-0019, KID-256)', () => {
  it('검증된 누르기(`custom.submit`)를 가진 몰은 쿠팡 윙 하나뿐이다 — 몰 폼 명세 몰은 모두 폼만 채운다', () => {
    const writers = registeredMallWriters();
    expect(writers.length).toBeGreaterThanOrEqual(19);
    expect(writers.filter((writer) => Boolean(writer.custom?.submit)).map((writer) => writer.mallKey)).toEqual(['coupang']);
  });
});
