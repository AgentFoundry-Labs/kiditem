import type { StockTransactionType } from '@kiditem/shared/inventory';

export class InsufficientStockError extends Error {
  constructor(public readonly currentStock: number, public readonly delta: number) {
    super(`insufficient stock (current=${currentStock}, delta=${delta})`);
    this.name = 'InsufficientStockError';
  }
}

export function assertSufficientStock(currentStock: number, delta: number): void {
  if (currentStock + delta < 0) {
    throw new InsufficientStockError(currentStock, delta);
  }
}

// ADJUST keeps the signed delta in the ledger so the direction survives.
// RECEIVE/ISSUE store an absolute amount; their direction is implied by the type.
export function computeStoredQuantity(type: StockTransactionType, delta: number): number {
  return type === 'ADJUST' ? delta : Math.abs(delta);
}

// Inverse of computeStoredQuantity for read-side projection.
export function deriveStockDelta(type: StockTransactionType, storedQuantity: number): number {
  if (type === 'RECEIVE') return Math.abs(storedQuantity);
  if (type === 'ISSUE') return -Math.abs(storedQuantity);
  return storedQuantity;
}
