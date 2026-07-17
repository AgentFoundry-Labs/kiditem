import { describe, expect, it } from 'vitest';
import {
  assertInventoryCommitmentCanBeReleased,
  assertInventoryCommitmentCanBeSettled,
  calculateAvailableStock,
  calculateReplacementAvailableStock,
} from './inventory-commitment-state';

describe('inventory commitment state policy', () => {
  it('derives shared available stock from physical stock and active commitments', () => {
    expect(calculateAvailableStock(100, 80)).toBe(20);
    expect(calculateAvailableStock(20, 80)).toBe(0);
  });

  it('credits the predecessor commitment exactly once during replacement', () => {
    expect(calculateReplacementAvailableStock({
      currentStock: 100,
      activeCommitmentQuantity: 80,
      predecessorQuantity: 60,
    })).toBe(80);
  });

  it('allows release only from the active state', () => {
    expect(() => assertInventoryCommitmentCanBeReleased('active')).not.toThrow();
    expect(() => assertInventoryCommitmentCanBeReleased('released')).toThrow(
      /active/i,
    );
    expect(() => assertInventoryCommitmentCanBeReleased('settled')).toThrow(
      /active/i,
    );
  });

  it('settles only active final orders after a newer inventory generation', () => {
    expect(() => assertInventoryCommitmentCanBeSettled({
      kind: 'rocket_final_order',
      status: 'active',
      inventoryGeneration: 12n,
      verifiedGeneration: 13n,
      reason: '셀피아 재고 반영 확인',
    })).not.toThrow();

    for (const invalid of [
      { kind: 'rocket_request', status: 'active', inventoryGeneration: 12n, verifiedGeneration: 13n, reason: '확인' },
      { kind: 'rocket_final_order', status: 'released', inventoryGeneration: 12n, verifiedGeneration: 13n, reason: '확인' },
      { kind: 'rocket_final_order', status: 'active', inventoryGeneration: 12n, verifiedGeneration: 12n, reason: '확인' },
      { kind: 'rocket_final_order', status: 'active', inventoryGeneration: 12n, verifiedGeneration: 13n, reason: ' ' },
    ]) {
      expect(() => assertInventoryCommitmentCanBeSettled(invalid)).toThrow();
    }
  });
});
