import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { InventorySkuSnapshotListRepositoryPort } from '../port/out/repository/inventory-sku-snapshot-list.repository.port';
import { InventorySkuSnapshotListService } from './inventory-sku-snapshot-list.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const masterProductId = '00000000-0000-4000-8000-000000000002';
const runId = '00000000-0000-4000-8000-000000000003';

describe('InventorySkuSnapshotListService', () => {
  it('normalizes paging/search/filter and maps stock value plus import timestamps', async () => {
    const repository = makeRepository();
    repository.listSnapshot.mockResolvedValueOnce({
      rows: [{
        masterProductId,
        code: 'SP-001',
        name: '상품',
        optionName: '파랑',
        barcode: null,
        currentStock: 8,
        purchasePrice: 1_000,
        salePrice: null,
        isActive: true,
        lastImportRunId: runId,
        lastImportedAt: new Date('2026-07-12T00:00:00.000Z'),
      }],
      total: 1,
      summary: {
        totalSkus: 3,
        inStockSkus: 2,
        outOfStockSkus: 1,
        totalUnits: 10,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 1,
      },
      latestImport: {
        id: runId,
        fileName: 'exported-list (3).xls',
        status: 'completed',
        rowCount: 1_964,
        importedAt: new Date('2026-07-12T00:00:00.000Z'),
      },
    });
    const service = new InventorySkuSnapshotListService(repository);

    const result = await service.listSnapshot(organizationId, {
      page: 2,
      limit: 25,
      query: '  상품  ',
      stockStatus: 'in_stock',
      activeStatus: 'active',
    });

    expect(repository.listSnapshot).toHaveBeenCalledWith(organizationId, {
      skip: 25,
      take: 25,
      query: '상품',
      stockStatus: 'in_stock',
      activeStatus: 'active',
    });
    expect(result).toEqual({
      items: [{
        masterProductId,
        code: 'SP-001',
        name: '상품',
        optionName: '파랑',
        barcode: null,
        currentStock: 8,
        purchasePrice: 1_000,
        salePrice: null,
        isActive: true,
        stockValue: 8_000,
        lastImportRunId: runId,
        lastImportedAt: '2026-07-12T00:00:00.000Z',
      }],
      total: 1,
      page: 2,
      limit: 25,
      summary: {
        totalSkus: 3,
        inStockSkus: 2,
        outOfStockSkus: 1,
        totalUnits: 10,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 1,
      },
      latestImport: {
        id: runId,
        fileName: 'exported-list (3).xls',
        status: 'completed',
        rowCount: 1_964,
        importedAt: '2026-07-12T00:00:00.000Z',
      },
    });
  });

  it('uses stable defaults and keeps unpriced stock value null', async () => {
    const repository = makeRepository();
    repository.listSnapshot.mockResolvedValueOnce({
      rows: [{
        masterProductId,
        code: 'SP-NULL',
        name: '가격 없음',
        optionName: null,
        barcode: null,
        currentStock: 4,
        purchasePrice: null,
        salePrice: null,
        isActive: false,
        lastImportRunId: null,
        lastImportedAt: null,
      }],
      total: 1,
      summary: emptySummary(),
      latestImport: null,
    });
    const service = new InventorySkuSnapshotListService(repository);

    const result = await service.listSnapshot(organizationId, {});

    expect(repository.listSnapshot).toHaveBeenCalledWith(organizationId, {
      skip: 0,
      take: 50,
      query: undefined,
      stockStatus: 'all',
      activeStatus: 'active',
    });
    expect(result.items[0]?.stockValue).toBeNull();
    expect(result.latestImport).toBeNull();
  });

  it('maps Sellpia import history without accepting tenant input', async () => {
    const repository = makeRepository();
    repository.listImportRuns.mockResolvedValueOnce({
      rows: [{
        id: runId,
        fileName: 'sellpia.xls',
        status: 'failed',
        rowCount: 10,
        importedAt: null,
      }],
      total: 1,
    });
    const service = new InventorySkuSnapshotListService(repository);

    const result = await service.listImportRuns(organizationId, { page: 2, limit: 10 });

    expect(repository.listImportRuns).toHaveBeenCalledWith(organizationId, {
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      items: [{
        id: runId,
        fileName: 'sellpia.xls',
        status: 'failed',
        rowCount: 10,
        importedAt: null,
      }],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('reads one Sellpia MasterProduct by tenant-scoped id', async () => {
    const repository = makeRepository();
    repository.getSnapshot.mockResolvedValueOnce({
      masterProductId,
      code: 'SP-001',
      name: '상품',
      optionName: '파랑',
      barcode: '8800000000001',
      currentStock: 8,
      purchasePrice: 1_000,
      salePrice: 2_000,
      isActive: true,
      lastImportRunId: runId,
      lastImportedAt: new Date('2026-07-12T00:00:00.000Z'),
    });
    const service = new InventorySkuSnapshotListService(repository);

    await expect(service.getSnapshot(organizationId, masterProductId)).resolves.toEqual({
      masterProductId,
      code: 'SP-001',
      name: '상품',
      optionName: '파랑',
      barcode: '8800000000001',
      currentStock: 8,
      purchasePrice: 1_000,
      salePrice: 2_000,
      isActive: true,
      stockValue: 8_000,
      lastImportRunId: runId,
      lastImportedAt: '2026-07-12T00:00:00.000Z',
    });
    expect(repository.getSnapshot).toHaveBeenCalledWith(organizationId, masterProductId);
  });

  it('returns a real 404 when the tenant-scoped Sellpia MasterProduct is absent', async () => {
    const repository = makeRepository();
    repository.getSnapshot.mockResolvedValueOnce(null);
    const service = new InventorySkuSnapshotListService(repository);

    await expect(service.getSnapshot(organizationId, masterProductId))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

function emptySummary() {
  return {
    totalSkus: 0,
    inStockSkus: 0,
    outOfStockSkus: 0,
    totalUnits: 0,
    pricedAssetValue: 0,
    unpricedSkuCount: 0,
  };
}

function makeRepository() {
  return {
    listSnapshot: vi
      .fn<InventorySkuSnapshotListRepositoryPort['listSnapshot']>()
      .mockResolvedValue({
        rows: [],
        total: 0,
        summary: emptySummary(),
        latestImport: null,
      }),
    getSnapshot: vi
      .fn<InventorySkuSnapshotListRepositoryPort['getSnapshot']>()
      .mockResolvedValue(null),
    listImportRuns: vi
      .fn<InventorySkuSnapshotListRepositoryPort['listImportRuns']>()
      .mockResolvedValue({ rows: [], total: 0 }),
  };
}
