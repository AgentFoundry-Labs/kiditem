import { describe, expect, it } from 'vitest';
import {
  ChannelSkuAvailabilityItemSchema,
  ChannelSkuAvailabilityListResponseSchema,
  ChannelSkuAvailabilityQuerySchema,
} from './channel-sku-availability';

const accountId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';
const optionId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const inventorySkuId = '55555555-5555-4555-8555-555555555555';

describe('direct channel option availability contracts', () => {
  it('keeps an unlinked channel option stock unknown', () => {
    const parsed = ChannelSkuAvailabilityItemSchema.parse(item({
      masterProductId: null,
      recipeStatus: 'unmatched',
      mappingStatus: 'unmatched',
      sellableStock: null,
      components: [],
    }));

    expect(parsed.sku.id).toBe(optionId);
    expect(parsed.sku.sellableStock).toBeNull();
    expect(parsed).not.toHaveProperty('productVariantId');
  });

  it('publishes component capacity and bottleneck evidence from the direct recipe', () => {
    const parsed = ChannelSkuAvailabilityItemSchema.parse(item({
      masterProductId: productId,
      recipeStatus: 'matched',
      mappingStatus: 'matched',
      sellableStock: 9,
      components: [component()],
    }));

    expect(parsed.components[0]).toMatchObject({ quantity: 10, componentCapacity: 9, isBottleneck: true });
    expect(parsed.sku.sellableStock).toBe(9);
  });

  it('rejects the retired duplicate available stock field', () => {
    expect(() => ChannelSkuAvailabilityItemSchema.parse(item({
      masterProductId: productId,
      recipeStatus: 'matched',
      mappingStatus: 'matched',
      sellableStock: 8,
      components: [{ ...component(), availableStock: 85 }],
    }))).toThrow();
  });

  it('keeps missing inventory in a bounded review state', () => {
    const parsed = ChannelSkuAvailabilityItemSchema.parse(item({
      masterProductId: productId,
      recipeStatus: 'review_required',
      mappingStatus: 'needs_review',
      sellableStock: null,
      components: [{ ...component(), currentStock: null }],
      warnings: ['inventory_unavailable'],
    }));
    expect(parsed.warnings).toEqual(['inventory_unavailable']);
  });

  it('parses query defaults and summary partitions', () => {
    expect(ChannelSkuAvailabilityQuerySchema.parse({})).toMatchObject({ status: 'all', page: 1, limit: 50 });
    expect(ChannelSkuAvailabilityListResponseSchema.parse({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      summary: { total: 0, inStock: 0, outOfStock: 0, unmatched: 0, needsReview: 0 },
    }).items).toEqual([]);
  });
});

function component() {
  return {
    masterProductId: inventorySkuId,
    code: 'SP-100',
    name: '낱개 재고',
    optionName: null,
    barcode: null,
    currentStock: 90,
    purchasePrice: 1_000,
    quantity: 10,
    componentCapacity: 9,
    isBottleneck: true,
  };
}

function item(overrides: {
  masterProductId: string | null;
  recipeStatus: 'unmatched' | 'configuration_required' | 'review_required' | 'matched';
  mappingStatus: 'unmatched' | 'needs_review' | 'matched';
  sellableStock: number | null;
  components: Array<Omit<ReturnType<typeof component>, 'currentStock'> & { currentStock: number | null }>;
  warnings?: Array<'inventory_unavailable' | 'configuration_required'>;
}) {
  return {
    channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡 본계정' },
    product: {
      id: listingId,
      externalProductId: '13712531060',
      registeredName: '채널 상품',
      displayName: '채널 상품',
      status: 'active',
    },
    sku: {
      id: optionId,
      externalSkuId: 'option-10',
      sellerSku: 'PACK-10',
      optionName: '10개 묶음',
      barcode: null,
      modelNumber: null,
      salePrice: 12_000,
      status: 'active',
      mappingStatus: overrides.mappingStatus,
      sellableStock: overrides.sellableStock,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    masterProductId: overrides.masterProductId,
    recipeStatus: overrides.recipeStatus,
    components: overrides.components,
    warnings: overrides.warnings ?? [],
  };
}
