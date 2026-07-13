import { describe, expect, it, vi } from 'vitest';
import { InventorySkuSnapshotListRepositoryAdapter } from './inventory-sku-snapshot-list.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const SKU_ID = '00000000-0000-4000-8000-000000000002';
const UNVERIFIED_RUN_ID = '00000000-0000-4000-8000-000000000003';

describe('InventorySkuSnapshotListRepositoryAdapter', () => {
  it('reads every snapshot fact in one repeatable-read transaction and nulls unverified provenance', async () => {
    const tx = {
      masterProduct: {
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
        }]),
        count: vi.fn().mockResolvedValue(1),
      },
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
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
      masterProduct: {
        findMany: outsideTransaction,
        count: outsideTransaction,
      },
      sourceImportRun: {
        findFirst: outsideTransaction,
        findMany: outsideTransaction,
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
    expect(tx.masterProduct.findMany).toHaveBeenCalledOnce();
    expect(tx.masterProduct.count).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.sourceImportRun.findFirst).toHaveBeenCalledOnce();
    expect(tx.sourceImportRun.findMany).toHaveBeenCalledOnce();
    expect(result.rows[0]).toMatchObject({
      lastImportRunId: null,
      lastImportedAt: null,
    });
  });

  it('scopes a single snapshot read by both organization and master id', async () => {
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
      lastImportRun: {
        id: UNVERIFIED_RUN_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        status: 'completed',
        importedAt: new Date('2026-07-12T00:00:00.000Z'),
      },
    });
    const repository = new InventorySkuSnapshotListRepositoryAdapter({
      masterProduct: { findFirst },
    } as never);

    const result = await repository.getSnapshot(ORGANIZATION_ID, SKU_ID);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SKU_ID, organizationId: ORGANIZATION_ID },
    }));
    expect(result).toMatchObject({
      masterProductId: SKU_ID,
      lastImportRunId: UNVERIFIED_RUN_ID,
      lastImportedAt: new Date('2026-07-12T00:00:00.000Z'),
    });
  });
});
