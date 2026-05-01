import { fetchAllInventoryItems } from '../../_shared/inventory-api';
import type { InventoryListItem, InventoryStatus } from '@kiditem/shared/inventory';

export async function fetchAllInventoryForExport(status?: InventoryStatus): Promise<InventoryListItem[]> {
  return fetchAllInventoryItems({ status });
}

export function toInventoryExportRows(items: InventoryListItem[]) {
  return items.map((d) => ({
    상품명: d.masterName,
    옵션: d.optionName ?? '',
    SKU: d.sku,
    종류: d.kind,
    현재고: d.currentStock,
    가용재고: d.availableStock,
    안전재고: d.safetyStock,
    발주시점: d.reorderPoint,
    리드타임_일: d.leadTimeDays ?? '',
    창고: d.warehouseLocation ?? '',
    상태: d.status,
  }));
}
