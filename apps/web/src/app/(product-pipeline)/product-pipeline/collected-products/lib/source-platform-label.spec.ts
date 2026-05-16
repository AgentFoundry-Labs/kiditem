import { describe, expect, it } from 'vitest';
import { sourcePlatformLabel } from './source-platform-label';

describe('sourcePlatformLabel', () => {
  it('labels manual product registration candidates', () => {
    expect(sourcePlatformLabel('KIDITEM_PRODUCT_REGISTRATION')).toBe('상품 등록');
  });

  it('keeps legacy KidItem detail-page candidates distinct from new product registration', () => {
    expect(sourcePlatformLabel('kiditem-detail-page')).toBe('상세 생성(레거시)');
  });

  it('keeps generated thumbnails distinct from product registration candidates', () => {
    expect(sourcePlatformLabel('kiditem-thumbnail')).toBe('썸네일 후보');
  });
});
