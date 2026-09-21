import { describe, expect, it } from 'vitest';
import { decodeSellpiaPayload } from './sellpia-workbook.decoder';

describe('Sellpia product-source decoder', () => {
  it('keeps source product/option identity separate from the display code and retains zero stock', () => {
    const artifact = decodeSellpiaPayload(Buffer.from(JSON.stringify({
      source: 'sellpia_product_search',
      version: 1,
      rowCount: 1,
      rows: [{
        productCode: 'PRODUCT-42',
        optionCode: 'OPTION-0',
        name: '상품',
        optionName: null,
        barcode: null,
        currentStock: 0,
        purchasePrice: null,
      }],
    })));

    expect(artifact.rows).toHaveLength(1);
    expect(artifact.rows[0]).toMatchObject({
      sellpiaProductCode: 'PRODUCT-42-OPTION-0',
      sourceProductCode: 'PRODUCT-42',
      sourceOptionCode: 'OPTION-0',
      currentStock: 0,
    });
  });
});
