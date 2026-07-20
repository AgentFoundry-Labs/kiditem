import { describe, expect, it } from 'vitest';
import {
  channelOriginProductCode,
  channelOriginVariantCode,
  normalizeExactBarcode,
  selectUniqueMasterProduct,
  selectUniqueProductVariant,
} from './channel-catalog-product-resolution';

describe('channel catalog product resolution', () => {
  it('derives stable codes from persisted channel identities', () => {
    const listingId = '11111111-1111-4111-8111-111111111111';
    const optionId = '22222222-2222-4222-8222-222222222222';

    expect(channelOriginProductCode(listingId)).toBe(`CP-${listingId}`);
    expect(channelOriginVariantCode(optionId)).toBe(`CP-SKU-${optionId}`);
    expect(channelOriginProductCode(listingId).length).toBeLessThanOrEqual(100);
    expect(channelOriginVariantCode(optionId).length).toBeLessThanOrEqual(100);
  });

  it('selects one exact product and rejects ambiguity', () => {
    expect(selectUniqueMasterProduct([{ masterProductId: 'master-1' }])).toBe('master-1');
    expect(selectUniqueMasterProduct([
      { masterProductId: 'master-1' },
      { masterProductId: 'master-1' },
    ])).toBe('master-1');
    expect(selectUniqueMasterProduct([
      { masterProductId: 'master-1' },
      { masterProductId: 'master-2' },
    ])).toBeNull();
    expect(selectUniqueMasterProduct([])).toBeNull();
  });

  it('selects a unique variant only inside the selected product', () => {
    expect(selectUniqueProductVariant('master-1', [
      { masterProductId: 'master-1', productVariantId: 'variant-1' },
      { masterProductId: 'master-2', productVariantId: 'variant-2' },
    ])).toBe('variant-1');
    expect(selectUniqueProductVariant('master-1', [
      { masterProductId: 'master-1', productVariantId: 'variant-1' },
      { masterProductId: 'master-1', productVariantId: 'variant-2' },
    ])).toBeNull();
  });

  it('normalizes only 8-14 digits with spaces or hyphens', () => {
    expect(normalizeExactBarcode(' 001-2345-67890 ')).toBe('001234567890');
    expect(normalizeExactBarcode('ABC12345678XYZ')).toBeNull();
    expect(normalizeExactBarcode('1234/5678')).toBeNull();
    expect(normalizeExactBarcode('short')).toBeNull();
    expect(normalizeExactBarcode(null)).toBeNull();
  });
});
