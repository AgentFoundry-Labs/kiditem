import { describe, expect, it } from 'vitest';
import {
  buildSalesProductOptionCombinations,
  nextSalesProductOptionCode,
  SalesProductCreateInputSchema,
  SalesProductMallCategoryAssignRequestSchema,
  SalesProductMallSheetRequestSchema,
  SalesProductListItemSchema,
  SalesProductListQuerySchema,
  SalesProductListResponseSchema,
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
    expect(parsed.options[0]!.salePrice).toBe(5900);
  });

  it('keeps a draft option price unset instead of turning it into zero', () => {
    const parsed = SalesProductCreateInputSchema.parse({ ...base, options: [{ values: [] }] });
    expect(parsed.options[0]!.salePrice).toBeNull();
    expect(parsed.options[0]!.normalPrice).toBeNull();
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
      options: [{ values: ['빨강'], salePrice: 6400 }],
    }).options[0]!.salePrice).toBe(6400);
  });
});

describe('mall sheet requests name products, never a registration setting', () => {
  const PRODUCT = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c21';
  const TARGET = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c22';

  // 상품 × 몰 계정마다 등록 설정은 하나라 요청이 설정을 고르지 않는다.
  it('accepts product ids and refuses a chosen-setting list', () => {
    expect(SalesProductMallSheetRequestSchema.parse({ salesProductIds: [PRODUCT] }).salesProductIds).toEqual([PRODUCT]);
    expect(SalesProductMallSheetRequestSchema.safeParse({
      salesProductIds: [PRODUCT],
      targetIds: [{ salesProductId: PRODUCT, mallKey: 'gmarket', targetId: TARGET }],
    }).success).toBe(false);
  });

  it('saves a category for products without naming a setting', () => {
    expect(SalesProductMallCategoryAssignRequestSchema.parse({
      mallKey: 'gmarket',
      path: 'A>B',
      salesProductIds: [PRODUCT],
    }).salesProductIds).toEqual([PRODUCT]);
    expect(SalesProductMallCategoryAssignRequestSchema.safeParse({
      mallKey: 'gmarket',
      path: 'A>B',
      salesProductIds: [PRODUCT],
      targetIds: [{ salesProductId: PRODUCT, targetId: TARGET }],
    }).success).toBe(false);
  });
});

describe('sales product list contract', () => {
  it('asks for the products no mall carries yet', () => {
    expect(SalesProductListQuerySchema.parse({ focus: 'unregistered' }).focus).toBe('unregistered');
    expect(SalesProductListQuerySchema.parse({}).focus).toBe('all');
  });

  it('carries the collected product each row came from so a caller can drop the duplicate', () => {
    const item = SalesProductListItemSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'KID00000001',
      ownCode: null,
      sourceRecordId: '22222222-2222-4222-8222-222222222222',
      sourcePlatform: '1688',
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      name: '비눗방울총',
      status: 'active',
      salePrice: 3000,
      imageUrl: null,
      optionAxes: [],
      optionCount: 1,
      sellingOptionCount: 1,
      unlinkedOptionCount: 0,
      channelListingCount: 0,
      registrationAccounts: [],
      updatedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(item.sourceRecordId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('lists a collected draft with no KID and no price yet', () => {
    const item = SalesProductListItemSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      code: null,
      ownCode: null,
      sourceRecordId: null,
      sourcePlatform: null,
      sourceUrl: null,
      name: '초안',
      status: 'draft',
      salePrice: null,
      imageUrl: null,
      optionAxes: [],
      optionCount: 1,
      sellingOptionCount: 1,
      unlinkedOptionCount: 1,
      channelListingCount: 0,
      registrationAccounts: [],
      updatedAt: '2026-09-22T00:00:00.000Z',
    });
    expect([item.code, item.salePrice, item.status]).toEqual([null, null, 'draft']);
  });

  it('counts the unregistered products beside the other summary counts', () => {
    const summary = SalesProductListResponseSchema.parse({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      summary: { total: 4, withOptions: 2, withUnlinkedOptions: 1, unregistered: 3, draft: 1 },
    }).summary;
    expect(summary.unregistered).toBe(3);
    expect(summary.draft).toBe(1);
  });
});
