import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  fetchAllInventoryItems,
  fetchAllTransactionsInWindow,
  fetchInventoryAssetReport,
  postRocketInventoryEvent,
} from './inventory-api';
import type {
  InventoryAssetReport,
  InventoryListItem,
  InventoryListResponse,
  TransactionListItem,
  TransactionListResponse,
} from '@kiditem/shared/inventory';

function makeTx(suffix: string): TransactionListItem {
  return {
    id: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    optionId: '00000000-0000-4000-8000-000000000099',
    optionName: `opt-${suffix}`,
    type: 'RECEIVE',
    quantity: 1,
    stockDelta: 1,
    unitCost: 0,
    totalCost: 0,
    warehouseId: null,
    relatedId: null,
    relatedType: null,
    note: null,
    createdBy: null,
    createdAt: '2026-04-01T00:00:00.000Z',
  };
}

function makeResponse(items: TransactionListItem[], total: number, page: number): TransactionListResponse {
  return { items, total, page, limit: 200 };
}

function makeInventoryItem(suffix: string): InventoryListItem {
  return {
    id: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    optionId: `00000000-0000-4000-8001-${suffix.padStart(12, '0')}`,
    masterId: '00000000-0000-4000-8000-000000000001',
    sku: `SKU-${suffix}`,
    masterName: 'Test',
    optionName: null,
    kind: 'SIMPLE',
    costPrice: 100,
    abcGrade: 'A',
    currentStock: 1,
    availableStock: 1,
    safetyStock: 0,
    reorderPoint: 0,
    leadTimeDays: null,
    warehouseLocation: null,
    status: 'healthy',
  };
}

function makeInventoryResponse(
  items: InventoryListItem[],
  total: number,
  page: number,
): InventoryListResponse {
  return {
    items,
    total,
    page,
    limit: 200,
    summary: { total, healthy: total, low: 0, out: 0 },
  };
}

function makeInventoryAssetReport(): InventoryAssetReport {
  return {
    summary: {
      totalValue: 1000,
      totalStock: 10,
      totalProducts: 1,
      averageUnitCost: 100,
      byGrade: [
        {
          grade: 'A',
          count: 1,
          totalStock: 10,
          totalValue: 1000,
        },
      ],
    },
    items: [
      {
        inventoryId: '00000000-0000-4000-8000-000000000001',
        optionId: '00000000-0000-4000-8000-000000000002',
        masterId: '00000000-0000-4000-8000-000000000003',
        productName: 'Test / Red',
        sku: 'SKU-1',
        grade: 'A',
        currentStock: 10,
        costPrice: 100,
        stockValue: 1000,
      },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAllTransactionsInWindow', () => {
  it('pages through total > 200 and preserves {from,to} on every call, concatenating in order', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => makeTx(`p1-${i}`));
    const page2 = Array.from({ length: 200 }, (_, i) => makeTx(`p2-${i}`));
    const page3 = Array.from({ length: 1 }, (_, i) => makeTx(`p3-${i}`));

    const getParsed = vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce(makeResponse(page1, 401, 1) as never)
      .mockResolvedValueOnce(makeResponse(page2, 401, 2) as never)
      .mockResolvedValueOnce(makeResponse(page3, 401, 3) as never);

    const window = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
    const result = await fetchAllTransactionsInWindow(window);

    expect(getParsed).toHaveBeenCalledTimes(3);
    const urls = getParsed.mock.calls.map((c) => c[0] as string);
    // {from, to} must survive on every page request, otherwise pages drift outside the window.
    for (const url of urls) {
      expect(url).toContain('from=2026-04-01T00%3A00%3A00.000Z');
      expect(url).toContain('to=2026-04-30T23%3A59%3A59.999Z');
      expect(url).toContain('limit=200');
    }
    expect(urls[0]).toContain('page=1');
    expect(urls[1]).toContain('page=2');
    expect(urls[2]).toContain('page=3');

    expect(result).toHaveLength(401);
    expect(result[0]).toEqual(page1[0]);
    expect(result[200]).toEqual(page2[0]);
    expect(result[400]).toEqual(page3[0]);
  });

  it('does NOT request page 2 when total <= 200', async () => {
    const items = Array.from({ length: 17 }, (_, i) => makeTx(`only-${i}`));
    const getParsed = vi.spyOn(apiClient, 'getParsed').mockResolvedValueOnce(makeResponse(items, 17, 1) as never);

    const result = await fetchAllTransactionsInWindow({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
    });

    expect(getParsed).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(17);
  });
});

describe('fetchAllInventoryItems', () => {
  it('pages through total > 200 and preserves status filter on every call', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => makeInventoryItem(`p1-${i}`));
    const page2 = Array.from({ length: 1 }, (_, i) => makeInventoryItem(`p2-${i}`));
    const getParsed = vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce(makeInventoryResponse(page1, 201, 1) as never)
      .mockResolvedValueOnce(makeInventoryResponse(page2, 201, 2) as never);

    const result = await fetchAllInventoryItems({ status: 'out' });

    expect(getParsed).toHaveBeenCalledTimes(2);
    const urls = getParsed.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain('page=1');
    expect(urls[0]).toContain('limit=200');
    expect(urls[0]).toContain('status=out');
    expect(urls[1]).toContain('page=2');
    expect(urls[1]).toContain('limit=200');
    expect(urls[1]).toContain('status=out');
    expect(result).toHaveLength(201);
    expect(result[0]).toEqual(page1[0]);
    expect(result[200]).toEqual(page2[0]);
  });
});

describe('fetchInventoryAssetReport', () => {
  it('loads the official inventory asset report from the server', async () => {
    const report = makeInventoryAssetReport();
    const getParsed = vi.spyOn(apiClient, 'getParsed').mockResolvedValueOnce(report as never);

    await expect(fetchInventoryAssetReport()).resolves.toEqual(report);
    expect(getParsed).toHaveBeenCalledTimes(1);
    expect(getParsed.mock.calls[0][0]).toBe('/api/inventory/assets');
  });
});

describe('Rocket inventory API helpers', () => {
  it('posts Rocket manual inventory events to the inventory endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ledgerId: '00000000-0000-4000-8000-000000000010',
      alreadyApplied: false,
    } as never);

    await postRocketInventoryEvent({
      inventoryId: '00000000-0000-4000-8000-000000000001',
      optionId: '00000000-0000-4000-8000-000000000002',
      eventType: 'return_restock',
      quantity: 2,
      sourceActionId: 'return-1',
      sourceType: 'rocket_return',
      sourceRef: 'return-1',
    });

    expect(post).toHaveBeenCalledWith('/api/inventory/rocket/events', expect.objectContaining({
      eventType: 'return_restock',
      quantity: 2,
    }));
  });
});
