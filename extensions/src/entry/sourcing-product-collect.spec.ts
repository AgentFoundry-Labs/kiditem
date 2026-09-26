import { describe, expect, it } from 'vitest';
import { productExtensionScope } from './sourcing-product-collect';
import { createSiteHandles } from './site-handles';
import { PRODUCT_TAB_REQUIRED } from '../sites/product-page';
import '../collectors/sourcing.product_extension';
import '../collectors/sourcing.trend_1688';
import '../collectors/sourcing.wing_catalog';
import '../sites/1688';
import '../sites/product-page';
import '../sites/wing/pre-matching-search';

const noTabs = {
  open: async () => { throw new Error('no tabs'); },
  attach: () => { throw new Error('no tabs'); },
  find: async () => null,
  fetchText: async () => null,
};
const siteDeps = { fetch: async () => new Response('{}'), cookies: { get: async () => null }, now: () => 0, sleep: async () => undefined, tabs: noTabs, randomId: () => 'x' };

describe('sourcing entry wiring (KID-360)', () => {
  it('maps a popup tab URL to the product_extension scope, and only 1688·Alibaba https pages', () => {
    expect(productExtensionScope('https://detail.1688.com/offer/1.html')).toEqual({ platform: '1688', url: 'https://detail.1688.com/offer/1.html' });
    expect(productExtensionScope('https://www.alibaba.com/product-detail/x.html')).toMatchObject({ platform: 'alibaba' });
    expect(productExtensionScope('http://detail.1688.com/offer/1.html')).toBeNull();
    expect(productExtensionScope('https://www.coupang.com/')).toBeNull();
    expect(productExtensionScope(undefined)).toBeNull();
  });

  it('assembles a site handle per collector site and refuses a product collection without the operator tab', async () => {
    const handles = (kind: string) => createSiteHandles(siteDeps)(kind as never, { tabId: null });
    expect(handles('sourcing.wing_catalog')).toMatchObject({ searchPage: expect.any(Function), toObservation: expect.any(Function) });
    expect(handles('sourcing.trend_1688')).toMatchObject({ offers: expect.any(Function), close: expect.any(Function) });
    expect(handles('test.echo')).toBeNull();
    await expect((handles('sourcing.product_extension') as { extract(url: string): Promise<unknown> }).extract('https://detail.1688.com/offer/1.html'))
      .rejects.toMatchObject({ code: PRODUCT_TAB_REQUIRED });
  });
});
