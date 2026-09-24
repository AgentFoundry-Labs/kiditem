import { KiditemError } from '@kiditem/shared/errors';

export type StockoutDecision = 'unknown' | 'out_of_stock' | 'in_stock';

/** Capacity is a count of complete sellable sets; null is unmeasured. */
export function decideStockout(capacity: number | null, safetyStock: number, compositionUnconfirmed = false): StockoutDecision {
  if (!Number.isSafeInteger(safetyStock) || safetyStock < 0) throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'SAFETY_STOCK_INVALID' } });
  if (compositionUnconfirmed || capacity === null) return 'unknown';
  return capacity <= safetyStock ? 'out_of_stock' : 'in_stock';
}
