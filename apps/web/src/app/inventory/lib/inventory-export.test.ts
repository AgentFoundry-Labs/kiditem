import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryListItem, InventoryListResponse } from '@kiditem/shared/inventory';

vi.mock('./inventory-api', () => ({
  fetchInventoryList: vi.fn(),
}));

import { fetchInventoryList } from './inventory-api';
import { fetchAllInventoryForExport } from './inventory-export';

const fetchInventoryListMock = vi.mocked(fetchInventoryList);

function makeItem(suffix: string): InventoryListItem {
  return {
    id: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    optionId: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    masterId: '00000000-0000-4000-8000-000000000001',
    sku: `SKU-${suffix}`,
    masterName: 'Test',
    optionName: null,
    kind: 'SIMPLE',
    currentStock: 1,
    availableStock: 1,
    safetyStock: 0,
    reorderPoint: 0,
    leadTimeDays: null,
    warehouseLocation: null,
    status: 'healthy',
  };
}

function makeResponse(items: InventoryListItem[], total: number, page: number): InventoryListResponse {
  return {
    items,
    total,
    page,
    limit: 200,
    summary: { total, healthy: total, low: 0, out: 0 },
  };
}

afterEach(() => {
  fetchInventoryListMock.mockReset();
});

describe('fetchAllInventoryForExport', () => {
  it('pages through `total > 200` results with status filter and concatenates in order', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => makeItem(`p1-${i}`));
    const page2 = Array.from({ length: 200 }, (_, i) => makeItem(`p2-${i}`));
    const page3 = Array.from({ length: 1 }, (_, i) => makeItem(`p3-${i}`));

    fetchInventoryListMock
      .mockResolvedValueOnce(makeResponse(page1, 401, 1))
      .mockResolvedValueOnce(makeResponse(page2, 401, 2))
      .mockResolvedValueOnce(makeResponse(page3, 401, 3));

    const result = await fetchAllInventoryForExport('low');

    expect(fetchInventoryListMock).toHaveBeenCalledTimes(3);
    expect(fetchInventoryListMock).toHaveBeenNthCalledWith(1, { page: 1, limit: 200, status: 'low' });
    expect(fetchInventoryListMock).toHaveBeenNthCalledWith(2, { page: 2, limit: 200, status: 'low' });
    expect(fetchInventoryListMock).toHaveBeenNthCalledWith(3, { page: 3, limit: 200, status: 'low' });
    expect(result).toHaveLength(401);
    expect(result[0]).toEqual(page1[0]);
    expect(result[200]).toEqual(page2[0]);
    expect(result[400]).toEqual(page3[0]);
  });

  it('does NOT request page 2 when total <= page size', async () => {
    const items = Array.from({ length: 50 }, (_, i) => makeItem(`only-${i}`));
    fetchInventoryListMock.mockResolvedValueOnce(makeResponse(items, 50, 1));

    const result = await fetchAllInventoryForExport();

    expect(fetchInventoryListMock).toHaveBeenCalledTimes(1);
    expect(fetchInventoryListMock).toHaveBeenCalledWith({ page: 1, limit: 200, status: undefined });
    expect(result).toHaveLength(50);
  });
});
