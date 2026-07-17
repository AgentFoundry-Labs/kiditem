import { describe, expect, it, vi } from 'vitest';
import { InventorySkuSnapshotListRepositoryAdapter } from './inventory-sku-snapshot-list.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const SKU_ID = '00000000-0000-4000-8000-000000000002';
const UNVERIFIED_RUN_ID = '00000000-0000-4000-8000-000000000003';

describe('InventorySkuSnapshotListRepositoryAdapter', () => {
  it('reads every snapshot fact in one repeatable-read transaction and nulls unverified provenance', async () => {
    const tx = {
      sellpiaInventorySku: {
        findMany: vi.fn().mockResolvedValue([{
          id: SKU_ID,
          code: 'SP-001',
          name: '상품',
          optionName: null,
          barcode: null,
          currentStock: 3,
          purchasePrice: 1_000,
          salePrice: null,
          isActive: true,
          lastImportRunId: UNVERIFIED_RUN_ID,
          variantComponents: [
            {
              productVariantId: 'variant-1',
              productVariant: {
                id: 'variant-1', code: 'VARIANT-1', name: '옵션 1', optionLabel: null,
                masterProduct: { id: 'product-1', code: 'PRODUCT-1', name: '상품 1' },
              },
            },
            {
              productVariantId: 'variant-2',
              productVariant: {
                id: 'variant-2', code: 'VARIANT-2', name: '옵션 2', optionLabel: '색상: 파랑',
                masterProduct: { id: 'product-1', code: 'PRODUCT-1', name: '상품 1' },
              },
            },
          ],
        }]),
        count: vi.fn().mockResolvedValue(1),
      },
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      sellpiaInventoryState: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $queryRaw: vi.fn().mockResolvedValue([{
        totalSkus: 1n,
        inStockSkus: 1n,
        outOfStockSkus: 0n,
        totalUnits: 3n,
        pricedAssetValue: 3_000n,
        unpricedSkuCount: 0n,
      }]),
    };
    const outsideTransaction = vi.fn(() => {
      throw new Error('snapshot read escaped the transaction');
    });
    const prisma = {
      sellpiaInventorySku: {
        findMany: outsideTransaction,
        count: outsideTransaction,
      },
      sourceImportRun: {
        findFirst: outsideTransaction,
        findMany: outsideTransaction,
      },
      sellpiaInventoryState: {
        findUnique: outsideTransaction,
      },
      $queryRaw: outsideTransaction,
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new InventorySkuSnapshotListRepositoryAdapter(prisma as never);

    const result = await repository.listSnapshot(ORGANIZATION_ID, {
      skip: 0,
      take: 50,
      stockStatus: 'all',
      activeStatus: 'active',
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'RepeatableRead' },
    );
    expect(tx.sellpiaInventorySku.findMany).toHaveBeenCalledOnce();
    expect(tx.sellpiaInventorySku.count).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.sellpiaInventoryState.findUnique).toHaveBeenCalledOnce();
    expect(tx.sourceImportRun.findFirst).not.toHaveBeenCalled();
    expect(tx.sourceImportRun.findMany).toHaveBeenCalledOnce();
    expect(result.rows[0]).toMatchObject({
      lastImportRunId: null,
      lastImportedAt: null,
      linkedVariantCount: 2,
      linkedProductCount: 1,
      linkedProducts: [{ id: 'product-1', code: 'PRODUCT-1', name: '상품 1' }],
      linkedVariants: [
        { id: 'variant-1', masterProductId: 'product-1', code: 'VARIANT-1', name: '옵션 1', optionLabel: null },
        { id: 'variant-2', masterProductId: 'product-1', code: 'VARIANT-2', name: '옵션 2', optionLabel: '색상: 파랑' },
      ],
    });
  });

  it('scopes a single snapshot read by both organization and inventory SKU id', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: SKU_ID,
      code: 'SP-001',
      name: '상품',
      optionName: null,
      barcode: null,
      currentStock: 3,
      purchasePrice: 1_000,
      salePrice: 2_000,
      isActive: true,
      lastImportRunId: UNVERIFIED_RUN_ID,
      variantComponents: [],
      lastImportRun: {
        id: UNVERIFIED_RUN_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        status: 'completed',
        importedAt: new Date('2026-07-12T00:00:00.000Z'),
      },
    });
    const repository = new InventorySkuSnapshotListRepositoryAdapter({
      sellpiaInventorySku: { findFirst },
    } as never);

    const result = await repository.getSnapshot(ORGANIZATION_ID, SKU_ID);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SKU_ID, organizationId: ORGANIZATION_ID },
    }));
    expect(result).toMatchObject({
      sellpiaInventorySkuId: SKU_ID,
      lastImportRunId: UNVERIFIED_RUN_ID,
      lastImportedAt: new Date('2026-07-12T00:00:00.000Z'),
      linkedVariantCount: 0,
      linkedProductCount: 0,
      linkedProducts: [],
      linkedVariants: [],
    });
  });

  it('maps nullable pre-download provenance and expanded history fields', async () => {
    const row = {
      id: UNVERIFIED_RUN_ID,
      fileName: null,
      fileHash: null,
      status: 'failed',
      rowCount: 0,
      importedAt: null,
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: 'manual_request',
      freshnessGeneration: 9_007_199_254_740_993n,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: 'sellpia_network_failed',
      errorMessage: 'network failed',
      createdAt: new Date('2026-07-12T00:00:00.000Z'),
      updatedAt: new Date('2026-07-12T00:01:00.000Z'),
    };
    const findMany = vi.fn().mockResolvedValue([row]);
    const repository = new InventorySkuSnapshotListRepositoryAdapter({
      sourceImportRun: {
        findMany,
        count: vi.fn().mockResolvedValue(1),
      },
    } as never);

    const result = await repository.listImportRuns(ORGANIZATION_ID, {
      skip: 0,
      take: 50,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: expect.objectContaining({
        fileHash: true,
        lastVerifiedAt: true,
        freshnessGeneration: true,
        qualityReport: true,
        errorCode: true,
        updatedAt: true,
      }),
    }));
    expect(result.rows).toEqual([row]);
  });
});
