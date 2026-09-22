import { describe, expect, it } from 'vitest';
import type { SalesProductMallSheetCheck } from '@kiditem/shared/sales-product';
import {
  mallSheetCategoryGroups,
  mallSheetTargetChoices,
  targetSelectionKey,
  unchosenMallTargets,
  chosenTargetsFor,
} from './mall-sheet';

function product(
  id: string,
  categories: SalesProductMallSheetCheck['products'][number]['categories'],
  problems = ['G마켓 카테고리 번호를 모릅니다.'],
  mallTargets: SalesProductMallSheetCheck['products'][number]['mallTargets'] = [],
): SalesProductMallSheetCheck['products'][number] {
  return { salesProductId: id, code: id, name: id, rows: 0, problems, warnings: [], unreadableImages: 0, categories, mallTargets };
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

const TARGET_A = '00000000-0000-4000-8000-0000000000a1';
const TARGET_B = '00000000-0000-4000-8000-0000000000b1';

function target(id: string, label: string) {
  return { id, label, optionCount: 2, categoryPath: null };
}

function checkWith(products: SalesProductMallSheetCheck['products']): SalesProductMallSheetCheck {
  return { sheetKey: 'esm', scope: 'selected', missingFixed: [], maybeListed: 0, ready: 0, blocked: products.length, products };
}

describe('choosing a registration setting in the mall sheet dialog', () => {
  const many = product('a', [], ['등록 설정을 골라 주세요.'], [
    { mallKey: 'gmarket', selectionRequired: true, targets: [target(TARGET_A, '기본 등록'), target(TARGET_B, '별도 등록')] },
    { mallKey: 'auction', selectionRequired: false, targets: [target(TARGET_A, '기본 등록')] },
  ]);
  const one = product('b', [], [], [
    { mallKey: 'gmarket', selectionRequired: false, targets: [] },
    { mallKey: 'auction', selectionRequired: false, targets: [target(TARGET_B, '기본 등록')] },
  ]);

  it('asks only for the product and mall that has several settings', () => {
    expect(mallSheetTargetChoices(checkWith([many, one]))).toEqual([
      {
        key: targetSelectionKey('a', 'gmarket'),
        salesProductId: 'a',
        code: 'a',
        name: 'a',
        mallKey: 'gmarket',
        targets: [target(TARGET_A, '기본 등록'), target(TARGET_B, '별도 등록')],
      },
    ]);
    expect(mallSheetTargetChoices(checkWith([one]))).toEqual([]);
  });

  it('counts what is still unchosen so the file stays blocked', () => {
    expect(unchosenMallTargets(checkWith([many, one]), {})).toBe(1);
    expect(unchosenMallTargets(checkWith([many, one]), { [targetSelectionKey('a', 'gmarket')]: TARGET_B })).toBe(0);
    // 이 상품 × 몰의 것이 아닌 선택은 고른 것으로 치지 않는다.
    expect(unchosenMallTargets(checkWith([many]), { [targetSelectionKey('a', 'gmarket')]: 'stale' })).toBe(1);
  });

  it('counts only the products the operator actually put in the file', () => {
    // 고르지 않은 상품을 담지 않았다면 나머지 상품은 그대로 받을 수 있다.
    expect(unchosenMallTargets(checkWith([many, one]), {}, ['b'])).toBe(0);
    expect(unchosenMallTargets(checkWith([many, one]), {}, ['a', 'b'])).toBe(1);
    expect(unchosenMallTargets(checkWith([many, one]), {}, [])).toBe(0);
  });

  it('sends only the chosen settings of the products in that download batch', () => {
    const selection = {
      [targetSelectionKey('a', 'gmarket')]: TARGET_B,
      [targetSelectionKey('b', 'auction')]: TARGET_A,
    };
    expect(chosenTargetsFor(checkWith([many, one]), selection, ['a'])).toEqual([
      { salesProductId: 'a', mallKey: 'gmarket', targetId: TARGET_B },
    ]);
    expect(chosenTargetsFor(checkWith([many, one]), selection, ['b'])).toEqual([]);
    expect(chosenTargetsFor(checkWith([many, one]), selection, ['a', 'b'])).toEqual([
      { salesProductId: 'a', mallKey: 'gmarket', targetId: TARGET_B },
    ]);
  });
});
