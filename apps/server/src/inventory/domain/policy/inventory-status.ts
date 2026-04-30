import type { InventoryStatus } from '@kiditem/shared/inventory';

export function deriveInventoryStatus(currentStock: number, reorderPoint: number): InventoryStatus {
  if (currentStock <= 0) return 'out';
  if (currentStock <= reorderPoint) return 'low';
  return 'healthy';
}
