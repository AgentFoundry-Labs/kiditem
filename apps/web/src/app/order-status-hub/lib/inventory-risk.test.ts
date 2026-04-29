import { describe, expect, it } from 'vitest';
import type { InventoryListItem } from '@kiditem/shared/inventory';
import {
  ORDER_INVENTORY_FILTERS,
  isOrderInventoryAttentionNeeded,
  orderInventoryDisplayName,
  orderInventoryStatusBadge,
} from './inventory-risk';

const base: InventoryListItem = {
  id: '00000000-0000-4000-8000-000000000101',
  optionId: '00000000-0000-4000-8000-000000000102',
  masterId: '00000000-0000-4000-8000-000000000103',
  sku: 'SKU-ORDER-001',
  masterName: 'Sample Master',
  optionName: null,
  kind: 'SIMPLE',
  currentStock: 12,
  availableStock: 12,
  safetyStock: 5,
  reorderPoint: 3,
  leadTimeDays: null,
  warehouseLocation: null,
  status: 'healthy',
};

describe('order-status inventory projection', () => {
  it('joins master and option names without relying on legacy productName', () => {
    expect(orderInventoryDisplayName(base)).toBe('Sample Master');
    expect(orderInventoryDisplayName({ ...base, optionName: '레드 / L' })).toBe(
      'Sample Master / 레드 / L',
    );
  });

  it('uses only current inventory statuses in filters (no critical/warning/overstock)', () => {
    expect(ORDER_INVENTORY_FILTERS.map((filter) => filter.key)).toEqual([
      'all',
      'out',
      'low',
      'healthy',
    ]);
  });

  it('maps current inventory statuses to truthful stock-risk badges', () => {
    expect(orderInventoryStatusBadge('out').label).toBe('품절');
    expect(orderInventoryStatusBadge('low').label).toBe('재고 부족');
    expect(orderInventoryStatusBadge('healthy').label).toBe('정상');
  });

  it('marks out, low, and reorder-point rows as needing attention', () => {
    expect(isOrderInventoryAttentionNeeded({ ...base, status: 'out' })).toBe(true);
    expect(isOrderInventoryAttentionNeeded({ ...base, status: 'low' })).toBe(true);
    expect(isOrderInventoryAttentionNeeded({ ...base, currentStock: 3 })).toBe(true);
    expect(isOrderInventoryAttentionNeeded(base)).toBe(false);
  });
});
