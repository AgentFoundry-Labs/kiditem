import { describe, expect, it, vi } from 'vitest';
import { ChannelSkuAvailabilityService } from '../channel-sku-availability.service';

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
  const repository = { listAvailabilityRows: vi.fn().mockResolvedValue(rows) };
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
