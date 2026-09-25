import { describe, expect, it } from 'vitest';
import { parseCoupangSearchEvidence, type CoupangSearchEvidence } from './parse';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', text: JSON.stringify(body) });
const evidence = (patch: Partial<CoupangSearchEvidence>): CoupangSearchEvidence => ({ autocomplete: null, links: [], productNames: [], ...patch });

describe('Coupang search evidence rules (ported from the old page script, KID-360)', () => {
  it.each([
    ['403', evidence({ autocomplete: json({ error: 'Access Denied' }, 403) })],
    ['plain HTML', evidence({ autocomplete: { status: 200, contentType: 'text/html', text: '<html>Access Denied</html>' } })],
    ['error envelope', evidence({ autocomplete: json({ success: false, error: 'unauthorized' }) })],
    ['unrelated structured object', evidence({ autocomplete: json({ status: 'pending' }) })],
    ['empty object', evidence({ autocomplete: json({}) })],
    ['no DOM and not JSON', evidence({ autocomplete: { status: 200, contentType: 'text/plain', text: 'not-json' } })],
  ])('does not publish an empty result from %s', (_name, input) => {
    expect(parseCoupangSearchEvidence(input, 'A Pencil', 2).ok).toBe(false);
  });

  it('accepts a valid empty structured JSON response', () => {
    expect(parseCoupangSearchEvidence(evidence({ autocomplete: json({ suggestions: [] }) }), 'A Pencil', 2))
      .toEqual({ ok: true, items: [], productNameTokens: [], warnings: [] });
  });

  it('ranks autocomplete keywords first, drops the seed, prices and duplicates, and caps at maxResults', () => {
    const result = parseCoupangSearchEvidence(evidence({
      autocomplete: json({ data: [{ keyword: '아동 연필 세트' }, { keyword: 'a pencil' }, { keyword: '연필 5,000원' }, { keyword: '아동연필세트' }, { keyword: '연필깎이' }] }),
      links: [{ text: '색연필', href: '/np/search?q=%EC%83%89%EC%97%B0%ED%95%84' }],
    }), 'A Pencil', 3);
    expect(result).toMatchObject({ ok: true, items: [
      { rank: 1, keyword: '아동 연필 세트', source: 'coupang-autocomplete' },
      { rank: 2, keyword: '연필깎이', source: 'coupang-autocomplete' },
      { rank: 3, keyword: '색연필', source: 'coupang-search-dom' },
    ] });
  });

  it('counts product-name tokens without stop words or quantity words', () => {
    const result = parseCoupangSearchEvidence(evidence({
      productNames: ['쿠팡 로켓배송 아동 연필 세트 12개', '아동 연필 무지 세트', '광고'],
    }), 'x', 5);
    expect(result).toMatchObject({ ok: true, productNameTokens: [{ keyword: '아동', count: 2 }, { keyword: '연필', count: 2 }, { keyword: '무지', count: 1 }] });
  });

  it('reports 429 as rate limited and keeps the warning', () => {
    expect(parseCoupangSearchEvidence(evidence({ autocomplete: json([], 429) }), 'x', 5))
      .toMatchObject({ ok: false, reason: 'rate_limited', warnings: ['쿠팡 자동완성 호출 실패 (429)'] });
  });
});
