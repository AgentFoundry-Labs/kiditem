import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelsSellpiaMasterProductReadPort } from '../../port/out/cross-domain/sellpia-master-product-read.port';
import type {
  ChannelSkuMappingRepositoryPort,
  ChannelSkuMappingRow,
} from '../../port/out/repository/channel-sku-mapping.repository.port';
import { ChannelSkuAvailabilityService } from '../channel-sku-availability.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const listingId = '00000000-0000-4000-8000-000000000003';
const skuIds = Array.from(
  { length: 5 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
);
const inventoryIds = Array.from(
  { length: 5 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
);

describe('ChannelSkuAvailabilityService', () => {
  it('hydrates only the repository-bounded page and preserves DB totals', async () => {
    const repository = makeRepository();
    repository.listAvailabilityPage.mockResolvedValue({
      rows: [row(skuIds[1]!, [
        component(inventoryIds[1]!, 1),
        component(inventoryIds[2]!, 2),
      ])],
      total: 2,
      summary: {
        total: 5,
        inStock: 2,
        outOfStock: 1,
        unmatched: 1,
        needsReview: 1,
      },
    });
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([
      inventorySku(inventoryIds[1]!, 12),
      inventorySku(inventoryIds[2]!, 9),
    ]);
    const service = new ChannelSkuAvailabilityService(repository, inventory);

    const result = await service.list(organizationId, {
      channelAccountId: accountId,
      status: 'in_stock',
      hasBottleneck: true,
      search: 'bear',
      page: 2,
      limit: 1,
    });

    expect(repository.listAvailabilityPage).toHaveBeenCalledWith(organizationId, {
      channelAccountId: accountId,
      status: 'in_stock',
      hasBottleneck: true,
      search: 'bear',
      page: 2,
      limit: 1,
    });
    expect(inventory.findByIds).toHaveBeenCalledWith(organizationId, [
      inventoryIds[1],
      inventoryIds[2],
    ]);
    expect(result).toMatchObject({
      total: 2,
      page: 2,
      limit: 1,
      summary: {
        total: 5,
        inStock: 2,
        outOfStock: 1,
        unmatched: 1,
        needsReview: 1,
      },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.sku).toMatchObject({
      id: skuIds[1],
      mappingStatus: 'matched',
      sellableStock: 4,
    });
    expect(result.items[0]?.components).toEqual([
      expect.objectContaining({
        masterProductId: inventoryIds[1],
        componentCapacity: 12,
        isBottleneck: false,
      }),
      expect.objectContaining({
        masterProductId: inventoryIds[2],
        purchasePrice: 1_000,
        componentCapacity: 4,
        isBottleneck: true,
      }),
    ]);
    expect(repository.updateUnmappedStatuses).not.toHaveBeenCalled();
    expect(repository.replaceComponents).not.toHaveBeenCalled();
  });

  it('keeps unmatched and needs-review stock nullable', async () => {
    const repository = makeRepository();
    repository.listAvailabilityPage.mockResolvedValue({
      rows: [
        row(skuIds[0]!, [], 'unmatched'),
        row(skuIds[1]!, [], 'needs_review'),
      ],
      total: 2,
      summary: {
        total: 2,
        inStock: 0,
        outOfStock: 0,
        unmatched: 1,
        needsReview: 1,
      },
    });
    const service = new ChannelSkuAvailabilityService(repository, makeInventory());

    const result = await service.list(organizationId, {
      status: 'all',
      page: 1,
      limit: 50,
    });

    expect(result.items.map((item) => item.sku.sellableStock)).toEqual([null, null]);
    expect(result.items.map((item) => item.sku.mappingStatus)).toEqual([
      'unmatched',
      'needs_review',
    ]);
  });

  it('fails loudly when a persisted component target is missing from Inventory', async () => {
    const repository = makeRepository();
    repository.listAvailabilityPage.mockResolvedValue({
      rows: [row(skuIds[0]!, [component(inventoryIds[0]!, 1)])],
      total: 1,
      summary: {
        total: 1,
        inStock: 1,
        outOfStock: 0,
        unmatched: 0,
        needsReview: 0,
      },
    });
    const service = new ChannelSkuAvailabilityService(repository, makeInventory());

    await expect(service.list(organizationId, {
      status: 'all',
      page: 1,
      limit: 50,
    })).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('hydrates exact channel SKU IDs through tenant-scoped repository and Inventory reads', async () => {
    const repository = makeRepository();
    repository.findByChannelSkuIds.mockResolvedValue([
      row(skuIds[0]!, [component(inventoryIds[0]!, 2)]),
    ]);
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([inventorySku(inventoryIds[0]!, 9)]);
    const service = new ChannelSkuAvailabilityService(repository, inventory);

    const result = await service.findByChannelSkuIds(organizationId, [skuIds[0]!]);

    expect(repository.findByChannelSkuIds).toHaveBeenCalledWith(organizationId, [skuIds[0]]);
    expect(inventory.findByIds).toHaveBeenCalledWith(organizationId, [inventoryIds[0]]);
    expect(result[0]?.sku.sellableStock).toBe(4);
  });

  it('hydrates exact listing IDs without mutating mapping or stock state', async () => {
    const repository = makeRepository();
    repository.findByListingIds.mockResolvedValue([
      row(skuIds[0]!, [component(inventoryIds[0]!, 1)]),
    ]);
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([inventorySku(inventoryIds[0]!, 5)]);
    const service = new ChannelSkuAvailabilityService(repository, inventory);

    const result = await service.findByListingIds(organizationId, [listingId]);

    expect(repository.findByListingIds).toHaveBeenCalledWith(organizationId, [listingId]);
    expect(result[0]?.sku.sellableStock).toBe(5);
    expect(repository.updateUnmappedStatuses).not.toHaveBeenCalled();
    expect(repository.replaceComponents).not.toHaveBeenCalled();
  });
});

function makeRepository() {
  return {
    list: vi.fn<ChannelSkuMappingRepositoryPort['list']>().mockResolvedValue({
      rows: [], total: 0, counts: { all: 0, unmatched: 0, needsReview: 0, matched: 0 },
    }),
    listAvailabilityPage: vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      summary: { total: 0, inStock: 0, outOfStock: 0, unmatched: 0, needsReview: 0 },
    }),
    findByChannelSkuIds: vi.fn().mockResolvedValue([]),
    findByListingIds: vi.fn().mockResolvedValue([]),
    findOne: vi.fn<ChannelSkuMappingRepositoryPort['findOne']>().mockResolvedValue(null),
    findEvidence: vi.fn<ChannelSkuMappingRepositoryPort['findEvidence']>().mockResolvedValue(null),
    listUnmappedEvidence: vi
      .fn<ChannelSkuMappingRepositoryPort['listUnmappedEvidence']>()
      .mockResolvedValue([]),
    updateUnmappedStatuses: vi
      .fn<ChannelSkuMappingRepositoryPort['updateUnmappedStatuses']>()
      .mockResolvedValue(undefined),
    applyAutomaticMatches: vi
      .fn<ChannelSkuMappingRepositoryPort['applyAutomaticMatches']>()
      .mockResolvedValue({ applied: 0, skippedConfirmed: 0 }),
    replaceComponents: vi
      .fn<ChannelSkuMappingRepositoryPort['replaceComponents']>()
      .mockResolvedValue(undefined),
  };
}

function makeInventory() {
  return {
    findByIds: vi.fn<ChannelsSellpiaMasterProductReadPort['findByIds']>().mockResolvedValue([]),
    findBySellpiaCodes: vi
      .fn<ChannelsSellpiaMasterProductReadPort['findBySellpiaCodes']>()
      .mockResolvedValue([]),
    findByBarcodes: vi
      .fn<ChannelsSellpiaMasterProductReadPort['findByBarcodes']>()
      .mockResolvedValue([]),
    search: vi.fn<ChannelsSellpiaMasterProductReadPort['search']>().mockResolvedValue([]),
  };
}

function row(
  id: string,
  componentRefs: ChannelSkuMappingRow['componentRefs'],
  mappingStatus: ChannelSkuMappingRow['sku']['mappingStatus'] = componentRefs.length
    ? 'matched'
    : 'unmatched',
): ChannelSkuMappingRow {
  return {
    channelAccount: { id: accountId, channel: 'coupang', name: 'Wing' },
    product: {
      id: listingId,
      externalProductId: `P-${id}`,
      registeredName: 'Registered',
      displayName: 'Display',
      status: 'approved',
    },
    sku: {
      id,
      externalSkuId: `S-${id}`,
      sellerSku: null,
      optionName: null,
      barcode: null,
      modelNumber: null,
      salePrice: 10_000,
      status: 'on_sale',
      mappingStatus,
      updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    },
    componentRefs,
  };
}

function component(masterProductId: string, quantity: number) {
  return { masterProductId, quantity, mappingSource: 'manual' };
}

function inventorySku(id: string, currentStock: number) {
  return {
    id,
    sellpiaProductCode: `SP-${id}`,
    name: 'Sellpia item',
    optionName: null,
    barcode: null,
    currentStock,
    purchasePrice: 1_000,
  };
}
