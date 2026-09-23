import { describe, expect, it } from 'vitest';
import {
  SOURCING_SOURCE_FILTERS,
  emptyStateCopyForSourceFilter,
  platformForSourceFilter,
} from './source-filter';

describe('collected product source filter', () => {
  it('maps each tab to the platform value the server stores on the draft', () => {
    expect(platformForSourceFilter('all')).toBeUndefined();
    expect(platformForSourceFilter('1688')).toBe('1688');
    expect(platformForSourceFilter('alibaba')).toBe('alibaba');
    expect(platformForSourceFilter('coupang')).toBe('coupang');
    expect(platformForSourceFilter('manual-registration')).toBe('KIDITEM_PRODUCT_REGISTRATION');
    expect(SOURCING_SOURCE_FILTERS.map((item) => item.label)).toEqual(['전체', '1688', '알리바바', '쿠팡', '상품 생성']);
  });

  it('uses tab-specific empty state copy', () => {
    expect(emptyStateCopyForSourceFilter('manual-registration').title).toBe('상품 생성으로 만든 초안이 없습니다.');
    expect(emptyStateCopyForSourceFilter('coupang').title).toBe('쿠팡에서 온 초안이 없습니다.');
    expect(emptyStateCopyForSourceFilter('all').title).toBe('판매상품 초안이 없습니다.');
  });
});
