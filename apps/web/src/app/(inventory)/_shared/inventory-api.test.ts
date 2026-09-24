import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  fetchAllSellpiaInventorySkus,
  listChannelSkuAvailability,
  listSellpiaImportRuns,
  listSellpiaInventorySkus,
} from './inventory-api';
import type {
  InventorySkuSnapshotItem,
  InventorySkuSnapshotListResponse,
} from '@kiditem/shared/inventory';

const RUN_ID = '00000000-0000-4000-8000-000000000010';

function makeSku(index: number): InventorySkuSnapshotItem {
  return {
    masterProductId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    code: `SP-${index}`,
    name: `상품 ${index}`,
    optionName: null,
    barcode: null,
    currentStock: index,
    purchasePrice: 100,
    stockValue: index * 100,
    lastImportRunId: RUN_ID,
    lastImportedAt: '2026-07-11T01:00:00.000Z',
  };
}

function snapshot(
  items: InventorySkuSnapshotItem[],
  total: number,
  page: number,
  limit = 200,
): InventorySkuSnapshotListResponse {
  return {
    items,
    total,
    page,
    limit,
    summary: {
      totalSkus: total,
      inStockSkus: total,
      outOfStockSkus: 0,
      totalUnits: items.reduce((sum, item) => sum + item.currentStock, 0),
      pricedAssetValue: items.reduce((sum, item) => sum + (item.stockValue ?? 0), 0),
      unpricedSkuCount: 0,
    },
    latestImport: {
      id: RUN_ID,
      fileName: 'exported-list.xls',
      status: 'completed',
      rowCount: total,
      importedAt: '2026-07-11T01:00:00.000Z',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sellpia inventory reads', () => {
  it('sends every supported workspace filter to the snapshot endpoint', async () => {
    const response = snapshot([], 0, 2, 50);
    const getParsed = vi.spyOn(apiClient, 'getParsed').mockResolvedValueOnce(response as never);

    await expect(listSellpiaInventorySkus({
      page: 2,
      limit: 50,
      query: 'SP 10',
      stockStatus: 'out_of_stock',
      linkStatus: 'unlinked',
    })).resolves.toMatchObject({ page: 2, limit: 50 });

    expect(getParsed.mock.calls[0]?.[0]).toBe(
      '/api/inventory/sellpia-skus?page=2&limit=50&query=SP+10&stockStatus=out_of_stock&linkStatus=unlinked',
    );
  });

  it('reads every barcode/export row from one coherent snapshot response', async () => {
    const items = Array.from({ length: 201 }, (_, index) => makeSku(index + 1));
    const getParsed = vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce(snapshot(items, 201, 1, 201) as never);

    const result = await fetchAllSellpiaInventorySkus({ stockStatus: 'in_stock' });

    expect(result).toHaveLength(201);
    expect(getParsed).toHaveBeenCalledTimes(1);
    expect(getParsed.mock.calls[0]?.[0]).toBe(
      '/api/inventory/sellpia-skus/export-snapshot?stockStatus=in_stock',
    );
  });

  it('loads a large barcode/export baseline in one request', async () => {
    const total = 1_964;
    const items = Array.from({ length: total }, (_, index) => makeSku(index + 1));
    const getParsed = vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce(snapshot(items, total, 1, total) as never);

    const result = await fetchAllSellpiaInventorySkus();

    expect(result).toHaveLength(total);
    expect(result[0]?.code).toBe('SP-1');
    expect(result.at(-1)?.code).toBe('SP-1964');
    expect(getParsed).toHaveBeenCalledTimes(1);
  });

  it('rejects a whole-read response that silently omits rows', async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValueOnce(
      snapshot([makeSku(1)], 2, 1, 2) as never,
    );

    await expect(fetchAllSellpiaInventorySkus()).rejects.toThrow(
      'Sellpia 재고 출력 스냅샷의 행 수가 일치하지 않습니다.',
    );
  });

  it('loads import history and channel availability from owner endpoints', async () => {
    const getParsed = vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce({ items: [], total: 0, page: 3, limit: 20 } as never)
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        summary: { total: 0, inStock: 0, outOfStock: 0, unmatched: 0, needsReview: 0 },
      } as never);

    await listSellpiaImportRuns({ page: 3, limit: 20 });
    await listChannelSkuAvailability({ status: 'needs_review', search: '말랑이' });

    expect(getParsed.mock.calls[0]?.[0]).toBe(
      '/api/inventory/sellpia-sync/import-runs?page=3&limit=20',
    );
    expect(getParsed.mock.calls[1]?.[0]).toBe(
      '/api/channels/sku-availability?status=needs_review&search=%EB%A7%90%EB%9E%91%EC%9D%B4',
    );
  });
});
