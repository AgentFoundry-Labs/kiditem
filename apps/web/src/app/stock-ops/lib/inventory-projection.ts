import type { InventoryListItem } from '@kiditem/shared';

export function stockOpsInventoryName(item: InventoryListItem): string {
  return item.optionName ? `${item.masterName} / ${item.optionName}` : item.masterName;
}
