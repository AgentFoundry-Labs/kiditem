import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collect1688KeywordDomRecords,
  extract1688KeywordItemsFromApiPayload,
  extract1688KeywordItemsFromDomRecords,
  inspect1688KeywordApiPayload,
  inspect1688KeywordDomReadiness,
  merge1688KeywordSearchItems,
} from './1688-keyword-search.extractor';

describe('1688 keyword search extractor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes a mobile query-form offer URL and reads the sale count rather than its 30-day window', () => {
    const items = extract1688KeywordItemsFromApiPayload({
      data: {
        offers: [{
          detailUrl: 'http://detail.m.1688.com/page/index.html?offerId=123456',
          subject: ' 儿童笔袋 ',
          price: '¥12.50',
          imageUrl: 'https://cbu01.alicdn.com/bag.jpg',
          tradeText: '近30天成交 88 笔',
          tradeScore: '4.7',
          repurchaseRate: '52%',
          companyName: '义乌市文具厂',
          score: 87,
          rawHtml: '<secret>',
        }],
      },
    });

    expect(items).toEqual([{
      offerId: '123456',
      title: '儿童笔袋',
      priceCny: 12.5,
      sourceUrl: 'https://detail.1688.com/offer/123456.html',
      imageUrl: 'https://cbu01.alicdn.com/bag.jpg',
      monthlySales: 88,
      tradeScore: 4.7,
      repurchaseRate: '52%',
      supplierName: '义乌市文具厂',
      score: 87,
    }]);
  });

  it('deduplicates API and DOM offers by identity, caps output, and never exposes raw provider fields', () => {
    const apiItems = extract1688KeywordItemsFromApiPayload({
      offers: Array.from({ length: 42 }, (_, index) => ({
        offerId: String(900000 + index),
        title: `API ${index}`,
        offerUrl: `https://detail.1688.com/offer/${900000 + index}.html`,
        imageUrl: `https://cbu01.alicdn.com/${index}.jpg`,
        rawResponse: { cookie: 'must-not-escape' },
      })).concat({
        offerId: '900000',
        title: 'duplicate API offer',
        offerUrl: 'https://detail.1688.com/offer/900000.html',
      }, {
        offerId: 'broken',
        title: '',
        offerUrl: 'https://detail.1688.com/offer/broken.html',
      }),
    });
    const domItems = extract1688KeywordItemsFromDomRecords([{
      href: 'https://detail.1688.com/offer/900000.html',
      title: 'duplicate DOM offer',
      salesText: '近30天成交 99 笔',
    }]);

    const merged = merge1688KeywordSearchItems(apiItems, domItems);

    expect(merged).toHaveLength(40);
    expect(merged[0]).toMatchObject({
      offerId: '900000',
      title: 'API 0',
    });
    expect(merged.every((item) => Object.keys(item).sort().join(',') === [
      'imageUrl',
      'monthlySales',
      'offerId',
      'priceCny',
      'repurchaseRate',
      'score',
      'sourceUrl',
      'supplierName',
      'title',
      'tradeScore',
    ].join(','))).toBe(true);
  });

  it('collects cards from open shadow roots and safely ignores inaccessible trees', () => {
    const card = fakeCard();
    const shadowRoot = {
      querySelectorAll: (selector: string) => selector === 'a[href]' ? [card.anchor] : [],
    };
    const host = { shadowRoot };
    const document = {
      querySelectorAll: (selector: string) => selector === '*' ? [host] : [],
    };
    vi.stubGlobal('document', document);

    expect(collect1688KeywordDomRecords(40)).toEqual([{
      href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
      title: '儿童笔袋',
      imageUrl: 'https://cbu01.alicdn.com/bag.jpg',
      priceText: '¥12.5',
      salesText: '近30天成交 88 笔',
      supplierName: '义乌市文具厂',
    }]);

    vi.stubGlobal('document', {
      querySelectorAll: () => [{ get shadowRoot() { throw new Error('closed'); } }],
    });
    expect(collect1688KeywordDomRecords(40)).toEqual([]);
  });

  it('distinguishes a recognized explicit API zero from malformed relevant JSON', () => {
    expect(inspect1688KeywordApiPayload({ data: { offers: [] } })).toEqual({
      kind: 'explicit_zero',
    });
    expect(inspect1688KeywordApiPayload({ data: { offers: [{ unexpected: true }] } })).toEqual({
      kind: 'indeterminate',
    });
    expect(inspect1688KeywordApiPayload({
      data: {
        offers: [{ unexpected: true }],
        metadata: {
          offerId: '123456',
          title: 'must not escape an unrecognized collection',
          offerUrl: 'https://detail.1688.com/offer/123456.html',
        },
      },
    })).toEqual({ kind: 'indeterminate' });
    expect(inspect1688KeywordApiPayload({ data: { pagination: { page: 1 } } })).toEqual({
      kind: 'indeterminate',
    });
  });

  it('reports loading and explicit empty states through open shadow roots without exposing page text', () => {
    const loadingRoot = {
      querySelectorAll: (selector: string) => {
        if (selector === '*') return [];
        if (selector.includes('skeleton')) return [{}];
        return [];
      },
    };
    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => selector === '*' ? [{ shadowRoot: loadingRoot }] : [],
    });

    expect(inspect1688KeywordDomReadiness(40)).toEqual({ kind: 'loading' });

    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => {
        if (selector === '*') return [];
        if (selector.includes('data-empty')) return [{}];
        if (selector.includes('search-result')) return [{}];
        return [];
      },
    });
    expect(inspect1688KeywordDomReadiness(40)).toEqual({ kind: 'explicit_zero' });

    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => {
        if (selector === '*') return [];
        if (selector.includes('data-empty') && selector.includes('search-result')) return [];
        if (selector.includes('data-empty')) return [{}];
        if (selector.includes('search-result')) return [{}];
        return [];
      },
    });
    expect(inspect1688KeywordDomReadiness(40)).toEqual({ kind: 'unready' });
  });
});

function fakeCard(): {
  anchor: {
    getAttribute: (name: string) => string | null;
    textContent: string;
    closest: () => unknown;
  };
} {
  const image = { getAttribute: (name: string) => name === 'src' ? 'https://cbu01.alicdn.com/bag.jpg' : null };
  const price = { textContent: '¥12.5' };
  const sales = { textContent: '近30天成交 88 笔' };
  const supplier = { textContent: '义乌市文具厂' };
  const card = {
    textContent: '儿童笔袋 ¥12.5 近30天成交 88 笔 义乌市文具厂',
    querySelector: (selector: string) => {
      if (selector.includes('img')) return image;
      if (selector.includes('price')) return price;
      if (selector.includes('trade') || selector.includes('sold') || selector.includes('sale')) return sales;
      if (selector.includes('company')) return supplier;
      return null;
    },
  };
  const anchor = {
    getAttribute: (name: string) => {
      if (name === 'href') return 'http://detail.m.1688.com/page/index.html?offerId=123456';
      if (name === 'title') return '儿童笔袋';
      return null;
    },
    textContent: '儿童笔袋',
    closest: () => card,
  };
  return { anchor };
}
