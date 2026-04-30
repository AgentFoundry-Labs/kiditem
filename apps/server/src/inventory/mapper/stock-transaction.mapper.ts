import type {
  StockTransactionType,
  TransactionListItem,
} from '@kiditem/shared/inventory';
import { deriveStockDelta } from '../domain/policy/stock-mutation';
import type { StockTransactionRow } from '../application/port/out/inventory-query.repository.port';

export function toTransactionListItem(row: StockTransactionRow): TransactionListItem {
  const type = row.type as StockTransactionType;
  return {
    id: row.id,
    optionId: row.optionId,
    optionName: row.optionName,
    type,
    quantity: row.quantity,
    stockDelta: deriveStockDelta(type, row.quantity),
    unitCost: row.unitCost,
    totalCost: row.totalCost,
    warehouseId: row.warehouseId,
    relatedId: row.relatedId,
    relatedType: row.relatedType,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
