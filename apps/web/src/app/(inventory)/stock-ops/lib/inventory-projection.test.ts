import { describe, expect, it } from 'vitest';
import { stockOpsInventoryName } from './inventory-projection';
import type { InventoryListItem } from '@kiditem/shared/inventory';

const base: InventoryListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  optionId: '00000000-0000-4000-8000-000000000002',
  masterId: '00000000-0000-4000-8000-000000000003',
  sku: 'SKU-001',
  masterName: 'Sample Master',
  optionName: null,
  kind: 'SIMPLE',
  costPrice: 100,
  abcGrade: 'A',
  currentStock: 0,
  availableStock: 0,
  safetyStock: 5,
  reorderPoint: 10,
  leadTimeDays: null,
  warehouseLocation: null,
  status: 'out',
};

describe('stockOpsInventoryName', () => {
  it('returns master name when optionName is null', () => {
    expect(stockOpsInventoryName({ ...base, optionName: null })).toBe('Sample Master');
  });

  it('joins master and option with " / " when optionName is present', () => {
    expect(stockOpsInventoryName({ ...base, optionName: '레드 / L' })).toBe(
      'Sample Master / 레드 / L',
    );
  });

  it('treats empty optionName as falsy and falls back to master only', () => {
    expect(stockOpsInventoryName({ ...base, optionName: '' })).toBe('Sample Master');
  });
});
