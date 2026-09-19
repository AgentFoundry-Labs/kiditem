import { describe, expect, it } from 'vitest';
import type { SalesProductMallSheetCheck } from '@kiditem/shared/sales-product';
import { mallSheetCategoryGroups } from './mall-sheet';

function product(
  id: string,
  categories: SalesProductMallSheetCheck['products'][number]['categories'],
  problems = ['G마켓 카테고리 번호를 모릅니다.'],
): SalesProductMallSheetCheck['products'][number] {
  return { salesProductId: id, code: id, name: id, rows: 0, problems, warnings: [], unreadableImages: 0, categories };
}

function category(
  mallKey: string,
  suggestion: string | null,
  share = 0.6,
  basis: 'other_malls' | 'similar_names' = 'other_malls',
) {
  return {
    mallKey,
    path: null,
    code: null,
    source: 'none' as const,
    resolved: false,
    suggestion: suggestion ? { path: suggestion, share, voters: 2, basis, resolves: true } : null,
  };
}

describe('mallSheetCategoryGroups', () => {
  it('groups blocked products by mall and suggested category, suggestions first and larger groups first', () => {
    const check: SalesProductMallSheetCheck = {
      sheetKey: 'esm',
      scope: 'missing',
      missingFixed: [],
      maybeListed: 0,
      ready: 1,
      blocked: 3,
      products: [
        product('a', [category('gmarket', 'G>비눗방울', 0.8), category('auction', null)]),
        product('b', [category('gmarket', 'G>비눗방울', 0.4), category('auction', 'A>비눗방울', 0.5, 'similar_names')]),
        product('c', [category('gmarket', null), category('auction', 'A>비눗방울')]),
        product('d', [{ ...category('gmarket', null), resolved: true }], []),
      ],
    };
    const groups = mallSheetCategoryGroups(check, { mallKeys: ['gmarket', 'auction'] });
    expect(groups.map((group) => [group.mallKey, group.suggestion, group.salesProductIds])).toEqual([
      ['gmarket', 'G>비눗방울', ['a', 'b']],
      ['gmarket', null, ['c']],
      ['auction', 'A>비눗방울', ['b', 'c']],
      ['auction', null, ['a']],
    ]);
    expect(groups[0]!.share).toBeCloseTo(0.6);
    expect(groups.map((group) => group.basis)).toEqual(['other_malls', null, 'mixed', null]);
  });
});
