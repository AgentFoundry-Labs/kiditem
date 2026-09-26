import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { SITE_VERIFICATION_REQUIRED, createCoupangShopSite, isExpectedShopUrl, toCatalog } from './index';

const TARGET = { sellerId: 'A100', sellerName: '말랑상회', sellerStoreUrl: 'https://shop.coupang.com/vid/A100', keyword: '슬라임' };
const product = (index: number) => ({ productId: `${index}`, itemId: null, vendorItemId: null, name: `상품 ${index}`, priceKrw: 1_000, reviewCount: 2, imageUrl: null,
  link: `https://www.coupang.com/vp/products/${index}` });

describe('coupang seller shop site (KID-362)', () => {
  it('sorts by newest, reads products up to the limit, and closes its tab', async () => {
    const asked: string[] = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        if (!injected) return { ok: false, error: 'content_script_missing' };
        asked.push(String(message.type));
        return message.type === 'KIDITEM_COUPANG_SHOP_SORT_NEWEST'
          ? { ok: true, clicked: true }
          : { ok: true, sellerName: '말랑상회 본점', totalProductCount: 300, products: [product(1), { name: 'no id' }, product(2), product(3)] };
      },
    });
    const slept: number[] = [];
    const site = createCoupangShopSite(fake.tabs, { sleep: async (ms) => { slept.push(ms); } });
    const catalog = await site.catalog(TARGET, 2);
    await site.close();
    expect(asked).toEqual(['KIDITEM_COUPANG_SHOP_SORT_NEWEST', 'KIDITEM_COUPANG_SHOP_CATALOG']);
    expect(catalog).toMatchObject({ sellerId: 'A100', sellerName: '말랑상회 본점', keyword: '슬라임', totalProductCount: 300, collectedProductCount: 2, isTruncated: true, sort: 'newest' });
    expect(catalog.products.map((item) => [item.sourceRank, item.productId])).toEqual([[1, '1'], [2, '2']]);
    expect(slept).toEqual([1_200, 1_200]);
    expect(fake.log).toContain('close 7');
  });

  it('fails a seller whose newest sort or product list cannot be read', async () => {
    const noSort = fakeTabPages({ answer: () => ({ ok: true, clicked: false }) });
    await expect(createCoupangShopSite(noSort.tabs, { sleep: async () => undefined }).catalog(TARGET, 100)).rejects.toMatchObject({ code: SITE_REQUEST_FAILED });
    const empty = fakeTabPages({ answer: (message) => (message.type === 'KIDITEM_COUPANG_SHOP_SORT_NEWEST' ? { ok: true, clicked: true } : { ok: true, products: [] }) });
    await expect(createCoupangShopSite(empty.tabs, { sleep: async () => undefined }).catalog(TARGET, 100)).rejects.toMatchObject({ code: SITE_REQUEST_FAILED });
  });

  it('waits for the operator away from the shop, stops on login, and never opens other urls', async () => {
    const wall = fakeTabPages({ landAt: () => 'https://www.coupang.com/np/security', answer: () => ({ ok: true }), verificationClears: false });
    const site = createCoupangShopSite(wall.tabs, { sleep: async () => undefined });
    await expect(site.catalog(TARGET, 100)).rejects.toMatchObject({ code: SITE_VERIFICATION_REQUIRED });
    await site.close();
    expect(wall.log).not.toContain('close 7');
    const login = fakeTabPages({ landAt: () => 'https://login.coupang.com/login/login.pang', answer: () => ({ ok: true }) });
    await expect(createCoupangShopSite(login.tabs, { sleep: async () => undefined }).catalog(TARGET, 100)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(isExpectedShopUrl('https://shop.coupang.com/vid/A100', 'https://shop.coupang.com/vid/A100')).toBe(true);
    expect(isExpectedShopUrl('https://shop.coupang.com/vid/B200', 'https://shop.coupang.com/vid/A100')).toBe(false);
    expect(toCatalog({ ok: true, products: [] }, TARGET, 100)).toBeNull();
  });
});
