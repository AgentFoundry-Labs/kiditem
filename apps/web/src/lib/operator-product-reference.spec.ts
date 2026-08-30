import { describe, expect, it } from 'vitest';
import {
  isInternalProductCode,
  operatorProductReference,
} from './operator-product-reference';

describe('operator product references', () => {
  it('hides system-owned Sellpia and UUID channel codes but preserves operator codes', () => {
    expect(isInternalProductCode(' INV-SELLPIA-fcb317e3-b99d-4759-b153-10c20841ef6e ')).toBe(true);
    expect(isInternalProductCode('CP-11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isInternalProductCode('CP-SKU-11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isInternalProductCode('KI-001')).toBe(false);
    expect(isInternalProductCode('CP-333')).toBe(false);
    expect(operatorProductReference('INV-SELLPIA-100', '재고 상품')).toBe('재고 상품');
    expect(operatorProductReference('KI-001', '운영 상품')).toBe('KI-001 · 운영 상품');
  });
});
