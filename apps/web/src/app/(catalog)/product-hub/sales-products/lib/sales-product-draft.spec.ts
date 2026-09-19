import { describe, expect, it } from 'vitest';
import type { SalesProduct } from '@kiditem/shared/sales-product';
import {
  addMissingCombinations,
  basicsFromProduct,
  basicsPatch,
  optionsChanged,
  optionsFromProduct,
  optionsPayload,
  optionTableProblems,
  setAxes,
} from './sales-product-draft';

const SKU = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c11';

function product(overrides: Partial<SalesProduct> = {}): SalesProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '100300',
    ownCode: null,
    sabangnetGoodsNo: '100300',
    name: '애니멀 만능패드',
    shortName: null,
    englishName: null,
    printName: null,
    modelName: '7747-4',
    modelNo: null,
    brand: 'kiditem',
    manufacturer: null,
    originCountry: '중국',
    originRegion: null,
    keywords: ['패드'],
    standardCategory: null,
    status: 'active',
    taxType: 'taxable',
    deliveryFeeType: 'collect_or_prepay',
    deliveryFee: 3000,
    costPrice: 2000,
    salePrice: 5900,
    tagPrice: 9000,
    optionAxes: ['색상'],
    stockManaged: false,
    optionsLocked: false,
    imageUrls: [],
    detailHtml: null,
    extraDetailHtml: [],
    noticeCategory: null,
    noticeValues: [],
    certifications: [],
    importDeclarationNo: null,
    adminMemo: null,
    version: 3,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    options: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        optionCode: '100300-0001',
        values: ['파랑'],
        optionKey: '파랑',
        alias: null,
        barcode: '7400090044480',
        extraPrice: 0,
        supplyStatus: 'selling',
        safetyStock: null,
        sortOrder: 0,
        components: [{
          sellpiaInventorySkuId: SKU,
          sellpiaCode: '7747-1',
          name: '애니멀스마트만능패드',
          optionName: '파랑(Bear)',
          quantity: 1,
          currentStock: 12,
        }],
        linkedChannelOptionCount: 2,
      },
    ],
    channelOverrides: [],
    channelListings: [],
    ...overrides,
  };
}

describe('sales product editor draft', () => {
  it('sends only the basic fields the operator changed', () => {
    const current = product();
    const draft = { ...basicsFromProduct(current), salePrice: 6200, keywords: ['패드', '만능패드'] };
    expect(basicsPatch(current, basicsFromProduct(current))).toBeNull();
    expect(basicsPatch(current, draft)).toEqual({ salePrice: 6200, keywords: ['패드', '만능패드'] });
  });

  it('adds only missing combinations and keeps the linked row as it was', () => {
    const table = addMissingCombinations(optionsFromProduct(product()), [['파랑', '노랑', '핑크']]);
    expect(table.rows.map((row) => row.values)).toEqual([['파랑'], ['노랑'], ['핑크']]);
    expect(table.rows[0]!.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(table.rows[1]!.id).toBeUndefined();
  });

  it('builds the option payload with ids, codes and Sellpia components', () => {
    const table = addMissingCombinations(optionsFromProduct(product()), [['파랑', '노랑']]);
    const payload = optionsPayload(table, 3);
    expect(payload.expectedVersion).toBe(3);
    expect(payload.options[0]).toEqual(expect.objectContaining({
      id: '22222222-2222-4222-8222-222222222222',
      optionCode: '100300-0001',
      components: [{ sellpiaInventorySkuId: SKU, quantity: 1 }],
    }));
    expect(payload.options[1]).toEqual(expect.objectContaining({ values: ['노랑'], components: [] }));
    expect(optionsChanged(product(), table)).toBe(true);
    expect(optionsChanged(product(), optionsFromProduct(product()))).toBe(false);
  });

  it('keeps a single row when every option level is removed and flags blank or reserved values', () => {
    const single = setAxes(addMissingCombinations(optionsFromProduct(product()), [['파랑', '노랑']]), []);
    expect(single.axes).toEqual([]);
    expect(single.rows).toHaveLength(1);
    expect(single.rows[0]!.values).toEqual([]);

    const twoLevels = setAxes(optionsFromProduct(product()), ['색상', '사이즈']);
    expect(optionTableProblems(twoLevels)).toContain('1번째 줄에 빈 옵션 값이 있습니다.');
    const reserved = { ...optionsFromProduct(product()), rows: optionsFromProduct(product()).rows.map((row) => ({ ...row, values: ['파랑:S'] })) };
    expect(optionTableProblems(reserved)).toContain('1번째 줄 옵션 값에 : | ^ < > 는 쓸 수 없습니다.');
  });
});
