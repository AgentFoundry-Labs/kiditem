import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InventorySkuSnapshotListService } from './inventory-sku-snapshot-list.service';
import type { InventorySkuSnapshotListRepositoryPort } from '../port/out/repository/inventory-sku-snapshot-list.repository.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const sellpiaInventorySkuId = '00000000-0000-4000-8000-000000000002';
const runId = '00000000-0000-4000-8000-000000000003';
const productId = '00000000-0000-4000-8000-000000000004';
const firstVariantId = '00000000-0000-4000-8000-000000000005';
const secondVariantId = '00000000-0000-4000-8000-000000000006';

describe('InventorySkuSnapshotListService', () => {
  it('normalizes paging/search/filter and maps stock value plus import timestamps', async () => {
    const repository = makeRepository();
    repository.listSnapshot.mockResolvedValueOnce({
      rows: [{
        sellpiaInventorySkuId,
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
        linkedVariantCount: 2,
        linkedProductCount: 1,
        linkedProducts: [{ id: productId, code: 'KI-001', name: 'KidItem 상품' }],
        linkedVariants: [
          { id: firstVariantId, masterProductId: productId, code: 'KI-001-A', name: '파랑', optionLabel: '색상: 파랑' },
          { id: secondVariantId, masterProductId: productId, code: 'KI-001-B', name: '빨강', optionLabel: '색상: 빨강' },
        ],
      }],
      total: 1,
      summary: {
        totalSkus: 3,
        linkedSkus: 1,
        unlinkedSkus: 2,
        inStockSkus: 2,
        outOfStockSkus: 1,
        totalUnits: 10,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 1,
      },
      latestImport: {
        ...repositoryRun({
          fileName: 'exported-list (3).xls',
          fileHash: 'a'.repeat(64),
          importedAt: new Date('2026-07-12T00:00:00.000Z'),
          lastVerifiedAt: new Date('2026-07-12T00:00:00.000Z'),
          verificationCount: 1,
          lastTrigger: 'legacy_manual_import',
        }),
        status: 'completed',
        rowCount: 1_964,
      },
    });
    const service = new InventorySkuSnapshotListService(repository);

    const result = await service.listSnapshot(organizationId, {
      page: 2,
      limit: 25,
      query: '  상품  ',
      stockStatus: 'in_stock',
      activeStatus: 'active',
      linkStatus: 'linked',
    });

    expect(repository.listSnapshot).toHaveBeenCalledWith(organizationId, {
      skip: 25,
      take: 25,
      query: '상품',
      stockStatus: 'in_stock',
      activeStatus: 'active',
      linkStatus: 'linked',
    });
    expect(result).toEqual({
      items: [{
        sellpiaInventorySkuId,
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
        linkedVariantCount: 2,
        linkedProductCount: 1,
        linkedProducts: [{ id: productId, code: 'KI-001', name: 'KidItem 상품' }],
        linkedVariants: [
          { id: firstVariantId, masterProductId: productId, code: 'KI-001-A', name: '파랑', optionLabel: '색상: 파랑' },
          { id: secondVariantId, masterProductId: productId, code: 'KI-001-B', name: '빨강', optionLabel: '색상: 빨강' },
        ],
        linkStatus: 'linked',
      }],
      total: 1,
      page: 2,
      limit: 25,
      summary: {
        totalSkus: 3,
        linkedSkus: 1,
        unlinkedSkus: 2,
        inStockSkus: 2,
        outOfStockSkus: 1,
        totalUnits: 10,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 1,
      },
      latestImport: {
        id: runId,
        fileName: 'exported-list (3).xls',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 1_964,
        importedAt: '2026-07-12T00:00:00.000Z',
        lastVerifiedAt: '2026-07-12T00:00:00.000Z',
        verificationCount: 1,
        lastTrigger: 'legacy_manual_import',
        freshnessGeneration: null,
        manualFreshExportConfirmedAt: null,
        manualFreshExportConfirmedBy: null,
        qualityReport: null,
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:01:00.000Z',
      },
    });
  });

  it('uses stable defaults and keeps unpriced stock value null', async () => {
    const repository = makeRepository();
    repository.listSnapshot.mockResolvedValueOnce({
      rows: [{
        sellpiaInventorySkuId,
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
        linkedVariantCount: 0,
        linkedProductCount: 0,
        linkedProducts: [],
        linkedVariants: [],
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
      linkStatus: undefined,
    });
    expect(result.items[0]?.stockValue).toBeNull();
    expect(result.latestImport).toBeNull();
  });

  it('maps nullable provenance and decimal-string generations without tenant input', async () => {
    const repository = makeRepository();
    repository.listImportRuns.mockResolvedValueOnce({
      rows: [{
        ...repositoryRun({
          fileName: null,
          fileHash: null,
          freshnessGeneration: 9_007_199_254_740_993n,
          lastTrigger: 'manual_request',
          errorCode: 'sellpia_network_failed',
          errorMessage: 'network failed',
        }),
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
        fileName: null,
        fileHash: null,
        status: 'failed',
        rowCount: 0,
        importedAt: null,
        lastVerifiedAt: null,
        verificationCount: 0,
        lastTrigger: 'manual_request',
        freshnessGeneration: '9007199254740993',
        manualFreshExportConfirmedAt: null,
        manualFreshExportConfirmedBy: null,
        qualityReport: null,
        errorCode: 'sellpia_network_failed',
        errorMessage: 'network failed',
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:01:00.000Z',
      }],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('reads one Sellpia inventory SKU by tenant-scoped id', async () => {
    const repository = makeRepository();
    repository.getSnapshot.mockResolvedValueOnce({
      sellpiaInventorySkuId,
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
      linkedVariantCount: 2,
      linkedProductCount: 1,
      linkedProducts: [{ id: productId, code: 'KI-001', name: 'KidItem 상품' }],
      linkedVariants: [
        { id: firstVariantId, masterProductId: productId, code: 'KI-001-A', name: '파랑', optionLabel: '색상: 파랑' },
        { id: secondVariantId, masterProductId: productId, code: 'KI-001-B', name: '빨강', optionLabel: '색상: 빨강' },
      ],
    });
    const service = new InventorySkuSnapshotListService(repository);

    await expect(service.getSnapshot(organizationId, sellpiaInventorySkuId)).resolves.toEqual({
      sellpiaInventorySkuId,
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
      linkedVariantCount: 2,
      linkedProductCount: 1,
      linkedProducts: [{ id: productId, code: 'KI-001', name: 'KidItem 상품' }],
      linkedVariants: [
        { id: firstVariantId, masterProductId: productId, code: 'KI-001-A', name: '파랑', optionLabel: '색상: 파랑' },
        { id: secondVariantId, masterProductId: productId, code: 'KI-001-B', name: '빨강', optionLabel: '색상: 빨강' },
      ],
      linkStatus: 'linked',
    });
    expect(repository.getSnapshot).toHaveBeenCalledWith(
      organizationId,
      sellpiaInventorySkuId,
    );
  });

  it('returns a real 404 when the tenant-scoped Sellpia inventory SKU is absent', async () => {
    const repository = makeRepository();
    repository.getSnapshot.mockResolvedValueOnce(null);
    const service = new InventorySkuSnapshotListService(repository);

    await expect(service.getSnapshot(organizationId, sellpiaInventorySkuId))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

function emptySummary() {
  return {
    totalSkus: 0,
    linkedSkus: 0,
    unlinkedSkus: 0,
    inStockSkus: 0,
    outOfStockSkus: 0,
    totalUnits: 0,
    pricedAssetValue: 0,
    unpricedSkuCount: 0,
  };
}

function repositoryRun(
  overrides: Partial<{
    fileName: string | null;
    fileHash: string | null;
    status: 'running' | 'completed' | 'failed';
    rowCount: number;
    importedAt: Date | null;
    lastVerifiedAt: Date | null;
    verificationCount: number;
    lastTrigger: 'legacy_manual_import' | 'manual_request' | null;
    freshnessGeneration: bigint | null;
    errorCode: string | null;
    errorMessage: string | null;
  }> = {},
) {
  return {
    id: runId,
    fileName: null,
    fileHash: null,
    status: 'failed' as const,
    rowCount: 0,
    importedAt: null,
    lastVerifiedAt: null,
    verificationCount: 0,
    lastTrigger: null,
    freshnessGeneration: null,
    manualFreshExportConfirmedAt: null,
    manualFreshExportConfirmedBy: null,
    qualityReport: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:01:00.000Z'),
    ...overrides,
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
