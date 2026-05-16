import { describe, expect, it } from 'vitest';
import {
  emptyStateCopyForSourceFilter,
  platformForSourceFilter,
} from './source-filter';

describe('collected product source filter', () => {
  it('maps self-collected tab to the KidItem detail-page platform', () => {
    expect(platformForSourceFilter('self-collected')).toBe('kiditem-detail-page');
    expect(platformForSourceFilter('1688')).toBe('1688');
    expect(platformForSourceFilter('all')).toBeUndefined();
  });

  it('uses tab-specific empty state copy', () => {
    expect(emptyStateCopyForSourceFilter('self-collected').title).toBe('자체 수집 상품이 없습니다.');
    expect(emptyStateCopyForSourceFilter('1688').title).toBe('1688 수집 상품이 없습니다.');
  });
});
