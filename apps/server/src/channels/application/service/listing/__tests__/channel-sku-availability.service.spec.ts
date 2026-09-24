import { describe, expect, it, vi } from 'vitest';
import { ChannelSkuAvailabilityService } from '../channel-sku-availability.service';
import { ChannelSkuAvailabilityItemSchema } from '@kiditem/shared/channel-sku-availability';

const organizationId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const listingId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const masterProductId = '00000000-0000-4000-8000-000000000005';
const skuId = '00000000-0000-4000-8000-000000000006';

function row(overrides: {
  masterProductId?: string | null;
  components?: unknown[];
  compositionUnconfirmed?: boolean;
  safetyStock?: number;
} = {}) {
  return {
    channelAccount: { id: accountId, channel: 'rocket', name: 'Rocket' },
    listing: {
      id: listingId,
      externalId: 'P-1',
      channelName: '채널 상품',
      displayName: null,
      status: 'active',
      masterProductId: overrides.masterProductId === undefined
        ? masterProductId
        : overrides.masterProductId,
    },
    compositionUnconfirmed: overrides.compositionUnconfirmed ?? false,
    option: {
      id: optionId,
      externalOptionId: 'OPTION-1',
      sellerSku: 'SELLER-1',
      itemName: '2개입',
      barcode: null,
      modelNumber: null,
      salePrice: 10_000,
      safetyStock: overrides.safetyStock ?? 0,
      status: 'active',
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    inventoryComponents: overrides.components ?? [{
      masterProductId: skuId,
      code: 'SP-1',
      name: '재고',
      optionName: null,
      barcode: null,
      currentStock: 999,
      purchasePrice: 1_000,
      quantity: 2,
    }],
  };
}

function dependencies(rows = [row()], inventoryItems = [{
  masterProductId: skuId,
  currentStock: 10,
  generation: '1',
}]) {
  const repository = {
    listAvailabilityRows: vi.fn().mockResolvedValue(rows),
    updateSafetyStock: vi.fn().mockResolvedValue(true),
  };
  const inventory = {
    findByMasterProductIds: vi.fn().mockResolvedValue({
      snapshot: { collected: true, generation: '1', verifiedAt: '2026-08-01T00:00:00.000Z' },
      items: inventoryItems,
    }),
  };
  return {
    repository,
    inventory,
    service: new ChannelSkuAvailabilityService(repository as never, inventory as never),
  };
}

describe('ChannelSkuAvailabilityService', () => {
  it('uses the same threshold for filters and summary without subtracting it from capacity', async () => {
    const low = row({ safetyStock: 5 });
    const high = { ...row({ safetyStock: 4 }), option: { ...row({ safetyStock: 4 }).option, id: skuId } };
    const { service } = dependencies([low, high]);
    const result = await service.list(organizationId, { status: 'out_of_stock', page: 1, limit: 50 });
    expect(result).toMatchObject({
      total: 1, summary: { total: 2, inStock: 1, outOfStock: 1 },
      items: [{ sku: { id: optionId, sellableStock: 5, safetyStock: 5 } }],
    });
    expect((await service.list(organizationId, { status: 'in_stock', page: 1, limit: 50 })).items)
      .toMatchObject([{ sku: { id: skuId } }]);
  });

  it('keeps mixed composition uncertainty unknown even when old capacity is zero', async () => {
    const { service } = dependencies([row({ masterProductId: null, compositionUnconfirmed: true, safetyStock: 5 })], [
      { masterProductId: skuId, currentStock: 0, generation: '1' },
    ]);
    const result = await service.list(organizationId, { status: 'all', page: 1, limit: 50 });
    expect(result.summary).toMatchObject({ inStock: 0, outOfStock: 0, needsReview: 1 });
    expect(ChannelSkuAvailabilityItemSchema.parse(result.items[0])).toMatchObject({
      masterProductId: null, warnings: ['composition_unconfirmed'],
      sku: { sellableStock: null, safetyStock: 5, mappingStatus: 'needs_review' },
    });
  });

  it('updates only the stored threshold without reading inventory or starting work', async () => {
    const { service, repository, inventory } = dependencies();
    await expect(service.updateSafetyStock(organizationId, optionId, 3))
      .resolves.toEqual({ channelListingOptionId: optionId, safetyStock: 3 });
    expect(repository.updateSafetyStock).toHaveBeenCalledWith(organizationId, optionId, 3);
    expect(repository.listAvailabilityRows).not.toHaveBeenCalled();
    expect(inventory.findByMasterProductIds).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity, 2_147_483_648])('rejects invalid safety stock %s without writing', async (value) => {
    const { service, repository } = dependencies();
    await expect(service.updateSafetyStock(organizationId, optionId, value)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
    expect(repository.updateSafetyStock).not.toHaveBeenCalled();
  });

  it('reports an option outside the organization as not found', async () => {
    const { service, repository } = dependencies();
    repository.updateSafetyStock.mockResolvedValue(false);
    await expect(service.updateSafetyStock(organizationId, optionId, 0)).rejects.toMatchObject({ code: 'CHANNELS_LISTING_NOT_FOUND', kind: 'not_found' });
  });
  it('calculates sellable capacity from the direct channel-option recipe and common availability', async () => {
    const { inventory, service } = dependencies();
    const [result] = await service.findByChannelSkuIds(organizationId, [optionId]);
    expect(inventory.findByMasterProductIds).toHaveBeenCalledWith({
      organizationId,
      masterProductIds: [skuId],
    });
    expect(result).toMatchObject({
      masterProductId,
      recipeStatus: 'matched',
      sku: { id: optionId, mappingStatus: 'matched', sellableStock: 5 },
      components: [{ quantity: 2, currentStock: 10, componentCapacity: 5, isBottleneck: true }],
    });
  });

  it('calculates a mixed listing option from its recipe without a listing-level product summary', async () => {
    const { service } = dependencies([row({ masterProductId: null })]);

    const [result] = await service.findByChannelSkuIds(organizationId, [optionId]);

    expect(result).toMatchObject({
      masterProductId: null,
      recipeStatus: 'matched',
      sku: { mappingStatus: 'matched', sellableStock: 5 },
    });
  });

  it('holds only the option selected by an unresolved composition execution', async () => {
    const secondOptionId = '00000000-0000-4000-8000-000000000007';
    const selected = row({ compositionUnconfirmed: true });
    const unaffected = {
      ...row(),
      option: { ...row().option, id: secondOptionId, externalOptionId: 'OPTION-2' },
    };
    const { service } = dependencies([selected, unaffected]);

    const results = await service.findByChannelSkuIds(organizationId, [optionId, secondOptionId]);
    const selectedResult = results.find((result) => result.sku.id === optionId);
    const unaffectedResult = results.find((result) => result.sku.id === secondOptionId);

    expect(selectedResult).toMatchObject({
      recipeStatus: 'review_required',
      sku: { mappingStatus: 'needs_review', sellableStock: null },
      components: [{ currentStock: 10, quantity: 2, componentCapacity: 5, isBottleneck: null }],
      warnings: ['composition_unconfirmed'],
    });
    expect(unaffectedResult).toMatchObject({
      recipeStatus: 'matched',
      sku: { mappingStatus: 'matched', sellableStock: 5 },
      components: [{ currentStock: 10, quantity: 2, componentCapacity: 5, isBottleneck: true }],
      warnings: [],
    });

    await expect(service.list(organizationId, { status: 'all', page: 1, limit: 50 }))
      .resolves.toMatchObject({
        summary: { total: 2, inStock: 1, outOfStock: 0, needsReview: 1 },
      });
  });

  it('marks a linked option without a recipe as configuration required', async () => {
    const { service } = dependencies([row({ components: [] })], []);
    const [result] = await service.findByChannelSkuIds(organizationId, [optionId]);
    expect(result).toMatchObject({
      recipeStatus: 'configuration_required',
      sku: { mappingStatus: 'needs_review', sellableStock: null },
      warnings: ['configuration_required'],
    });
  });

  it('marks a listing without a MasterProduct link as unmatched', async () => {
    const { service } = dependencies([row({ masterProductId: null, components: [] })], []);
    const [result] = await service.findByChannelSkuIds(organizationId, [optionId]);
    expect(result).toMatchObject({
      masterProductId: null,
      recipeStatus: 'unmatched',
      sku: { mappingStatus: 'unmatched', sellableStock: null },
    });
  });

  it('keeps a configured component unavailable when its published stock fact is missing', async () => {
    const { service } = dependencies([row()], []);

    const [result] = await service.findByChannelSkuIds(organizationId, [optionId]);

    expect(result).toMatchObject({
      recipeStatus: 'review_required',
      sku: { mappingStatus: 'needs_review', sellableStock: null },
      warnings: ['inventory_unavailable'],
      components: [{
        currentStock: null,
        componentCapacity: null,
        isBottleneck: null,
      }],
    });
  });

  it('filters after projection while retaining full summary counts', async () => {
    const secondOptionId = '00000000-0000-4000-8000-000000000007';
    const unmatched = {
      ...row({ masterProductId: null, components: [] }),
      option: { ...row().option, id: secondOptionId, externalOptionId: 'OPTION-2' },
    };
    const { service } = dependencies([row(), unmatched]);
    const result = await service.list(organizationId, {
      status: 'unmatched', page: 1, limit: 50,
    });
    expect(result).toMatchObject({
      total: 1,
      summary: { total: 2, inStock: 1, unmatched: 1 },
      items: [{ sku: { id: secondOptionId } }],
    });
  });
});
