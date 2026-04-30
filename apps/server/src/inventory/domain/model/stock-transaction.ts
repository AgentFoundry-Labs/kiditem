import type { StockTransactionType } from '@kiditem/shared/inventory';

// Pure description of a stock mutation request, before any persistence concern.
export type StockMutationRequest = {
  type: StockTransactionType;
  delta: number;
  unitCost: number;
  warehouseId?: string;
  relatedId?: string;
  relatedType?: string;
  note?: string;
  userId: string;
};
