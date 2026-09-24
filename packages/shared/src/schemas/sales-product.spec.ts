import { describe, expect, it } from 'vitest';
import {
  buildSalesProductOptionCombinations,
  nextSalesProductOptionCode,
  SalesProductCreateInputSchema,
  SalesProductOptionsReplaceInputSchema,
  salesProductOptionKey,
} from './sales-product';

const SKU = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c11';

describe('sales product option helpers', () => {
  it('builds every combination of option levels and drops blanks and duplicates', () => {
    expect(buildSalesProductOptionCombinations([['빨강', '파랑', '빨강', ' '], ['S', 'M']])).toEqual([
      ['빨강', 'S'], ['빨강', 'M'], ['파랑', 'S'], ['파랑', 'M'],
    ]);
    expect(buildSalesProductOptionCombinations([])).toEqual([[]]);
    expect(buildSalesProductOptionCombinations([['빨강'], []])).toEqual([]);
  });

  it('keys an option by its values joined with the Sabangnet level separator', () => {
    expect(salesProductOptionKey([' 빨강', 'S '])).toBe('빨강:S');
    expect(salesProductOptionKey([])).toBe('');
  });

  it('numbers new option codes after the highest used number of the product', () => {
    expect(nextSalesProductOptionCode('100300', [])).toBe('100300-0001');
    expect(nextSalesProductOptionCode('100300', ['100300-0001', '100300-0007', '999-0009'])).toBe('100300-0008');
  });
});

describe('sales product input contract', () => {
  const base = { name: '애니멀 스마트 만능패드' };

  it('accepts a single product with one option and no levels', () => {
    const parsed = SalesProductCreateInputSchema.parse({
      ...base,
      options: [{ values: [], salePrice: 5900, components: [{ masterProductId: SKU, quantity: 1 }] }],
    });
    expect(parsed.optionAxes).toEqual([]);
    expect(parsed.options[0]!.supplyStatus).toBe('selling');
    expect(parsed.status).toBe('active');
  });

  it('rejects several options without a level, values that miss a level, and repeated options', () => {
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      options: [{ values: [], salePrice: 5900 }, { values: [], salePrice: 5900 }],
    }).success).toBe(false);
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색상', '사이즈'],
      options: [{ values: ['빨강'], salePrice: 5900 }],
    }).success).toBe(false);
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색상'],
      options: [{ values: ['빨강'], salePrice: 5900 }, { values: [' 빨강 '], salePrice: 5900 }],
    }).success).toBe(false);
  });

  it('refuses the characters Sabangnet reserves in option names', () => {
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색상'],
      options: [{ values: ['빨강:파랑'], salePrice: 5900 }],
    }).success).toBe(false);
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색<상'],
      options: [{ values: ['빨강'], salePrice: 5900 }],
    }).success).toBe(false);
  });

  it('requires the version the operator read before replacing options', () => {
    expect(SalesProductOptionsReplaceInputSchema.safeParse({
      optionAxes: ['색상'],
      options: [{ values: ['빨강'], salePrice: 5900 }],
    }).success).toBe(false);
    expect(SalesProductOptionsReplaceInputSchema.parse({
      expectedVersion: 3,
      optionAxes: ['색상'],
      options: [{ values: ['빨강'], salePrice: 6400 }],
    }).options[0]!.salePrice).toBe(6400);
  });
});
