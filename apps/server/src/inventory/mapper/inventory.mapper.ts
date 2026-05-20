import type {
  Inventory,
  InventoryAssetItem,
  InventoryAssetReport,
  InventoryListItem,
  InventorySummary,
} from '@kiditem/shared/inventory';
import { toSerializable } from '../../products/util/serialize';
import { deriveInventoryStatus } from '../domain/policy/inventory-status';
import type { InventoryRow, InventoryWithOption } from '../application/port/out/repository/inventory-query.repository.port';

function toInventoryGrade(value: string | null): InventoryListItem['abcGrade'] {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

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
    costPrice: row.option.costPrice,
    abcGrade: toInventoryGrade(row.option.master.abcGrade),
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

export function toInventoryAssetItem(row: InventoryWithOption): InventoryAssetItem {
  const currentStock = row.currentStock;
  const costPrice = row.option.costPrice ?? 0;
  const productName = row.option.optionName
    ? `${row.option.master.name} / ${row.option.optionName}`
    : row.option.master.name;

  return {
    inventoryId: row.id,
    optionId: row.optionId,
    masterId: row.option.masterId,
    productName,
    sku: row.option.sku,
    grade: toInventoryGrade(row.option.master.abcGrade),
    currentStock,
    costPrice,
    stockValue: currentStock * costPrice,
  };
}

export function summarizeInventoryAssets(items: InventoryAssetItem[]): InventoryAssetReport['summary'] {
  const gradeMap = new Map<InventoryAssetItem['grade'], InventoryAssetReport['summary']['byGrade'][number]>();
  let totalValue = 0;
  let totalStock = 0;

  for (const item of items) {
    totalValue += item.stockValue;
    totalStock += item.currentStock;

    const summary = gradeMap.get(item.grade) ?? {
      grade: item.grade,
      count: 0,
      totalStock: 0,
      totalValue: 0,
    };
    summary.count += 1;
    summary.totalStock += item.currentStock;
    summary.totalValue += item.stockValue;
    gradeMap.set(item.grade, summary);
  }

  return {
    totalValue,
    totalStock,
    totalProducts: items.length,
    averageUnitCost: totalStock > 0 ? Math.round(totalValue / totalStock) : 0,
    byGrade: Array.from(gradeMap.values()).sort((a, b) => {
      const order = { A: 0, B: 1, C: 2 };
      const aOrder = a.grade ? order[a.grade] : 3;
      const bOrder = b.grade ? order[b.grade] : 3;
      return aOrder - bOrder;
    }),
  };
}

export function toInventory(row: InventoryRow): Inventory {
  return toSerializable(row) as Inventory;
}
