import { describe, it, expect } from 'vitest';
import { deriveInventoryStatus } from '../inventory-status';

describe('inventory-status policy', () => {
  it('returns "out" when current <= 0', () => {
    expect(deriveInventoryStatus(0, 5)).toBe('out');
    expect(deriveInventoryStatus(-1, 5)).toBe('out');
  });

  it('returns "low" when current <= reorderPoint', () => {
    expect(deriveInventoryStatus(5, 5)).toBe('low');
    expect(deriveInventoryStatus(3, 5)).toBe('low');
  });

  it('returns "healthy" otherwise', () => {
    expect(deriveInventoryStatus(10, 5)).toBe('healthy');
    expect(deriveInventoryStatus(1, 0)).toBe('healthy');
  });
});
