import { describe, expect, it } from 'vitest';
import { deriveAdTargetType } from '../scrape-row-normalizers';

describe('deriveAdTargetType', () => {
  it('keeps advertising product-tab rows at product grain even with keyword labels', () => {
    expect(deriveAdTargetType('product', '키워드 보기')).toBe('product');
  });

  it('uses keyword grain for non-product rows with a keyword', () => {
    expect(deriveAdTargetType('campaign', '유아 장난감')).toBe('keyword');
  });

  it('falls back to campaign grain', () => {
    expect(deriveAdTargetType('campaign', null)).toBe('campaign');
  });
});
