import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeTabPages } from '../tab-page.fake';
import { allowedSupplierUrl, parseDescriptionHtml } from './description';
import { PRODUCT_EXTRACTION_TIMEOUT, PRODUCT_PAGE_MOVED, createProductPageSite, productPageInjection } from './index';

const URL_1688 = 'https://detail.1688.com/offer/607635921546.html';

describe('product page site (KID-360)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers extraction on the operator tab, collects its events, enriches 1688 description, and never closes the tab', async () => {
    const fake = fakeTabPages({
      currentUrl: URL_1688,
      answer: (message, injected) => injected ? { ok: true, echo: message.attemptId } : { ok: false, error: 'content_script_missing' },
      fetchText: () => '<script>var offer_details={"content":"<p>아주 좋은 상품입니다</p><img src=\\"//cbu01.alicdn.com/a.jpg\\">"};</script>',
    });
    const site = createProductPageSite(fake.tabs, 42, { randomId: () => 'marker-1' });
    const extracting = site.extract(URL_1688);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emit({ type: 'PRODUCT_DATA', attemptId: 'other', data: { title: 'stranger' } });
    fake.emit({ type: 'PRODUCT_DATA', attemptId: 'marker-1', data: { title: '필통', source_platform: '1688', _detail_url: 'https://detail.1688.com/desc?x=1', source_url: URL_1688 } });
    fake.emit({ type: 'DESCRIPTION_DATA', attemptId: 'marker-1', data: { source_url: URL_1688, description_text: '설명' } });
    fake.emit({ type: 'EXTRACTION_COMPLETE', attemptId: 'marker-1', hadDescription: true });
    const document = await extracting;
    expect(document).toMatchObject({
      hadDescription: true,
      description: { description_text: '설명' },
      product: { title: '필통', description_images: ['https://cbu01.alicdn.com/a.jpg'], description_text: '아주 좋은 상품입니다' },
    });
    expect(fake.log).toContain('inject content/sourcing/extractors/common.js,content/sourcing/extractors/alibaba.js,content/sourcing/extractors/1688.js,content/sourcing/content.js,content/sourcing/extractors/1688-bridge.js');
    expect(fake.log).not.toContain('close 42');
  });

  it('finishes a search page on its product event without waiting for a description', async () => {
    const searchUrl = 'https://s.1688.com/selloffer/offer_search.htm?keywords=a';
    const fake = fakeTabPages({ currentUrl: searchUrl, answer: () => ({ ok: true }) });
    const extracting = createProductPageSite(fake.tabs, 42, { randomId: () => 'm' }).extract(searchUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emit({ type: 'PRODUCT_DATA', attemptId: 'm', data: { page_type: 'search', total_found: 3 } });
    await expect(extracting).resolves.toEqual({ product: { page_type: 'search', total_found: 3, source_url: searchUrl }, hadDescription: false });
  });

  it('refuses when the tab moved away from the frozen URL', async () => {
    const fake = fakeTabPages({ currentUrl: 'https://detail.1688.com/offer/1.html', answer: () => ({ ok: true }) });
    await expect(createProductPageSite(fake.tabs, 42, { randomId: () => 'm' }).extract(URL_1688)).rejects.toMatchObject({ code: PRODUCT_PAGE_MOVED });
  });

  it('fails after the old 20-second extraction limit when the page never completes, leaving the operator tab open', async () => {
    vi.useFakeTimers();
    const fake = fakeTabPages({ currentUrl: URL_1688, answer: () => ({ ok: true }) });
    const extracting = createProductPageSite(fake.tabs, 42, { randomId: () => 'm' }).extract(URL_1688);
    const outcome = expect(extracting).rejects.toMatchObject({ code: PRODUCT_EXTRACTION_TIMEOUT });
    await vi.advanceTimersByTimeAsync(19_999);
    let settled = false;
    void extracting.catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(fake.log).not.toContain('keep 42');
  });

  it('keeps the old supplier URL and description rules', () => {
    expect(allowedSupplierUrl('https://DETAIL.1688.com/x#frag')).toBe('https://detail.1688.com/x');
    expect(allowedSupplierUrl('http://detail.1688.com/x')).toBeNull();
    expect(allowedSupplierUrl('https://evil.example/x')).toBeNull();
    expect(parseDescriptionHtml('<div>짧음</div>')).toBeNull();
    expect(productPageInjection('https://www.alibaba.com/product-detail/x.html').main).toEqual(['content/sourcing/extractors/page-bridge.js']);
  });

  it('keeps the old supplier URL policy for page-world _detail_url (KID-360 port of the retired url-policy.js)', () => {
    expect(allowedSupplierUrl('https://detail.1688.com/offer/607635921546.html?spm=x#ignored'))
      .toBe('https://detail.1688.com/offer/607635921546.html?spm=x');
    expect(allowedSupplierUrl('https://m.1688.com/offer/607635921546.html')).toBe('https://m.1688.com/offer/607635921546.html');
    for (const value of [
      'http://detail.1688.com/offer/607635921546.html',
      'https://localhost:3000/internal',
      'https://detail.1688.com.evil.test/offer/607635921546.html',
      'https://detail.1688.com:8443/offer/607635921546.html',
      'https://user:pass@detail.1688.com/offer/607635921546.html',
      'https://127.0.0.1/offer/1.html',
    ]) {
      expect(allowedSupplierUrl(value), value).toBeNull();
    }
  });

  it('never fetches a disallowed page-world _detail_url and still returns the product', async () => {
    const fake = fakeTabPages({ currentUrl: URL_1688, answer: () => ({ ok: true }), fetchText: () => '<p>설명 설명 설명</p>' });
    const extracting = createProductPageSite(fake.tabs, 42, { randomId: () => 'm' }).extract(URL_1688);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emit({ type: 'PRODUCT_DATA', attemptId: 'm', data: { title: '필통', source_platform: '1688', _detail_url: 'https://detail.1688.com.evil.test/desc' } });
    fake.emit({ type: 'EXTRACTION_COMPLETE', attemptId: 'm', hadDescription: false });

    await expect(extracting).resolves.toMatchObject({ product: { title: '필통' }, hadDescription: false });
    expect(fake.log.filter((line) => line.startsWith('fetch'))).toEqual([]);
  });
});
