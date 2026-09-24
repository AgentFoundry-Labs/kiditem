import { describe, expect, it } from 'vitest';
import { gsshopSupplierProductCode } from '../../../(product-pipeline)/product-pipeline/_shared/lib/gsshop-registration-form';
import { gsShopAdapter } from './gs-shop.adapter';

const DRAFT_ID = '10000000-0000-4000-8000-0000000000aa';
const CANDIDATE_ID = '20000000-0000-4000-8000-0000000000bb';

function supplierCodeRow(item: Parameters<typeof gsShopAdapter.preview>[0]) {
  return gsShopAdapter.preview(item, {}).find((row) => row.label === '협력사 상품코드')?.value;
}

describe('gsShopAdapter preview — 협력사 상품코드', () => {
  it('previews the code from the sales-product draft id, the same id the filled form uses', () => {
    const value = supplierCodeRow({
      candidateId: CANDIDATE_ID,
      salesProductId: DRAFT_ID,
      source: 'candidate',
      name: '자석 다트게임',
      salePrice: 12900,
      thumbnailUrl: null,
    });

    expect(value).toBe(`${gsshopSupplierProductCode(DRAFT_ID)} (자동)`);
    expect(value).not.toContain(gsshopSupplierProductCode(CANDIDATE_ID));
  });

  it('uses the sales-product id for a sales-product item', () => {
    expect(supplierCodeRow({
      candidateId: DRAFT_ID,
      source: 'sales_product',
      name: '자석 다트게임',
      salePrice: 12900,
      thumbnailUrl: null,
    })).toBe(`${gsshopSupplierProductCode(DRAFT_ID)} (자동)`);
  });
});
