import { describe, expect, it } from 'vitest';
import { createSellpiaProductInventoryResolver } from './sellpia-product-inventory-resolver';

const active = {
  masterProductId: '11111111-1111-4111-8111-111111111111',
  code: 'KID00000001',
  sourceAccountKey: 'kiditem',
  sourceProductCode: 'PRODUCT-CODE',
  sourceOptionCode: '',
  barcode: 'BARCODE-1',
};

describe('createSellpiaProductInventoryResolver', () => {
  it('resolves the exact source product and option pair before barcode', () => {
    const resolve = createSellpiaProductInventoryResolver([
      active,
      {
        ...active,
        masterProductId: '22222222-2222-4222-8222-222222222222',
        code: 'KID00000002',
        sourceOptionCode: 'OPTION-CODE',
        barcode: 'BARCODE-2',
      },
      {
        ...active,
        masterProductId: '33333333-3333-4333-8333-333333333333',
        code: 'KID00000003',
        sourceProductCode: 'BARCODE-PRODUCT',
        barcode: 'ROW-BARCODE',
      },
    ]);

    expect(resolve({
      productCode: ' PRODUCT-CODE ',
      optionCode: 'OPTION-CODE',
      barcode: 'ROW-BARCODE',
    })).toEqual({
      status: 'matched',
      masterProductId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('falls back to a nonblank exact option code and then a unique barcode', () => {
    const option = {
      ...active,
      masterProductId: '22222222-2222-4222-8222-222222222222',
      code: 'KID00000002',
      sourceOptionCode: 'OPTION-CODE',
      barcode: null,
    };
    const barcode = {
      ...active,
      masterProductId: '33333333-3333-4333-8333-333333333333',
      code: 'KID00000003',
      sourceProductCode: 'BARCODE-PRODUCT',
      barcode: 'ROW-BARCODE',
    };
    const resolve = createSellpiaProductInventoryResolver([active, option, barcode]);

    expect(resolve({ productCode: 'PRODUCT-CODE', optionCode: ' OPTION-CODE ', barcode: null }))
      .toEqual({ status: 'matched', masterProductId: option.masterProductId });
    expect(resolve({ productCode: 'missing', optionCode: '', barcode: ' ROW-BARCODE ' }))
      .toEqual({ status: 'matched', masterProductId: barcode.masterProductId });
  });

  it('resolves an exact candidate regardless of inventory lifecycle metadata', () => {
    const resolve = createSellpiaProductInventoryResolver([
      active,
    ]);

    expect(resolve({ productCode: active.sourceProductCode, optionCode: '', barcode: null }))
      .toEqual({
        status: 'matched',
        masterProductId: active.masterProductId,
      });
  });

  it('does not guess among duplicate barcode candidates', () => {
    const resolve = createSellpiaProductInventoryResolver([
      active,
      {
        ...active,
        masterProductId: '22222222-2222-4222-8222-222222222222',
        code: 'KID00000002',
        sourceProductCode: 'OTHER-PRODUCT',
      },
    ]);

    expect(resolve({ productCode: 'missing', optionCode: '', barcode: active.barcode }))
      .toEqual({
        status: 'mapping_required',
        reason: 'ambiguous_barcode',
        candidateCount: 2,
      });
  });

  it('returns an explicit not-found resolution instead of inventory zero', () => {
    const resolve = createSellpiaProductInventoryResolver([active]);

    expect(resolve({ productCode: 'missing', optionCode: '', barcode: null }))
      .toEqual({
        status: 'mapping_required',
        reason: 'not_found',
        candidateCount: 0,
      });
  });
});
