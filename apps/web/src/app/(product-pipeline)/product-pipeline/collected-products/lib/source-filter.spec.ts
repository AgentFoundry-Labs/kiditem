import { describe, expect, it } from 'vitest';
import {
  SOURCING_SOURCE_FILTERS,
  emptyStateCopyForSourceFilter,
  platformForSourceFilter,
} from './source-filter';

describe('collected product source filter', () => {
  it('maps each tab to the platform value the server stores on the draft', () => {
    expect(platformForSourceFilter('all')).toBeUndefined();
    // 후보를 담을 때 서버가 저장하는 값(PLATFORM_MAP · candidatePlatform) 그대로 — 초안이 복사한다.
    expect(platformForSourceFilter('1688')).toBe('ALIBABA_1688');
    expect(platformForSourceFilter('alibaba')).toBe('ALIBABA');
    expect(platformForSourceFilter('manual-registration')).toBe('KIDITEM_PRODUCT_REGISTRATION');
    expect(SOURCING_SOURCE_FILTERS.map((item) => item.label)).toEqual(['전체', '1688', '알리바바', '상품 생성']);
  });

  it('uses tab-specific empty state copy', () => {
    expect(emptyStateCopyForSourceFilter('manual-registration').title).toBe('상품 생성으로 만든 초안이 없습니다.');
    expect(emptyStateCopyForSourceFilter('alibaba').title).toBe('알리바바에서 온 초안이 없습니다.');
    expect(emptyStateCopyForSourceFilter('all').title).toBe('판매상품 초안이 없습니다.');
  });
});
