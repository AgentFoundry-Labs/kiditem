import { describe, expect, it } from 'vitest';
import { createSellpiaProductInventoryResolver } from './sellpia-product-inventory-resolver';

const active = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'PRODUCT-CODE',
  barcode: 'BARCODE-1',
  isActive: true,
};

describe('createSellpiaProductInventoryResolver', () => {
  it('resolves exact product code before option code and barcode', () => {
    const resolve = createSellpiaProductInventoryResolver([
      active,
      { ...active, id: '22222222-2222-4222-8222-222222222222', code: 'OPTION-CODE', barcode: 'BARCODE-2' },
      { ...active, id: '33333333-3333-4333-8333-333333333333', code: 'BARCODE-SKU', barcode: 'ROW-BARCODE' },
    ]);

    expect(resolve({
      productCode: ' PRODUCT-CODE ',
      optionCode: 'OPTION-CODE',
      barcode: 'ROW-BARCODE',
    })).toEqual({
      status: 'matched',
      sellpiaInventorySkuId: active.id,
    });
  });

  it('falls back to a nonblank exact option code and then a unique barcode', () => {
    const option = { ...active, id: '22222222-2222-4222-8222-222222222222', code: 'OPTION-CODE', barcode: null };
    const barcode = { ...active, id: '33333333-3333-4333-8333-333333333333', code: 'BARCODE-SKU', barcode: 'ROW-BARCODE' };
    const resolve = createSellpiaProductInventoryResolver([active, option, barcode]);

    expect(resolve({ productCode: 'missing', optionCode: ' OPTION-CODE ', barcode: null }))
      .toEqual({ status: 'matched', sellpiaInventorySkuId: option.id });
    expect(resolve({ productCode: 'missing', optionCode: '', barcode: ' ROW-BARCODE ' }))
      .toEqual({ status: 'matched', sellpiaInventorySkuId: barcode.id });
  });

  it('does not silently choose an inactive exact candidate', () => {
    const resolve = createSellpiaProductInventoryResolver([
      { ...active, isActive: false },
    ]);

    expect(resolve({ productCode: active.code, optionCode: '', barcode: null }))
      .toEqual({
        status: 'mapping_required',
        reason: 'inactive_candidate',
        candidateCount: 1,
      });
  });

  it('does not guess among duplicate barcode candidates', () => {
    const resolve = createSellpiaProductInventoryResolver([
      active,
      { ...active, id: '22222222-2222-4222-8222-222222222222', code: 'OTHER' },
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
