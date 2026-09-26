import { describe, expect, it } from 'vitest';
import {
  InventorySkuSnapshotItemSchema,
  InventorySkuSnapshotListResponseSchema,
  InventorySkuStockStatusSchema,
  SellpiaInventorySkuActiveStatusSchema,
  SellpiaInventorySkuLinkStatusSchema,
} from './inventory-snapshot';

const masterProductId = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';
const productId = '00000000-0000-4000-8000-000000000003';
const firstChannelOptionId = '00000000-0000-4000-8000-000000000004';
const secondChannelOptionId = '00000000-0000-4000-8000-000000000005';
const channelListingId = '00000000-0000-4000-8000-000000000006';

const snapshotItem = {
  masterProductId,
  code: 'SP-001',
  name: '상품',
  optionName: null,
  barcode: null,
  currentStock: 8,
  purchasePrice: 1_000,
  stockValue: 8_000,
  lastOperationId: runId,
  lastImportedAt: '2026-07-12T00:00:00.000Z',
  linkedChannelOptionCount: 2,
  linkedProductCount: 1,
  linkedProducts: [{ id: productId, code: 'KI-001', name: 'KidItem 상품' }],
  linkedChannelOptions: [
    { id: firstChannelOptionId, masterProductId: productId, channelListingId, channel: 'coupang', externalOptionId: 'option-blue', itemName: '파랑' },
    { id: secondChannelOptionId, masterProductId: productId, channelListingId, channel: 'coupang', externalOptionId: 'option-red', itemName: '빨강' },
  ],
};

describe('InventorySku snapshot contracts', () => {
  it('parses the authoritative inventory snapshot response', () => {
    expect(InventorySkuSnapshotListResponseSchema.parse({
      items: [snapshotItem],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        totalSkus: 1,
        linkedSkus: 1,
        unlinkedSkus: 0,
        inStockSkus: 1,
        outOfStockSkus: 0,
        totalUnits: 8,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 0,
      },
      latestCollection: { operationId: runId, completedAt: '2026-07-12T00:00:00.000Z', generation: '7' },
    })).toBeDefined();
  });

  it('requires exhaustive linked and unlinked SKU coverage in the summary', () => {
    expect(() => InventorySkuSnapshotListResponseSchema.parse({
      items: [snapshotItem],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        totalSkus: 2,
        linkedSkus: 1,
        unlinkedSkus: 0,
        inStockSkus: 1,
        outOfStockSkus: 1,
        totalUnits: 8,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 0,
      },
      latestCollection: null,
    })).toThrow(/Linked and unlinked SKU counts/);
  });

  it('publishes only the supported stock filters', () => {
    expect(InventorySkuStockStatusSchema.options).toEqual([
      'all',
      'in_stock',
      'out_of_stock',
    ]);
    expect(() => InventorySkuStockStatusSchema.parse('low_stock')).toThrow();
  });

  it('publishes explicit all, active, and inactive membership filters', () => {
    expect(SellpiaInventorySkuActiveStatusSchema.options).toEqual([
      'all',
      'active',
      'inactive',
    ]);
  });

  it('publishes linked and unlinked inventory filters', () => {
    expect(SellpiaInventorySkuLinkStatusSchema.options).toEqual([
      'linked',
      'unlinked',
    ]);
  });

  it('preserves the canonical MasterProduct identity and rejects the retired SKU alias', () => {
    expect(InventorySkuSnapshotItemSchema.parse(snapshotItem).masterProductId)
      .toBe(masterProductId);
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      sellpiaInventorySkuId: masterProductId,
    })).toThrow(/sellpiaInventorySkuId|unrecognized/i);
  });

  it('requires linked destinations to agree with counts without a redundant wire status', () => {
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      linkedChannelOptionCount: 0,
      linkedProductCount: 0,
    })).toThrow();
    expect(InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      linkedChannelOptionCount: 0,
      linkedProductCount: 0,
      linkedProducts: [],
      linkedChannelOptions: [],
    })).not.toHaveProperty('linkStatus');
  });

  it('requires linked destination identities to agree with confirmed relation counts', () => {
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      linkedProducts: [],
    })).toThrow();
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      linkedChannelOptions: [{
        ...snapshotItem.linkedChannelOptions[0],
        masterProductId: '00000000-0000-4000-8000-000000000099',
      }, snapshotItem.linkedChannelOptions[1]],
    })).toThrow();
  });

  it.each([
    ['currentStock', { currentStock: -1 }],
    ['purchasePrice', { purchasePrice: -1 }],
    ['stockValue', { stockValue: -1 }],
  ])('rejects a negative %s', (_field, override) => {
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      ...override,
    })).toThrow();
  });

  it('keeps nullable prices and requires an unpriced stock value to be null', () => {
    expect(InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      purchasePrice: null,
      stockValue: null,
    })).toMatchObject({
      purchasePrice: null,
      stockValue: null,
    });

    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      purchasePrice: null,
      stockValue: 8_000,
    })).toThrow();
  });

  it('names the published collection by operation id, completion time and generation only', () => {
    const response = {
      items: [snapshotItem],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        totalSkus: 1,
        linkedSkus: 1,
        unlinkedSkus: 0,
        inStockSkus: 1,
        outOfStockSkus: 0,
        totalUnits: 8,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 0,
      },
      latestCollection: { operationId: runId, completedAt: '2026-07-12T00:00:00.000Z', generation: '7' },
    };
    expect(InventorySkuSnapshotListResponseSchema.parse(response).latestCollection).toEqual(response.latestCollection);
    expect(() => InventorySkuSnapshotListResponseSchema.parse({
      ...response,
      latestCollection: { ...response.latestCollection, generation: '-1' },
    })).toThrow();
  });
});
