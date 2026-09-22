import { describe, expect, it } from 'vitest';
import {
  buildSalesProductOptionCombinations,
  nextSalesProductOptionCode,
  SalesProductCreateInputSchema,
  SalesProductMallCategoryAssignRequestSchema,
  SalesProductMallSheetRequestSchema,
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
  const base = { name: '애니멀 스마트 만능패드', salePrice: 5900 };

  it('accepts a single product with one option and no levels', () => {
    const parsed = SalesProductCreateInputSchema.parse({
      ...base,
      options: [{ values: [], components: [{ sellpiaInventorySkuId: SKU, quantity: 1 }] }],
    });
    expect(parsed.optionAxes).toEqual([]);
    expect(parsed.options[0]!.supplyStatus).toBe('selling');
    expect(parsed.status).toBe('active');
  });

  it('rejects several options without a level, values that miss a level, and repeated options', () => {
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      options: [{ values: [] }, { values: [] }],
    }).success).toBe(false);
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색상', '사이즈'],
      options: [{ values: ['빨강'] }],
    }).success).toBe(false);
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색상'],
      options: [{ values: ['빨강'] }, { values: [' 빨강 '] }],
    }).success).toBe(false);
  });

  it('refuses the characters Sabangnet reserves in option names', () => {
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색상'],
      options: [{ values: ['빨강:파랑'] }],
    }).success).toBe(false);
    expect(SalesProductCreateInputSchema.safeParse({
      ...base,
      optionAxes: ['색<상'],
      options: [{ values: ['빨강'] }],
    }).success).toBe(false);
  });

  it('requires the version the operator read before replacing options', () => {
    expect(SalesProductOptionsReplaceInputSchema.safeParse({
      optionAxes: ['색상'],
      options: [{ values: ['빨강'] }],
    }).success).toBe(false);
    expect(SalesProductOptionsReplaceInputSchema.parse({
      expectedVersion: 3,
      optionAxes: ['색상'],
      options: [{ values: ['빨강'], extraPrice: 500 }],
    }).options[0]!.extraPrice).toBe(500);
  });
});

describe('mall sheet requests carry the chosen registration setting', () => {
  const PRODUCT = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c21';
  const TARGET = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c22';

  it('accepts one setting per product and mall, and omits the list when nothing is chosen', () => {
    expect(SalesProductMallSheetRequestSchema.parse({
      salesProductIds: [PRODUCT],
      targetIds: [{ salesProductId: PRODUCT, mallKey: 'gmarket', targetId: TARGET }],
    }).targetIds).toEqual([{ salesProductId: PRODUCT, mallKey: 'gmarket', targetId: TARGET }]);
    expect(SalesProductMallSheetRequestSchema.parse({ salesProductIds: [PRODUCT] }).targetIds).toBeUndefined();
  });

  it('refuses a setting reference that is not an identifier', () => {
    expect(SalesProductMallSheetRequestSchema.safeParse({
      targetIds: [{ salesProductId: PRODUCT, mallKey: 'gmarket', targetId: 'first' }],
    }).success).toBe(false);
    expect(SalesProductMallSheetRequestSchema.safeParse({
      targetIds: [{ salesProductId: PRODUCT, mallKey: '', targetId: TARGET }],
    }).success).toBe(false);
  });

  it('carries the chosen setting into a category save', () => {
    expect(SalesProductMallCategoryAssignRequestSchema.parse({
      mallKey: 'gmarket',
      path: 'A>B',
      salesProductIds: [PRODUCT],
      targetIds: [{ salesProductId: PRODUCT, targetId: TARGET }],
    }).targetIds).toEqual([{ salesProductId: PRODUCT, targetId: TARGET }]);
  });
});
