import type { InventoryListItem, InventoryStatus } from '@kiditem/shared/inventory';

export type OrderInventoryFilter = 'all' | InventoryStatus;

export const ORDER_INVENTORY_FILTERS: Array<{
  key: OrderInventoryFilter;
  label: string;
}> = [
  { key: 'all', label: '전체' },
  { key: 'out', label: '품절' },
  { key: 'low', label: '재고 부족' },
  { key: 'healthy', label: '정상' },
];

export function orderInventoryDisplayName(item: InventoryListItem): string {
  return item.optionName ? `${item.masterName} / ${item.optionName}` : item.masterName;
}

export function orderInventoryStatusBadge(status: InventoryStatus): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'out':
      return { label: '품절', color: 'bg-red-100 text-red-800' };
    case 'low':
      return { label: '재고 부족', color: 'bg-amber-100 text-amber-800' };
    case 'healthy':
      return { label: '정상', color: 'bg-green-100 text-green-800' };
  }
}

export function isOrderInventoryAttentionNeeded(item: InventoryListItem): boolean {
  return (
    item.status === 'out' ||
    item.status === 'low' ||
    item.currentStock <= item.reorderPoint
  );
}
