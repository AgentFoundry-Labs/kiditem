import { describe, expect, it } from 'vitest';
import {
  resolveChannelSkuAutomaticMatch,
  type AutomaticMatchMaster,
} from './channel-sku-automatic-match';

const activeMasters: AutomaticMatchMaster[] = [
  {
    id: 'master-code',
    code: 'SP-1',
    barcode: 'B-1',
    isActive: true,
  },
  {
    id: 'master-barcode',
    code: 'SP-2',
    barcode: 'B-2',
    isActive: true,
  },
];

describe('resolveChannelSkuAutomaticMatch', () => {
  it('prefers one exact active Sellpia product-code match', () => {
    expect(resolveChannelSkuAutomaticMatch(
      { productCode: ' SP-1 ', barcode: 'B-2' },
      activeMasters,
    )).toEqual({
      status: 'matched',
      source: 'product_code',
      masterProductId: 'master-code',
      quantity: 1,
    });
  });

  it('uses a unique normalized active barcode when the product code does not match', () => {
    expect(resolveChannelSkuAutomaticMatch(
      { productCode: null, barcode: ' B 2 ' },
      activeMasters,
    )).toEqual({
      status: 'matched',
      source: 'barcode',
      masterProductId: 'master-barcode',
      quantity: 1,
    });
  });

  it('requires review when an exact code or barcode resolves to multiple active Masters', () => {
    const duplicateBarcodeMasters: AutomaticMatchMaster[] = [
      ...activeMasters,
      {
        id: 'master-duplicate-barcode',
        code: 'SP-3',
        barcode: 'B-2',
        isActive: true,
      },
    ];

    expect(resolveChannelSkuAutomaticMatch(
      { productCode: null, barcode: 'B-2' },
      duplicateBarcodeMasters,
    )).toEqual({ status: 'needs_review', component: null });
  });

  it('does not automatically match inactive Masters', () => {
    expect(resolveChannelSkuAutomaticMatch(
      { productCode: 'SP-INACTIVE', barcode: 'B-INACTIVE' },
      [{
        id: 'master-inactive',
        code: 'SP-INACTIVE',
        barcode: 'B-INACTIVE',
        isActive: false,
      }],
    )).toEqual({ status: 'unmatched', component: null });
  });

  it('keeps absent evidence unmatched', () => {
    expect(resolveChannelSkuAutomaticMatch(
      { productCode: null, barcode: null },
      activeMasters,
    )).toEqual({ status: 'unmatched', component: null });
  });
});
