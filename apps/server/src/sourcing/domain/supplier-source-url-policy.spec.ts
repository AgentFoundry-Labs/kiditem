import { describe, expect, it } from 'vitest';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from './supplier-source-url-policy';

describe('supplier source URL policy', () => {
  it.each([
    ['https://detail.1688.com/offer/607635921546.html?spm=x#fragment', '1688'],
    ['https://www.alibaba.com/product-detail/toy_160000000.html', 'alibaba'],
  ] as const)('accepts approved supplier URL %s', (value, platform) => {
    const result = parseAllowedSupplierUrl(value);
    expect(result.platform).toBe(platform);
    expect(result.normalizedUrl).not.toContain('#');
  });

  it.each([
    'http://detail.1688.com/offer/607635921546.html',
    'https://user:pass@detail.1688.com/offer/607635921546.html',
    'https://detail.1688.com:8443/offer/607635921546.html',
    'https://detail.1688.com.evil.test/offer/607635921546.html',
    'https://localhost:3000/internal',
  ])('rejects untrusted URL %s', (value) => {
    expect(() => parseAllowedSupplierUrl(value)).toThrow();
  });

  it('derives 1688 offer identity from a canonical URL, never an array index', () => {
    const url = parseAllowedSupplierUrl('https://detail.1688.com/offer/607635921546.html');
    expect(extractSupplierOfferId(url)).toBe('607635921546');
  });

  it('canonicalizes Alibaba host spelling and tracking query before source identity is derived', () => {
    const tracking = parseAllowedSupplierUrl(
      'https://ALIBABA.com/product-detail/kid-toy_123.html?spm=feed&utm_source=ad#fragment',
    );
    const direct = parseAllowedSupplierUrl(
      'https://www.alibaba.com/product-detail/kid-toy_123.html',
    );

    expect(tracking.normalizedUrl).toBe(
      'https://www.alibaba.com/product-detail/kid-toy_123.html',
    );
    expect(tracking.normalizedUrl).toBe(direct.normalizedUrl);
  });

  it('accepts and canonicalizes an uppercase HTTPS scheme and host', () => {
    expect(parseAllowedSupplierUrl('HTTPS://DETAIL.1688.COM/offer/607635921546.html').normalizedUrl)
      .toBe('https://detail.1688.com/offer/607635921546.html');
  });
});
