import { describe, expect, it } from 'vitest';
import {
  ChannelSkuAvailabilityListResponseSchema,
  ChannelSkuAvailabilityQuerySchema,
  ChannelSkuAvailabilityStatusSchema,
} from './channel-sku-availability';

const channelAccountId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000002';
const channelSkuId = '00000000-0000-4000-8000-000000000003';
const inventorySkuId = '00000000-0000-4000-8000-000000000004';

describe('channel SKU availability contracts', () => {
  it('freezes the calculated availability filters', () => {
    expect(ChannelSkuAvailabilityStatusSchema.options).toEqual([
      'all',
      'in_stock',
      'out_of_stock',
      'unmatched',
      'needs_review',
    ]);
  });

  it('keeps unmapped availability unknown instead of claiming zero stock', () => {
    const parsed = ChannelSkuAvailabilityListResponseSchema.parse({
      items: [{
        channelAccount: { id: channelAccountId, channel: 'coupang', name: 'Wing' },
        product: {
          id: productId,
          externalProductId: 'P-001',
          registeredName: 'Registered',
          displayName: 'Display',
          status: 'approved',
        },
        sku: {
          id: channelSkuId,
          externalSkuId: 'S-001',
          sellerSku: null,
          optionName: null,
          barcode: null,
          modelNumber: null,
          salePrice: null,
          status: 'on_sale',
          mappingStatus: 'unmatched',
          sellableStock: null,
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        components: [],
      }],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        total: 1,
        inStock: 0,
        outOfStock: 0,
        unmatched: 1,
        needsReview: 0,
      },
    });

    expect(parsed.items[0]?.sku.sellableStock).toBeNull();
  });

  it('publishes exact component capacity and bottleneck evidence', () => {
    const parsed = ChannelSkuAvailabilityListResponseSchema.parse({
      items: [{
        channelAccount: { id: channelAccountId, channel: 'coupang', name: 'Wing' },
        product: {
          id: productId,
          externalProductId: 'P-001',
          registeredName: null,
          displayName: null,
          status: null,
        },
        sku: {
          id: channelSkuId,
          externalSkuId: 'S-001',
          sellerSku: 'SP-001',
          optionName: '8개입',
          barcode: null,
          modelNumber: null,
          salePrice: 20_000,
          status: 'on_sale',
          mappingStatus: 'matched',
          sellableStock: 10,
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        components: [{
          inventorySkuId,
          sellpiaProductCode: 'SP-001',
          name: '상품',
          optionName: null,
          barcode: null,
          currentStock: 80,
          purchasePrice: 1_500,
          quantity: 8,
          mappingSource: 'manual',
          componentCapacity: 10,
          isBottleneck: true,
        }],
      }],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        total: 1,
        inStock: 1,
        outOfStock: 0,
        unmatched: 0,
        needsReview: 0,
      },
    });

    expect(parsed.items[0]?.components[0]).toMatchObject({
      componentCapacity: 10,
      isBottleneck: true,
      purchasePrice: 1_500,
    });
  });

  it('strictly validates public list queries', () => {
    expect(ChannelSkuAvailabilityQuerySchema.parse({
      channelAccountId,
      status: 'out_of_stock',
      hasBottleneck: true,
      search: '  식판  ',
      page: 2,
      limit: 25,
    })).toMatchObject({
      status: 'out_of_stock',
      hasBottleneck: true,
      page: 2,
      limit: 25,
    });
    expect(() => ChannelSkuAvailabilityQuerySchema.parse({
      page: 1,
      limit: 50,
      organizationId: channelAccountId,
    })).toThrow();
  });
});
