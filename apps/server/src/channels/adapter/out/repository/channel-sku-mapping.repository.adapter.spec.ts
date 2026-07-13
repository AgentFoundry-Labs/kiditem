import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { ChannelSkuMappingRepositoryAdapter } from './channel-sku-mapping.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const ids = Array.from(
  { length: 6 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
);

describe('ChannelSkuMappingRepositoryAdapter status refresh', () => {
  it('bounds availability filtering, capacity, counts, and pagination in tenant SQL', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      rowIds: [],
      total: 2,
      summaryTotal: 5,
      inStock: 2,
      outOfStock: 1,
      unmatched: 1,
      needsReview: 1,
    }]);
    const findMany = vi.fn();
    const repository = new ChannelSkuMappingRepositoryAdapter({
      $queryRaw: queryRaw,
      channelListingOption: { findMany },
    } as unknown as PrismaService);

    const result = await repository.listAvailabilityPage(organizationId, {
      channelAccountId: ids[0],
      status: 'out_of_stock',
      hasBottleneck: true,
      search: 'bear',
      page: 3,
      limit: 25,
    });

    expect(result).toEqual({
      rows: [],
      total: 2,
      summary: {
        total: 5,
        inStock: 2,
        outOfStock: 1,
        unmatched: 1,
        needsReview: 1,
      },
    });
    expect(findMany).not.toHaveBeenCalled();
    const statement = queryRaw.mock.calls[0]?.[0];
    expect(statement.text).toContain('WITH scoped AS');
    expect(statement.text).toContain('MIN(FLOOR');
    expect(statement.text).toContain('master.organization_id = component.organization_id');
    expect(statement.text).toContain('component_count > 0');
    expect(statement.text).toContain('sellable_stock = 0');
    expect(statement.text).toContain('OFFSET');
    expect(statement.text).toContain('LIMIT');
    expect(statement.values).toEqual(expect.arrayContaining([
      organizationId,
      ids[0],
      '%bear%',
      50,
      25,
    ]));
  });

  it('hydrates only page IDs returned by SQL and preserves their order', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      rowIds: [ids[1], ids[0]],
      total: 4,
      summaryTotal: 6,
      inStock: 4,
      outOfStock: 0,
      unmatched: 1,
      needsReview: 1,
    }]);
    const findMany = vi.fn().mockResolvedValue([
      selectedRow(ids[0]!),
      selectedRow(ids[1]!),
    ]);
    const repository = new ChannelSkuMappingRepositoryAdapter({
      $queryRaw: queryRaw,
      channelListingOption: { findMany },
    } as unknown as PrismaService);

    const result = await repository.listAvailabilityPage(organizationId, {
      status: 'in_stock',
      page: 2,
      limit: 2,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        organizationId,
        id: { in: [ids[1], ids[0]] },
      },
    });
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty('skip');
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty('take');
    expect(result.rows.map((row) => row.sku.id)).toEqual([ids[1], ids[0]]);
    expect(result.rows).toHaveLength(2);
  });

  it('tenant-scopes exact SKU/listing ID hydration reads', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelSkuMappingRepositoryAdapter({
      channelListingOption: { findMany },
    } as unknown as PrismaService);

    await repository.findByChannelSkuIds(organizationId, [ids[1], ids[2]]);
    await repository.findByListingIds(organizationId, [ids[3], ids[4]]);

    expect(findMany).toHaveBeenCalledTimes(2);
    for (const [call] of findMany.mock.calls) {
      expect(call.where).toMatchObject({
        organizationId,
        channelAccount: { is: { organizationId } },
        lastImportRun: { is: {
          organizationId,
          sourceType: 'coupang_wing_catalog',
          status: 'completed',
        } },
        listing: { is: {
          organizationId,
          isDeleted: false,
          channelAccount: { is: { organizationId } },
        } },
      });
      expect(call.select.components.where).toEqual({ organizationId });
    }
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      id: { in: [ids[1], ids[2]] },
    });
    expect(findMany.mock.calls[1]?.[0].where).toMatchObject({
      listingId: { in: [ids[3], ids[4]] },
    });
  });

  it('groups advisory updates into at most two guarded statements and skips correct statuses', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations));
    const repository = new ChannelSkuMappingRepositoryAdapter({
      channelListingOption: { updateMany },
      $transaction: transaction,
    } as unknown as PrismaService);

    await repository.updateUnmappedStatuses(organizationId, [
      { channelSkuId: ids[0], mappingStatus: 'unmatched' },
      { channelSkuId: ids[1], mappingStatus: 'needs_review' },
      { channelSkuId: ids[2], mappingStatus: 'unmatched' },
      { channelSkuId: ids[3], mappingStatus: 'needs_review' },
      { channelSkuId: ids[4], mappingStatus: 'unmatched' },
      { channelSkuId: ids[5], mappingStatus: 'needs_review' },
    ]);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).toHaveLength(2);
    expect(updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        id: { in: [ids[0], ids[2], ids[4]] },
        mappingStatus: { not: 'unmatched' },
        components: { none: { organizationId } },
        channelAccount: { is: { organizationId } },
        lastImportRun: { is: expect.objectContaining({
          organizationId,
          sourceType: 'coupang_wing_catalog',
          status: 'completed',
        }) },
        listing: { is: expect.objectContaining({ organizationId, isDeleted: false }) },
      }),
      data: { mappingStatus: 'unmatched' },
    }));
    expect(updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        id: { in: [ids[1], ids[3], ids[5]] },
        mappingStatus: { not: 'needs_review' },
        components: { none: { organizationId } },
      }),
      data: { mappingStatus: 'needs_review' },
    }));
  });

  it('persists both final Master identity and the transition InventorySku ledger identity', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: ids[2] }]),
      channelSkuComponent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany,
      },
      inventorySkuMasterProductMap: {
        findMany: vi.fn().mockResolvedValue([{
          masterProductId: ids[0],
          inventorySkuId: ids[1],
        }]),
      },
      channelListingOption: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ChannelSkuMappingRepositoryAdapter({
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService);

    await repository.replaceComponents({
      organizationId,
      channelSkuId: ids[2]!,
      userId: ids[3]!,
      components: [{ masterProductId: ids[0]!, quantity: 8 }],
      mappingSource: 'manual',
      nextStatus: 'matched',
    });

    expect(tx.inventorySkuMasterProductMap.findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        masterProductId: { in: [ids[0]] },
      },
      select: { masterProductId: true, inventorySkuId: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [{
        organizationId,
        channelSkuId: ids[2],
        inventorySkuId: ids[1],
        masterProductId: ids[0],
        quantity: 8,
        mappingSource: 'manual',
        createdBy: ids[3],
      }],
    });
  });

  it('locks the refresh batch and skips a SKU that gained a confirmed recipe', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: ids[0] }, { id: ids[1] }]),
      channelSkuComponent: {
        findMany: vi.fn().mockResolvedValue([{ channelSkuId: ids[1] }]),
        createMany,
      },
      inventorySkuMasterProductMap: {
        findMany: vi.fn().mockResolvedValue([{
          masterProductId: ids[2],
          inventorySkuId: ids[3],
        }]),
      },
      channelListingOption: { updateMany },
    };
    const repository = new ChannelSkuMappingRepositoryAdapter({
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService);

    const result = await repository.applyAutomaticMatches(organizationId, [
      {
        channelSkuId: ids[0]!,
        mappingStatus: 'matched',
        component: {
          masterProductId: ids[2]!,
          quantity: 1,
          mappingSource: 'product_code',
        },
      },
      {
        channelSkuId: ids[1]!,
        mappingStatus: 'unmatched',
      },
    ]);

    expect(result).toEqual({ applied: 1, skippedConfirmed: 1 });
    expect(createMany).toHaveBeenCalledWith({
      data: [{
        organizationId,
        channelSkuId: ids[0],
        inventorySkuId: ids[3],
        masterProductId: ids[2],
        quantity: 1,
        mappingSource: 'product_code',
        createdBy: null,
      }],
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId, id: { in: [ids[0]] } },
      data: { mappingStatus: 'matched' },
    });
  });
});

function selectedRow(id: string) {
  return {
    channelAccount: { id: ids[5], channel: 'coupang', name: 'Wing' },
    listing: {
      id: ids[4],
      externalId: `P-${id}`,
      channelName: 'Registered',
      displayName: 'Display',
      status: 'approved',
    },
    id,
    externalOptionId: `S-${id}`,
    sellerSku: null,
    itemName: null,
    barcode: null,
    modelNumber: null,
    salePrice: 10_000,
    status: 'on_sale',
    mappingStatus: 'matched',
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    components: [],
  };
}
