import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaSyncService } from './sellpia-sync.service';
import type { BundleStockPort } from '../port/out/cross-domain/bundle-stock.port';
import type { InventoryProductOptionProvisionPort } from '../port/out/cross-domain/product-option-provision.port';
import type { InventoryRepositoryPort } from '../port/out/repository/inventory.repository.port';
import type { SellpiaSyncRepositoryPort } from '../port/out/repository/sellpia-sync.repository.port';

describe('SellpiaSyncService', () => {
  it('imports rows as preview items and never creates stock transactions during import', async () => {
    const repository = makeRepository({
      optionsByCode: new Map([[
        'SP-001',
        { productOptionId: 'option-1', inventoryId: 'inventory-1', currentStock: 8 },
      ]]),
      rocketNetByOption: new Map([['option-1', -2]]),
    });
    const inventoryRepository = makeInventoryRepository();
    const service = new SellpiaSyncService(
      repository,
      inventoryRepository,
      makeBundleStock(),
      makeProductProvision(),
    );

    const result = await service.importRows({
      organizationId: 'org-1',
      userId: 'user-1',
      fileName: 'sellpia.xlsx',
      fileHash: 'hash-1',
      effectiveExportedAt: new Date('2026-06-29T00:00:00Z'),
      rows: [
        {
          rowNumber: 2,
          sellpiaProductCode: 'SP-001',
          sellpiaProductName: '상품',
          sellpiaStock: 10,
          safetyStock: 0,
          ownProductCode: null,
          barcode: null,
          modelName: null,
          warnings: [],
          raw: {},
        },
      ],
      ignoredColumns: [],
      headers: ['상품코드', '재고'],
    });

    expect(result.summary.recommendedCount).toBe(1);
    expect(result.items[0]?.targetCurrentStock).toBe(8);
    expect(repository.findOptionsBySellpiaCodes).toHaveBeenCalledTimes(1);
    expect(repository.sumRocketStockDeltas).toHaveBeenCalledTimes(1);
    expect(inventoryRepository.appendStockLedger).not.toHaveBeenCalled();
  });

  it('requires reason for large difference approval', async () => {
    const repository = makeRepository({
      item: {
        id: 'item-1',
        inventoryId: 'inventory-1',
        productOptionId: 'option-1',
        targetCurrentStock: 100,
        kiditemStockBefore: 1,
        warningReasons: ['large_difference'],
        blockingReasons: [],
        status: 'recommended',
      },
    });
    const service = new SellpiaSyncService(
      repository,
      makeInventoryRepository({ lockedStock: 1 }),
      makeBundleStock(),
      makeProductProvision(),
    );

    await expect(service.approveItem({
      organizationId: 'org-1',
      userId: 'user-1',
      itemId: 'item-1',
      targetCurrentStock: 100,
    })).rejects.toThrow(BadRequestException);
  });

  it('resolves a new product candidate by linking an option and recording initial stock through RECEIVE', async () => {
    const repository = makeRepository({
      candidate: {
        id: 'candidate-1',
        snapshotItemId: 'item-1',
        sellpiaProductCode: 'SP-NEW',
        sellpiaProductName: '신규 상품',
        sellpiaStock: 7,
        safetyStock: 0,
        barcode: '8801234567890',
        status: 'pending',
      },
    });
    const inventoryRepository = makeInventoryRepository();
    const productProvision = makeProductProvision();
    const service = new SellpiaSyncService(
      repository,
      inventoryRepository,
      makeBundleStock(),
      productProvision,
    );

    await service.resolveCandidate({
      organizationId: 'org-1',
      userId: 'user-1',
      candidateId: 'candidate-1',
      action: 'link_option',
      productOptionId: 'option-linked',
      operatorInitialStock: 7,
      note: 'Sellpia 신규 상품 확인',
    });

    expect(productProvision.linkOption).toHaveBeenCalledWith(expect.anything(), 'org-1', {
      productOptionId: 'option-linked',
      legacyCode: 'SP-NEW',
    });
    expect(inventoryRepository.ensureInventoryForOption).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'option-linked',
    );
    expect(inventoryRepository.appendStockLedger).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: 'RECEIVE',
      quantity: 7,
      relatedId: 'candidate-1',
      relatedType: 'sellpia_new_product_candidate',
    }));
    expect(repository.markCandidateResolved).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'linked_existing_option',
      resolvedProductOptionId: 'option-linked',
      operatorInitialStock: 7,
    }));
  });
});

function makeRepository(
  overrides: Partial<SellpiaSyncRepositoryPort> & Record<string, unknown> = {},
): SellpiaSyncRepositoryPort {
  return {
    createSnapshotWithItems: vi.fn(async (input) => ({
      snapshot: {
        id: '00000000-0000-4000-8000-000000000001',
        fileName: input.fileName,
        rowCount: input.items.length,
        effectiveExportedAt: input.effectiveExportedAt,
        status: 'previewed',
      },
      summary: {
        matchedCount: input.items.filter((item) => item.productOptionId).length,
        recommendedCount: input.items.filter((item) => item.status === 'recommended').length,
        reviewCount: input.items.filter((item) => item.status === 'needs_review').length,
        rejectedCount: input.items.filter((item) => item.status === 'rejected').length,
        newProductCandidateCount: input.items.filter((item) => item.status === 'new_product_candidate').length,
      },
      items: input.items.map((item, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
        rowNumber: item.rowNumber,
        sellpiaProductCode: item.sellpiaProductCode,
        sellpiaProductName: item.sellpiaProductName,
        sellpiaStock: item.sellpiaStock,
        safetyStock: item.safetyStock,
        barcode: item.barcode,
        productOptionId: item.productOptionId,
        inventoryId: item.inventoryId,
        rocketLedgerNet: item.rocketLedgerNet,
        targetCurrentStock: item.targetCurrentStock,
        kiditemStockBefore: item.kiditemStockBefore,
        diff: item.diff,
        diffRate: item.diffRate,
        status: item.status,
        blockingReasons: item.blockingReasons,
        warningReasons: item.warningReasons,
        operatorTargetStock: null,
        reviewNote: null,
      })),
      newProductCandidates: [],
    })),
    findOptionsBySellpiaCodes: vi.fn(async (_organizationId, codes) => {
      const source = overrides.optionsByCode as Map<string, unknown> | undefined;
      return new Map(codes.map((code) => [code, source?.get(code) ?? null]));
    }),
    sumRocketStockDeltas: vi.fn(async (_organizationId, optionIds) => {
      const source = overrides.rocketNetByOption as Map<string, number> | undefined;
      return new Map(optionIds.map((optionId) => [optionId, source?.get(optionId) ?? 0]));
    }),
    listLatestStockEventTimes: vi.fn(async () => new Map()),
    findSnapshotItemForApproval: vi.fn(async () => overrides.item as never),
    lockSnapshotItemForApproval: vi.fn(async () => overrides.item as never),
    markItemApplied: vi.fn(async () => undefined),
    markItemIgnored: vi.fn(async () => undefined),
    lockCandidateForResolution: vi.fn(async () => overrides.candidate as never),
    markCandidateResolved: vi.fn(async (_tx, input) => ({
      id: input.candidateId,
      snapshotItemId: input.snapshotItemId,
      sellpiaProductCode: 'SP-NEW',
      sellpiaProductName: '신규 상품',
      sellpiaStock: 7,
      safetyStock: 0,
      barcode: '8801234567890',
      status: input.status,
      operatorInitialStock: input.operatorInitialStock,
    })),
    createReceiptBatch: vi.fn(async () => ({
      id: '00000000-0000-4000-8000-000000000010',
      status: 'template_pending',
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-1',
      templateVersion: null,
      uploadedAt: null,
      note: null,
      createdAt: new Date(),
    })),
    listReceiptBatches: vi.fn(async () => []),
    markReceiptBatchUploaded: vi.fn(async () => ({
      id: '00000000-0000-4000-8000-000000000010',
      status: 'uploaded',
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-1',
      templateVersion: null,
      uploadedAt: new Date(),
      note: null,
      createdAt: new Date(),
    })),
    ...overrides,
  } as unknown as SellpiaSyncRepositoryPort;
}

function makeInventoryRepository(overrides: { lockedStock?: number } = {}): InventoryRepositoryPort {
  return {
    runTransaction: vi.fn(async (op) => op(Symbol('tx') as never)),
    runInventoryStockMutation: vi.fn(async (_inventoryId, _organizationId, op) => op(Symbol('tx') as never, {
      id: 'inventory-1',
      optionId: 'option-1',
      organizationId: 'org-1',
      currentStock: overrides.lockedStock ?? 1,
      reservedStock: 0,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQuantity: 0,
      leadTimeDays: null,
      dailySalesAvg: 0,
      warehouseLocation: null,
      lastRestockedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    ensureInventoryForOption: vi.fn(async (_tx, organizationId, optionId) => ({
      id: 'inventory-1',
      optionId,
      organizationId,
      currentStock: 0,
      reservedStock: 0,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQuantity: 0,
      leadTimeDays: null,
      dailySalesAvg: 0,
      warehouseLocation: null,
      lastRestockedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    applyStockDelta: vi.fn(async () => ({
      id: 'inventory-1',
      optionId: 'option-1',
      organizationId: 'org-1',
      currentStock: 100,
      reservedStock: 0,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQuantity: 0,
      leadTimeDays: null,
      dailySalesAvg: 0,
      warehouseLocation: null,
      lastRestockedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findOptionNameForLedger: vi.fn(async () => '옵션'),
    appendStockLedger: vi.fn(async () => ({
      id: 'tx-1',
      organizationId: 'org-1',
      optionId: 'option-1',
      optionName: '옵션',
      type: 'ADJUST',
      quantity: 99,
      unitCost: 0,
      totalCost: 0,
      warehouseId: null,
      relatedId: null,
      relatedType: null,
      note: null,
      createdBy: 'user-1',
      createdAt: new Date(),
    })),
    ...overrides,
  } as unknown as InventoryRepositoryPort;
}

function makeBundleStock(): BundleStockPort {
  return {
    recomputeForComponent: vi.fn(async () => []),
  };
}

function makeProductProvision(): InventoryProductOptionProvisionPort {
  return {
    createProductWithOption: vi.fn(async () => ({ masterId: 'master-created', optionId: 'option-created' })),
    createOption: vi.fn(async () => ({ masterId: 'master-existing', optionId: 'option-created' })),
    linkOption: vi.fn(async () => ({ masterId: 'master-linked', optionId: 'option-linked' })),
  };
}
