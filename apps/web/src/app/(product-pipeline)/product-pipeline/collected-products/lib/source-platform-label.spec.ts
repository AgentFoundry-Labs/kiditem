import { describe, expect, it } from 'vitest';
import { sourcePlatformLabel } from './source-platform-label';

describe('sourcePlatformLabel', () => {
  it('labels KidItem-generated detail-page candidates as self-collected', () => {
    expect(sourcePlatformLabel('kiditem-detail-page')).toBe('자체 수집');
  });

  it('keeps generated thumbnails distinct from self-collected detail-page candidates', () => {
    expect(sourcePlatformLabel('kiditem-thumbnail')).toBe('썸네일 후보');
  });
});
