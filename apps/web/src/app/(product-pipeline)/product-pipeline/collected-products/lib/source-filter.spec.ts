import { describe, expect, it } from 'vitest';
import {
  emptyStateCopyForSourceFilter,
  platformForSourceFilter,
} from './source-filter';

describe('collected product source filter', () => {
  it('maps product registration tab to the manual registration platform', () => {
    expect(platformForSourceFilter('manual-registration')).toBe('KIDITEM_PRODUCT_REGISTRATION');
    expect(platformForSourceFilter('1688')).toBe('1688');
    expect(platformForSourceFilter('all')).toBeUndefined();
  });

  it('uses tab-specific empty state copy', () => {
    expect(emptyStateCopyForSourceFilter('manual-registration').title).toBe('상품 등록 후보가 없습니다.');
    expect(emptyStateCopyForSourceFilter('1688').title).toBe('1688 수집 상품이 없습니다.');
  });
});
