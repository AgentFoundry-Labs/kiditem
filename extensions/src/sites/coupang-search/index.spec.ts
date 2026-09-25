import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { buildCoupangSearchUrl, createCoupangSearchSite } from './index';

describe('Coupang search site (KID-360)', () => {
  it('opens the search in its own tab, injects the evidence reader when missing, and closes the tab', async () => {
    const fake = fakeTabPages({
      answer: (_message, injected) => injected
        ? { ok: true, autocomplete: { status: 200, contentType: 'application/json', text: '{"suggestions":["연필깎이"]}' }, links: [], productNames: [] }
        : { ok: false, error: 'content_script_missing' },
    });
    const delays: number[] = [];
    const site = createCoupangSearchSite(fake.tabs, { sleep: async (ms) => { delays.push(ms); } });
    await expect(site.keywordSuggestions('연필', 5)).resolves.toMatchObject({ items: [{ rank: 1, keyword: '연필깎이' }] });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${buildCoupangSearchUrl('연필')}`,
      'ask KIDITEM_COUPANG_SEARCH_EVIDENCE',
      'inject content/sourcing/coupang-search-page.js',
      'ask KIDITEM_COUPANG_SEARCH_EVIDENCE',
      'close 7',
    ]);
    // 검색 화면이 그려진 뒤 연관 링크가 붙기까지 1.5초 기다린다(옛 수집기 규칙).
    expect(delays).toEqual([1_500]);
  });

  it('asks for a Coupang login when the search bounces to a login page, and still closes the tab', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://login.coupang.com/login/login.pang', answer: () => ({}) });
    await expect(createCoupangSearchSite(fake.tabs, { sleep: async () => undefined }).keywordSuggestions('연필', 5))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('reports a 429 autocomplete as a rate-limited request failure, not a login', async () => {
    const fake = fakeTabPages({
      answer: () => ({ ok: true, autocomplete: { status: 429, contentType: 'application/json', text: '[]' }, links: [], productNames: [] }),
    });
    await expect(createCoupangSearchSite(fake.tabs, { sleep: async () => undefined }).keywordSuggestions('연필', 5))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { status: 429, reason: 'rate_limited' } });
  });

  it('still asks for a login when autocomplete answers 401 or 403', async () => {
    const fake = fakeTabPages({
      answer: () => ({ ok: true, autocomplete: { status: 403, contentType: 'text/html', text: '' }, links: [], productNames: [] }),
    });
    await expect(createCoupangSearchSite(fake.tabs, { sleep: async () => undefined }).keywordSuggestions('연필', 5))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
  });
});
