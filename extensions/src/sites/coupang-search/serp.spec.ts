import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { SITE_VERIFICATION_REQUIRED, buildCoupangSerpUrl, createCoupangSerp, isExpectedSerpUrl } from './serp';

function card(productId: string, patch: Record<string, unknown> = {}) {
  return { isAd: false, productId, itemId: null, vendorItemId: `v-${productId}`, name: `${productId} 상품`, priceKrw: 1_000, reviewCount: 3,
    ratingScore: 4.5, imageUrl: null, link: `https://www.coupang.com/vp/products/${productId}`, ...patch };
}

function deps() {
  const slept: number[] = [];
  let clock = 0;
  return {
    slept,
    deps: {
      sleep: async (ms: number) => { slept.push(ms); clock += ms; },
      now: () => clock,
      random: () => 0,
    },
  };
}

describe('coupang SERP site (KID-362)', () => {
  it('reads pages in one background tab, numbers ranks across pages, waits between pages and keywords, and stops on an empty page', async () => {
    const pages: Record<string, unknown[]> = {
      [buildCoupangSerpUrl('연필', 1)]: [card('1', { isAd: true }), card('2')],
      [buildCoupangSerpUrl('연필', 2)]: [card('3')],
      [buildCoupangSerpUrl('연필', 3)]: [],
      [buildCoupangSerpUrl('지우개', 1)]: [card('9')],
    };
    let at = '';
    const fake = fakeTabPages({
      landAt: (url) => { at = url; return url; },
      answer: (_message, injected) => injected ? { ok: true, wall: null, resultListObserved: true, items: pages[at] ?? [] } : { ok: false, error: 'content_script_missing' },
    });
    const clock = deps();
    const serp = createCoupangSerp(fake.tabs, clock.deps);
    const first = await serp.serp('연필', 3);
    expect(first).toMatchObject({ pagesScanned: 2, stopReason: 'empty_page' });
    expect(first.items.map((item) => [item.rank, item.page, item.positionInPage, item.isAd, item.productId])).toEqual([
      [1, 1, 1, true, '1'], [2, 1, 2, false, '2'], [3, 2, 1, false, '3'],
    ]);
    await serp.serp('지우개', 1);
    await serp.closeSerp();
    // 렌더 대기 1.2초, 쪽 사이 1.5초(난수 0), 키워드 사이 4초.
    expect(clock.slept).toEqual([1_200, 1_500, 1_200, 1_500, 1_200, 4_000, 1_200]);
    expect(fake.log.filter((line) => line.startsWith('open') || line.startsWith('close') || line.startsWith('inject'))).toEqual([
      'open about:blank', 'inject content/advertising/coupang-serp-page.js', 'close 7',
    ]);
  });

  it('waits on a security check page for the operator, then reads the same page again and reports attention', async () => {
    const url = buildCoupangSerpUrl('연필', 1);
    let cleared = false;
    const fake = fakeTabPages({
      landAt: (target) => (cleared ? target : 'https://www.coupang.com/securityCheck?x=1'),
      answer: () => ({ ok: true, wall: null, resultListObserved: true, items: [card('1')] }),
      currentUrl: 'https://www.coupang.com/securityCheck?x=1',
    });
    const clock = deps();
    const attention: unknown[] = [];
    const serp = createCoupangSerp(fake.tabs, { ...clock.deps, sleep: async (ms) => { await clock.deps.sleep(ms); if (ms === 5_000) cleared = true; } });
    const result = await serp.serp('연필', 1, { onAttention: (value) => { attention.push(value); } });
    expect(result.items).toHaveLength(1);
    expect(attention).toEqual([{ kind: 'verification', site: '쿠팡', label: '연필' }, null]);
    expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([`navigate ${url} (continue on timeout)`, `navigate ${url} (continue on timeout)`]);
  });

  it('gives up after ten minutes on a captcha and keeps the tab for the operator', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true, wall: 'captcha', resultListObserved: false, items: [] }), currentUrl: buildCoupangSerpUrl('연필', 1) });
    const serp = createCoupangSerp(fake.tabs, deps().deps);
    await expect(serp.serp('연필', 1)).rejects.toMatchObject({ code: SITE_VERIFICATION_REQUIRED });
    await serp.closeSerp();
    expect(fake.log).not.toContain('close 7');
  });

  it('stops on a login redirect with SITE_LOGIN_REQUIRED and on an empty first page with a request failure', async () => {
    const login = fakeTabPages({ landAt: () => 'https://login.coupang.com/login/login.pang', answer: () => ({ ok: true, items: [] }) });
    await expect(createCoupangSerp(login.tabs, deps().deps).serp('연필', 1)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });

    const empty = fakeTabPages({ answer: () => ({ ok: true, wall: null, resultListObserved: true, items: [] }) });
    await expect(createCoupangSerp(empty.tabs, deps().deps).serp('연필', 3)).rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'empty_first_page' } });
  });

  it('recognises only the requested search page', () => {
    expect(isExpectedSerpUrl(buildCoupangSerpUrl('연필', 2), buildCoupangSerpUrl('연필', 2))).toBe(true);
    expect(isExpectedSerpUrl(buildCoupangSerpUrl('연필', 1), buildCoupangSerpUrl('연필', 2))).toBe(false);
    expect(isExpectedSerpUrl('https://www.coupang.com/np/search/captcha', buildCoupangSerpUrl('연필', 1))).toBe(false);
  });
});
