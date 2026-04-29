import { fetchInventoryList } from './inventory-api';
import type { InventoryListItem, InventoryStatus } from '@kiditem/shared/inventory';

const EXPORT_PAGE_SIZE = 200;

export async function fetchAllInventoryForExport(status?: InventoryStatus): Promise<InventoryListItem[]> {
  const first = await fetchInventoryList({ page: 1, limit: EXPORT_PAGE_SIZE, status });
  const pages = Math.ceil(first.total / EXPORT_PAGE_SIZE);
  const rest: InventoryListItem[] = [];

  for (let page = 2; page <= pages; page += 1) {
    const data = await fetchInventoryList({ page, limit: EXPORT_PAGE_SIZE, status });
    rest.push(...data.items);
  }

  return [...first.items, ...rest];
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
