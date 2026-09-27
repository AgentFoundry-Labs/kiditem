import { describe, expect, it } from 'vitest';
import { resolveThumbnailAccount, thumbnailProductName } from './thumbnail-update';

describe('resolveThumbnailAccount', () => {
  it('uses the listing account when the workspace or product has a listing', () => {
    expect(resolveThumbnailAccount({ listingAccountId: 'a1', activeAccountIds: ['a2', 'a3'] }))
      .toEqual({ ok: true, channelAccountId: 'a1' });
  });
  it('falls back to the single active account that supports representative images', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, activeAccountIds: ['a2', 'a2'] }))
      .toEqual({ ok: true, channelAccountId: 'a2' });
  });
  it('refuses to guess among several listings of the product', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, productListingCount: 2, activeAccountIds: ['a2'] }))
      .toEqual({ ok: false, reason: 'ambiguous_listing' });
  });
  it('refuses when there is no or more than one supporting account', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, activeAccountIds: [] }))
      .toEqual({ ok: false, reason: 'no_account' });
    expect(resolveThumbnailAccount({ listingAccountId: null, activeAccountIds: ['a2', 'a3'] }))
      .toEqual({ ok: false, reason: 'ambiguous_account' });
  });
});

describe('thumbnailProductName', () => {
  it('uses the decoded listing name, else the sales product name', () => {
    expect(thumbnailProductName(encodeURIComponent(encodeURIComponent('곰돌이 우산')), '판매상품')).toBe('곰돌이 우산');
    expect(thumbnailProductName('  쿠팡 이름 ', '판매상품')).toBe('쿠팡 이름');
    expect(thumbnailProductName(null, ' 판매상품 ')).toBe('판매상품');
    expect(thumbnailProductName('   ', '판매상품')).toBe('판매상품');
    expect(thumbnailProductName('%E0%A4%A', '판매상품')).toBe('%E0%A4%A');
  });
  it('is empty when neither name exists', () => {
    expect(thumbnailProductName(null, '  ')).toBe('');
    expect(thumbnailProductName('', null)).toBe('');
  });
});
