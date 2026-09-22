import { describe, expect, it } from 'vitest';
import { applySourceFacts, type MasterProduct } from './master-product';

const product: MasterProduct = {
  id: 'product-1', organizationId: 'org-1', code: 'KID00000001',
  sourceAccountKey: 'account-1', sourceProductCode: 'source-1', sourceOptionCode: '',
  name: 'Previous name', optionName: null, barcode: null, currentStock: 4,
  purchasePrice: 1000, imageUrls: ['https://example.test/image.png'],
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('source product updates', () => {
  it('changes source facts while retaining internal identity, code and operator images', () => {
    const updated = applySourceFacts(product, {
      name: 'Collected name', optionName: 'Blue', barcode: '8800000000000',
      currentStock: 0, purchasePrice: null,
    }, new Date('2026-09-21T00:00:00Z'));
    expect(updated).toEqual({ ...product, name: 'Collected name', optionName: 'Blue',
      barcode: '8800000000000', currentStock: 0, purchasePrice: null,
      updatedAt: new Date('2026-09-21T00:00:00Z') });
    expect(product.currentStock).toBe(4);
  });
  it('distinguishes unknown purchase price from free stock', () => {
    expect(applySourceFacts(product, { ...product, purchasePrice: 0 }, product.updatedAt).purchasePrice).toBe(0);
    expect(() => applySourceFacts(product, { ...product, purchasePrice: -1 }, product.updatedAt)).toThrow();
  });
});
