import type {
  Inventory,
  InventoryListItem,
  InventorySummary,
} from '@kiditem/shared/inventory';
import { toSerializable } from '../../products/util/serialize';
import { deriveInventoryStatus } from '../domain/policy/inventory-status';
import type { InventoryRow, InventoryWithOption } from '../application/port/out/inventory-query.repository.port';

export function toInventoryListItem(row: InventoryWithOption): InventoryListItem {
  const availableStock = row.option.isBundle
    ? (row.option.availableStock ?? 0)
    : row.currentStock;
  const status = deriveInventoryStatus(row.currentStock, row.reorderPoint);
  return {
    id: row.id,
    optionId: row.optionId,
    masterId: row.option.masterId,
    sku: row.option.sku,
    masterName: row.option.master.name,
    optionName: row.option.optionName,
    kind: row.option.isBundle ? 'BUNDLE' : 'SIMPLE',
    currentStock: row.currentStock,
    availableStock,
    safetyStock: row.safetyStock,
    reorderPoint: row.reorderPoint,
    leadTimeDays: row.leadTimeDays,
    warehouseLocation: row.warehouseLocation,
    status,
  };
}

export function summarizeInventory(items: InventoryListItem[]): InventorySummary {
  return {
    total: items.length,
    healthy: items.filter((i) => i.status === 'healthy').length,
    low: items.filter((i) => i.status === 'low').length,
    out: items.filter((i) => i.status === 'out').length,
  };
}

export function toInventory(row: InventoryRow): Inventory {
  return toSerializable(row) as Inventory;
}
