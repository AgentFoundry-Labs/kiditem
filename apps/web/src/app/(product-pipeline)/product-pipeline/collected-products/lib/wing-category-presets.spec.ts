import { describe, expect, it } from 'vitest';
import {
  getWingCategoryDefinition,
  matchWingCategoryAlias,
  WING_CATEGORY_DEFINITIONS,
} from './wing-category-presets';

describe('WING category presets', () => {
  it('maps only exact normalized aliases', () => {
    expect(matchWingCategoryAlias('키링')?.key).toBe('64687');
    expect(matchWingCategoryAlias(' 열쇠고리/키홀더 ')?.key).toBe('64687');
    expect(matchWingCategoryAlias('과일바구니 딸깍이')).toBeNull();
  });

  it('resolves a saved category key', () => {
    expect(getWingCategoryDefinition('64687')?.categoryCell).toBe(
      '[64687] 생활용품>생활소품>열쇠고리/키홀더',
    );
    expect(getWingCategoryDefinition('not-supported')).toBeNull();
  });

  it('keeps the current Excel category set complete and unique', () => {
    const keys = WING_CATEGORY_DEFINITIONS.map((item) => item.key);
    const cells = WING_CATEGORY_DEFINITIONS.map((item) => item.categoryCell);

    expect(WING_CATEGORY_DEFINITIONS).toHaveLength(102);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(cells).size).toBe(cells.length);
    for (const item of WING_CATEGORY_DEFINITIONS) {
      expect(item.label).not.toBe('');
      expect(item.aliases.length).toBeGreaterThan(0);
      expect(item.categoryCell).toMatch(/^\[\d+\]\s+.+>.+$/);
      expect(item.categoryCell.toLocaleLowerCase('ko-KR')).not.toContain('(old)');
    }
    expect(cells).not.toContain('사용하지 않는 카테고리');
  });
});
