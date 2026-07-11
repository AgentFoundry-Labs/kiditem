import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelsInventorySkuReadPort } from '../../port/out/cross-domain/inventory-sku-read.port';
import type {
  ChannelSkuMappingRepositoryPort,
  ChannelSkuMappingRow,
  UnmappedChannelSkuEvidenceRow,
} from '../../port/out/repository/channel-sku-mapping.repository.port';
import { ChannelSkuMappingService } from '../channel-sku-mapping.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const channelSkuId = '00000000-0000-4000-8000-000000000003';
const inventorySkuId = '00000000-0000-4000-8000-000000000004';
const secondInventorySkuId = '00000000-0000-4000-8000-000000000005';
const counts = { all: 1, unmatched: 0, needsReview: 0, matched: 1 };

describe('ChannelSkuMappingService', () => {
  it('hydrates component refs through one deduplicated Inventory owner read', async () => {
    const repository = makeRepository();
    repository.list.mockResolvedValue({
      rows: [mappingRow([componentRef(inventorySkuId, 2)]), mappingRow([
        componentRef(inventorySkuId, 1),
      ], secondInventorySkuId)],
      total: 2,
      counts: { ...counts, all: 2, matched: 2 },
    });
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([inventorySku(inventorySkuId)]);
    const service = new ChannelSkuMappingService(repository, inventory);

    const result = await service.list(organizationId, {
      page: 1,
      limit: 50,
      mappingStatus: 'all',
    });

    expect(inventory.findByIds).toHaveBeenCalledWith(organizationId, [inventorySkuId]);
    expect(result.items[0]?.components[0]).toEqual({
      inventorySkuId,
      sellpiaProductCode: 'SP-001',
      name: 'Sellpia item',
      optionName: 'Blue',
      barcode: '8801234567890',
      currentStock: 7,
      purchasePrice: 1_000,
      quantity: 2,
      mappingSource: 'manual',
      componentCapacity: 3,
      isBottleneck: true,
    });
    expect(result.items[0]?.sku.sellableStock).toBe(3);
    expect(result.items[0]?.sku.updatedAt).toBe('2026-07-11T00:00:00.000Z');
  });

  it('fails loudly when a persisted component target is missing from Inventory', async () => {
    const repository = makeRepository();
    repository.list.mockResolvedValue({
      rows: [mappingRow([componentRef(inventorySkuId, 1)])],
      total: 1,
      counts,
    });
    const service = new ChannelSkuMappingService(repository, makeInventory());

    await expect(service.list(organizationId, { page: 1, limit: 50 }))
      .rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('keeps unmatched mapping availability nullable', async () => {
    const repository = makeRepository();
    repository.list.mockResolvedValue({
      rows: [mappingRow([], channelSkuId, 'unmatched')],
      total: 1,
      counts: { all: 1, unmatched: 1, needsReview: 0, matched: 0 },
    });
    const service = new ChannelSkuMappingService(repository, makeInventory());

    const result = await service.list(organizationId, { page: 1, limit: 50 });

    expect(result.items[0]?.sku.sellableStock).toBeNull();
    expect(result.items[0]?.components).toEqual([]);
  });

  it('loads exact, normalized identifier, full-name suggestion, and manual pools then caps results', async () => {
    const repository = makeRepository();
    repository.findEvidence.mockResolvedValue(evidence({
      sellerSku: 'SP-001',
      modelNumber: '88 0123 4567 890',
      barcode: '880-123-456-7890',
      optionName: 'Blue SP-OPT',
      productNames: ['Registered Product', 'Display Product'],
    }));
    const inventory = makeInventory();
    inventory.findBySellpiaCodes.mockResolvedValue([inventorySku(inventorySkuId)]);
    inventory.findByBarcodes.mockResolvedValue([
      inventorySku(secondInventorySkuId, { sellpiaProductCode: 'SP-BAR' }),
    ]);
    inventory.search
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        inventorySku('00000000-0000-4000-8000-000000000006', {
          sellpiaProductCode: 'SP-MANUAL',
        }),
      ]);
    const service = new ChannelSkuMappingService(repository, inventory);

    const result = await service.candidates(organizationId, channelSkuId, {
      search: '  operator full query  ',
      limit: 2,
    });

    expect(inventory.findBySellpiaCodes).toHaveBeenCalledWith(
      organizationId,
      ['SP-001', '88 0123 4567 890', 'SP-OPT'],
    );
    expect(inventory.findByBarcodes).toHaveBeenCalledWith(
      organizationId,
      ['8801234567890'],
    );
    expect(inventory.search.mock.calls).toEqual([
      [organizationId, 'Blue SP-OPT', 10],
      [organizationId, 'Registered Product', 10],
      [organizationId, 'Display Product', 10],
      [organizationId, 'operator full query', 2],
    ]);
    expect(result.items).toHaveLength(2);
    expect(result.items.map(({ reason }) => reason)).toEqual([
      'exact_sellpia_code',
      'unique_barcode',
    ]);
  });

  it('refreshes only unmapped advisory statuses from batched deterministic evidence', async () => {
    const repository = makeRepository();
    repository.listUnmappedEvidence.mockResolvedValue([
      evidence({ channelSkuId, sellerSku: 'SP-001' }),
      evidence({
        channelSkuId: secondInventorySkuId,
        sellerSku: null,
        barcode: '880-1234-5678',
      }),
    ]);
    repository.list.mockResolvedValue({ rows: [], total: 0, counts: {
      all: 2,
      unmatched: 0,
      needsReview: 2,
      matched: 0,
    } });
    const inventory = makeInventory();
    inventory.findBySellpiaCodes.mockResolvedValue([inventorySku(inventorySkuId)]);
    inventory.findByBarcodes.mockResolvedValue([
      inventorySku(secondInventorySkuId, { barcode: '88012345678' }),
    ]);
    const service = new ChannelSkuMappingService(repository, inventory);

    const result = await service.refreshStatuses(organizationId, {
      channelAccountId: '00000000-0000-4000-8000-000000000010',
    });

    expect(inventory.findBySellpiaCodes).toHaveBeenCalledTimes(1);
    expect(inventory.findByBarcodes).toHaveBeenCalledTimes(1);
    expect(repository.updateUnmappedStatuses).toHaveBeenCalledWith(organizationId, [
      { channelSkuId, mappingStatus: 'needs_review' },
      { channelSkuId: secondInventorySkuId, mappingStatus: 'needs_review' },
    ]);
    expect(repository.updateUnmappedStatuses.mock.calls[0]?.[1])
      .not.toContainEqual(expect.objectContaining({ mappingStatus: 'matched' }));
    expect(result).toEqual({ all: 2, unmatched: 0, needsReview: 2, matched: 0 });
  });

  it.each([
    [{ components: [
      { inventorySkuId, quantity: 1 },
      { inventorySkuId, quantity: 2 },
    ] }],
    [{ components: [{ inventorySkuId, quantity: 0 }] }],
    [{ components: [{ inventorySkuId, quantity: 2_147_483_648 }] }],
  ])('rejects invalid complete replacements before any repository mutation', async (input) => {
    const repository = makeRepository();
    const service = new ChannelSkuMappingService(repository, makeInventory());

    await expect(service.replaceComponents(
      organizationId,
      userId,
      channelSkuId,
      input,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findEvidence).not.toHaveBeenCalled();
    expect(repository.replaceComponents).not.toHaveBeenCalled();
  });

  it('rejects missing or foreign InventorySku IDs before deleting current components', async () => {
    const repository = makeRepository();
    repository.findEvidence.mockResolvedValue(evidence());
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([inventorySku(inventorySkuId)]);
    const service = new ChannelSkuMappingService(repository, inventory);

    await expect(service.replaceComponents(organizationId, userId, channelSkuId, {
      components: [
        { inventorySkuId, quantity: 1 },
        { inventorySkuId: secondInventorySkuId, quantity: 2 },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceComponents).not.toHaveBeenCalled();
  });

  it('persists a nonempty manual recipe as matched with the authenticated user', async () => {
    const repository = makeRepository();
    repository.findEvidence.mockResolvedValue(evidence());
    repository.findOne.mockResolvedValue(mappingRow([componentRef(inventorySkuId, 4)]));
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([inventorySku(inventorySkuId)]);
    const service = new ChannelSkuMappingService(repository, inventory);

    const result = await service.replaceComponents(organizationId, userId, channelSkuId, {
      components: [{ inventorySkuId, quantity: 4 }],
    });

    expect(repository.replaceComponents).toHaveBeenCalledWith({
      organizationId,
      userId,
      channelSkuId,
      components: [{ inventorySkuId, quantity: 4 }],
      mappingSource: 'manual',
      nextStatus: 'matched',
    });
    expect(result.sku.mappingStatus).toBe('matched');
    expect(result.components[0]?.quantity).toBe(4);
  });

  it('treats an empty recipe as explicit unmapping and computes its advisory status', async () => {
    const repository = makeRepository();
    repository.findEvidence.mockResolvedValue(evidence({ sellerSku: 'SP-001' }));
    repository.findOne.mockResolvedValue(mappingRow([], channelSkuId, 'needs_review'));
    const inventory = makeInventory();
    inventory.findBySellpiaCodes.mockResolvedValue([inventorySku(inventorySkuId)]);
    const service = new ChannelSkuMappingService(repository, inventory);

    await service.replaceComponents(organizationId, userId, channelSkuId, { components: [] });

    expect(repository.replaceComponents).toHaveBeenCalledWith(expect.objectContaining({
      components: [],
      nextStatus: 'needs_review',
    }));
  });

  it('propagates repository mutation errors without returning false success', async () => {
    const mutationError = new Error('transaction rolled back');
    const repository = makeRepository();
    repository.findEvidence.mockResolvedValue(evidence());
    repository.replaceComponents.mockRejectedValue(mutationError);
    const inventory = makeInventory();
    inventory.findByIds.mockResolvedValue([inventorySku(inventorySkuId)]);
    const service = new ChannelSkuMappingService(repository, inventory);

    await expect(service.replaceComponents(organizationId, userId, channelSkuId, {
      components: [{ inventorySkuId, quantity: 1 }],
    })).rejects.toBe(mutationError);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the tenant-scoped ChannelSku evidence does not exist', async () => {
    const service = new ChannelSkuMappingService(makeRepository(), makeInventory());
    await expect(service.candidates(organizationId, channelSkuId, {}))
      .rejects.toBeInstanceOf(NotFoundException);
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
    findEvidence: vi
      .fn<ChannelSkuMappingRepositoryPort['findEvidence']>()
      .mockResolvedValue(null),
    listUnmappedEvidence: vi
      .fn<ChannelSkuMappingRepositoryPort['listUnmappedEvidence']>()
      .mockResolvedValue([]),
    updateUnmappedStatuses: vi
      .fn<ChannelSkuMappingRepositoryPort['updateUnmappedStatuses']>()
      .mockResolvedValue(undefined),
    replaceComponents: vi
      .fn<ChannelSkuMappingRepositoryPort['replaceComponents']>()
      .mockResolvedValue(undefined),
  };
}

function makeInventory() {
  return {
    findByIds: vi.fn<ChannelsInventorySkuReadPort['findByIds']>().mockResolvedValue([]),
    findBySellpiaCodes: vi
      .fn<ChannelsInventorySkuReadPort['findBySellpiaCodes']>()
      .mockResolvedValue([]),
    findByBarcodes: vi
      .fn<ChannelsInventorySkuReadPort['findByBarcodes']>()
      .mockResolvedValue([]),
    search: vi.fn<ChannelsInventorySkuReadPort['search']>().mockResolvedValue([]),
  };
}

function mappingRow(
  componentRefs: ChannelSkuMappingRow['componentRefs'] = [],
  id = channelSkuId,
  mappingStatus: ChannelSkuMappingRow['sku']['mappingStatus'] = componentRefs.length
    ? 'matched'
    : 'unmatched',
): ChannelSkuMappingRow {
  return {
    channelAccount: {
      id: '00000000-0000-4000-8000-000000000010',
      channel: 'coupang',
      name: 'Coupang Wing',
    },
    product: {
      id: '00000000-0000-4000-8000-000000000011',
      externalProductId: 'P-001',
      registeredName: 'Registered Product',
      displayName: 'Display Product',
      status: 'approved',
    },
    sku: {
      id,
      externalSkuId: 'S-001',
      sellerSku: 'SP-001',
      optionName: 'Blue',
      barcode: '8801234567890',
      modelNumber: null,
      salePrice: 10_000,
      status: 'on_sale',
      mappingStatus,
      updatedAt: new Date('2026-07-11T00:00:00.000Z'),
    },
    componentRefs,
  };
}

function componentRef(id: string, quantity: number) {
  return { inventorySkuId: id, quantity, mappingSource: 'manual' };
}

function evidence(
  overrides: Partial<UnmappedChannelSkuEvidenceRow> = {},
): UnmappedChannelSkuEvidenceRow {
  return {
    channelSkuId,
    sellerSku: null,
    modelNumber: null,
    barcode: null,
    productNames: [],
    optionName: null,
    ...overrides,
  };
}

function inventorySku(
  id: string,
  overrides: Partial<ReturnType<typeof inventorySkuBase>> = {},
) {
  return { ...inventorySkuBase(id), ...overrides };
}

function inventorySkuBase(id: string) {
  return {
    id,
    sellpiaProductCode: 'SP-001',
    name: 'Sellpia item',
    optionName: 'Blue',
    barcode: '8801234567890',
    currentStock: 7,
    purchasePrice: 1_000,
  };
}
