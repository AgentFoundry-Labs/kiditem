import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { SITE_VERIFICATION_REQUIRED, createCoupangProductSite, isExpectedProductUrl, parseSellerShopLink } from './index';

const LINK = 'https://www.coupang.com/vp/products/101?vendorItemId=v-101';
const deps = () => {
  const slept: number[] = [];
  return { slept, deps: { sleep: async (ms: number) => { slept.push(ms); }, random: () => 0 } };
};

describe('coupang product seller site (KID-362)', () => {
  it('parses the seller shop link like the old detail helper', () => {
    expect(parseSellerShopLink({ href: 'https://shop.coupang.com/vid/A00123', text: ' 말랑상회 판매자 상품 보러가기 ' }))
      .toEqual({ sellerName: '말랑상회', sellerId: 'A00123', sellerStoreUrl: 'https://shop.coupang.com/vid/A00123' });
    expect(parseSellerShopLink({ href: 'https://shop.coupang.com/A1', text: '쿠팡' })).toBeNull();
    expect(parseSellerShopLink({ href: 'https://www.coupang.com/A1', text: '판매자명' })).toBeNull();
    expect(isExpectedProductUrl('https://www.coupang.com/vp/products/101?vendorItemId=v-101&q=x', LINK)).toBe(true);
    expect(isExpectedProductUrl('https://www.coupang.com/vp/products/101?vendorItemId=v-999', LINK)).toBe(false);
  });

  it('reads one product per navigation in one tab, retries once after render wait, waits 0.9s between products, and closes the tab', async () => {
    let asks = 0;
    const fake = fakeTabPages({
      answer: (_message, injected) => {
        if (!injected) return { ok: false, error: 'content_script_missing' };
        asks += 1;
        return asks === 1 ? { ok: true, seller: null } : { ok: true, seller: { href: 'https://shop.coupang.com/vid/S1', text: '판매자 하나' } };
      },
    });
    const clock = deps();
    const site = createCoupangProductSite(fake.tabs, clock.deps);
    await expect(site.sellerIdentity(LINK, { label: 'a' })).resolves.toEqual({ sellerName: '판매자 하나', sellerId: 'S1', sellerStoreUrl: 'https://shop.coupang.com/vid/S1' });
    await site.sellerIdentity(LINK, { label: 'b' });
    await site.close();
    expect(clock.slept).toEqual([1_200, 1_200, 900, 1_200]);
    expect(fake.log.filter((line) => line.startsWith('open') || line.startsWith('close'))).toEqual(['open about:blank', 'close 7']);
  });

  it('waits for the operator on a security page and gives up with SITE_VERIFICATION_REQUIRED, keeping the tab', async () => {
    const attention: unknown[] = [];
    const fake = fakeTabPages({ landAt: () => 'https://www.coupang.com/np/security', answer: () => ({ ok: true, seller: null }), verificationClears: false });
    const site = createCoupangProductSite(fake.tabs, deps().deps);
    await expect(site.sellerIdentity(LINK, { label: '상품', onAttention: (value) => { attention.push(value); } })).rejects.toMatchObject({ code: SITE_VERIFICATION_REQUIRED });
    await site.close();
    expect(attention).toEqual([{ kind: 'verification', site: '쿠팡', label: '상품' }, { kind: 'verification', site: '쿠팡', label: '상품' }]);
    expect(fake.log).not.toContain('close 7');

    const login = fakeTabPages({ landAt: () => 'https://login.coupang.com/login/login.pang', answer: () => ({ ok: true }) });
    await expect(createCoupangProductSite(login.tabs, deps().deps).sellerIdentity(LINK, { label: '상품' })).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
  });
});
