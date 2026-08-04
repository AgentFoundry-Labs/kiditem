import { describe, expect, it } from 'vitest';
import { rocketMatchingCsvRowsToCatalogProducts } from './rocket-sellpia-matching-csv.catalog';

describe('rocketMatchingCsvRowsToCatalogProducts', () => {
  it('uses skuId as the Rocket listing and option identity while keeping vendorItemId as provenance', () => {
    const [product] = rocketMatchingCsvRowsToCatalogProducts([{
      rowNumber: 2,
      externalSkuId: '17616314',
      vendorItemId: '78399258325',
      productName: '돌고래게틀링비눗방울총',
      supplierStatus: '활성',
      channelBarcode: '8806384883947',
      sellpiaProductName: '6000돌고래게틀링비눗방울총',
      sellpiaBarcode: '8806384885163',
      matchMethod: '이름매칭',
      confidence: 'high',
      sellpiaStoredMatch: false,
      kiditemSynchronized: false,
      matchStatus: '이름매칭(高)',
      evidence: '제품명 일치',
      rawJson: { skuId: '17616314', vendorItemId: '78399258325' },
    }]);

    expect(product).toMatchObject({
      externalProductId: '17616314',
      registeredName: '돌고래게틀링비눗방울총',
      displayName: '돌고래게틀링비눗방울총',
      productStatus: '활성',
      raw: expect.objectContaining({
        source: 'coupang_rocket_matching_csv',
        vendorItemId: '78399258325',
        sellpiaBarcode: '8806384885163',
      }),
      options: [expect.objectContaining({
        externalOptionId: '17616314',
        sellerSku: '17616314',
        barcode: '8806384883947',
        skuStatus: '활성',
        raw: expect.objectContaining({ vendorItemId: '78399258325' }),
      })],
    });
  });
});
