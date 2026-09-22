import { describe, expect, it } from 'vitest';
import type { SalesProduct } from '@kiditem/shared/sales-product';
import {
  addMissingCombinations,
  basicsFromProduct,
  basicsPatch,
  commonNormalPrice,
  optionsChanged,
  optionsFromProduct,
  optionsPayload,
  optionTableProblems,
  setBaseSalePrice,
  setCommonNormalPrice,
  setOptionExtraPrice,
  setAxes,
} from './sales-product-draft';

const SKU = '8b0b4f3e-6d77-4a58-9f43-2f1f2b7b8c11';

function product(overrides: Partial<SalesProduct> = {}): SalesProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '100300',
    ownCode: null,
    sabangnetGoodsNo: '100300',
    sourceCandidateId: null,
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
    optionAxes: ['색상'],
    stockManaged: false,
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
        salePrice: 5900,
        normalPrice: 9000,
        supplyStatus: 'selling',
        safetyStock: null,
        sortOrder: 0,
        components: [{
          masterProductId: SKU,
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

function option(overrides: Partial<SalesProduct['options'][number]> = {}): SalesProduct['options'][number] {
  return { ...product().options[0]!, ...overrides };
}

describe('sales product editor draft', () => {
  it('sends only the basic fields the operator changed', () => {
    const current = product();
    const draft = { ...basicsFromProduct(current), keywords: ['패드', '만능패드'] };
    expect(basicsPatch(current, basicsFromProduct(current))).toBeNull();
    expect(basicsPatch(current, draft)).toEqual({ keywords: ['패드', '만능패드'] });
    expect(commonNormalPrice(optionsFromProduct(current))).toEqual({ value: 9000, mixed: false });
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
      salePrice: 5900,
      normalPrice: 9000,
      components: [{ masterProductId: SKU, quantity: 1 }],
    }));
    expect(payload.options[1]).toEqual(expect.objectContaining({ values: ['노랑'], components: [] }));
    expect(payload.options[1]).toEqual(expect.objectContaining({ salePrice: 5900, normalPrice: 9000 }));
    expect(optionsChanged(product(), table)).toBe(true);
    expect(optionsChanged(product(), optionsFromProduct(product()))).toBe(false);
  });

  it('round-trips unequal and zero final prices without marking the draft dirty', () => {
    const current = product({
      options: [
        option({ salePrice: 0, normalPrice: 9000 }),
        option({
          id: '33333333-3333-4333-8333-333333333333',
          optionCode: '100300-0002',
          values: ['노랑'],
          optionKey: '노랑',
          salePrice: 5900,
          normalPrice: null,
          linkedChannelOptionCount: 0,
          components: [],
        }),
      ],
    });
    const table = optionsFromProduct(current);

    expect(table.baseSalePrice).toBe(0);
    expect(table.rows.map((row) => row.salePrice)).toEqual([0, 5900]);
    expect(optionsChanged(current, table)).toBe(false);
    expect(optionsPayload(table, current.version).options.map((row) => [row.salePrice, row.normalPrice]))
      .toEqual([[0, 9000], [5900, null]]);
  });

  it('uses a zero base when every option is unused and preserves those final prices', () => {
    const current = product({ options: [option({ salePrice: 250, supplyStatus: 'unused' })] });
    const table = optionsFromProduct(current);

    expect(table.baseSalePrice).toBe(0);
    expect(table.rows[0]!.salePrice).toBe(250);
    expect(optionsChanged(current, table)).toBe(false);
  });

  it('applies base-price changes by delta and keeps unused option prices intact', () => {
    const current = product({
      options: [
        option({ salePrice: 100, normalPrice: 300 }),
        option({
          id: '33333333-3333-4333-8333-333333333333',
          optionCode: '100300-0002',
          values: ['노랑'],
          optionKey: '노랑',
          salePrice: 150,
          normalPrice: 350,
          linkedChannelOptionCount: 0,
          components: [],
        }),
        option({
          id: '44444444-4444-4444-8444-444444444444',
          optionCode: '100300-0003',
          values: ['분홍'],
          optionKey: '분홍',
          salePrice: 25,
          normalPrice: 400,
          supplyStatus: 'unused',
        }),
      ],
    });
    const changed = setBaseSalePrice(optionsFromProduct(current), 125);

    expect(changed.rows.map((row) => row.salePrice)).toEqual([125, 175, 25]);
    expect(optionsPayload(changed, current.version).options.map((row) => row.salePrice)).toEqual([125, 175, 25]);
    expect(optionsChanged(current, changed)).toBe(true);
  });

  it('changes one option final price from its displayed extra amount', () => {
    const current = product({
      options: [
        option({ salePrice: 100 }),
        option({
          id: '33333333-3333-4333-8333-333333333333',
          optionCode: '100300-0002',
          values: ['노랑'],
          optionKey: '노랑',
          salePrice: 150,
          linkedChannelOptionCount: 0,
          components: [],
        }),
      ],
    });
    const table = optionsFromProduct(current);
    const changed = setOptionExtraPrice(table, table.rows[1]!.rowKey, 80);

    expect(changed.rows.map((row) => row.salePrice)).toEqual([100, 180]);
    expect(optionsPayload(changed, current.version).options.map((row) => row.salePrice)).toEqual([100, 180]);
    expect(optionsChanged(current, changed)).toBe(true);
  });

  it('preserves mixed option normal prices until an explicit common TAG edit', () => {
    const current = product({
      options: [
        option({ normalPrice: 9000 }),
        option({
          id: '33333333-3333-4333-8333-333333333333',
          optionCode: '100300-0002',
          values: ['노랑'],
          optionKey: '노랑',
          normalPrice: null,
          linkedChannelOptionCount: 0,
          components: [],
        }),
        option({
          id: '44444444-4444-4444-8444-444444444444',
          optionCode: '100300-0003',
          values: ['분홍'],
          optionKey: '분홍',
          normalPrice: 7000,
          supplyStatus: 'unused',
        }),
      ],
    });
    const table = optionsFromProduct(current);

    expect(commonNormalPrice(table)).toEqual({ value: null, mixed: true });
    expect(optionsChanged(current, table)).toBe(false);
    expect(optionsPayload(table, current.version).options.map((row) => row.normalPrice)).toEqual([9000, null, 7000]);

    const changed = setCommonNormalPrice(table, 12000);
    expect(changed.rows.map((row) => row.normalPrice)).toEqual([12000, 12000, 7000]);
    expect(optionsChanged(current, changed)).toBe(true);
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
