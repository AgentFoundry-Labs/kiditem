import { describe, expect, it } from 'vitest';
import {
  ChannelSkuAvailabilityListResponseSchema,
  ChannelSkuAvailabilityQuerySchema,
  ChannelSkuAvailabilityStatusSchema,
} from './channel-sku-availability';

const channelAccountId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000002';
const channelSkuId = '00000000-0000-4000-8000-000000000003';
const sellpiaInventorySkuId = '00000000-0000-4000-8000-000000000004';
const productVariantId = '00000000-0000-4000-8000-000000000005';
const masterProductId = '00000000-0000-4000-8000-000000000006';

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
        masterProductId: null,
        productVariantId: null,
        variantCode: null,
        variantName: null,
        recipeStatus: 'unmatched',
        components: [],
        warnings: [],
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
        masterProductId,
        productVariantId,
        variantCode: 'KI-001-8',
        variantName: '8개입',
        recipeStatus: 'matched',
        components: [{
          sellpiaInventorySkuId,
          code: 'SP-001',
          name: '상품',
          optionName: null,
          barcode: null,
          currentStock: 80,
          activeCommitmentQuantity: 16,
          availableStock: 64,
          purchasePrice: 1_500,
          isActive: true,
          quantity: 8,
          source: 'manual',
          componentCapacity: 8,
          isBottleneck: true,
        }],
        warnings: [],
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
      sellpiaInventorySkuId,
      componentCapacity: 8,
      isBottleneck: true,
      purchasePrice: 1_500,
    });
  });

  it('preserves inactive confirmed component evidence with a bounded warning', () => {
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
          sellerSku: null,
          optionName: null,
          barcode: null,
          modelNumber: null,
          salePrice: null,
          status: 'on_sale',
          mappingStatus: 'needs_review',
          sellableStock: null,
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        masterProductId,
        productVariantId,
        variantCode: 'KI-001-DEFAULT',
        variantName: '기본',
        recipeStatus: 'review_required',
        components: [{
          sellpiaInventorySkuId,
          code: 'SP-INACTIVE',
          name: 'Inactive item',
          optionName: null,
          barcode: null,
          currentStock: 0,
          activeCommitmentQuantity: 0,
          availableStock: 0,
          purchasePrice: 1_500,
          isActive: false,
          quantity: 1,
          source: 'manual',
          componentCapacity: 0,
          isBottleneck: false,
        }],
        warnings: ['component_inactive'],
      }],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        total: 1,
        inStock: 0,
        outOfStock: 0,
        unmatched: 0,
        needsReview: 1,
      },
    });

    expect(parsed.items[0]?.components[0]?.isActive).toBe(false);
    expect(parsed.items[0]?.warnings).toEqual(['component_inactive']);
  });

  it('accepts the bounded inactive-variant review warning', () => {
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
          sellerSku: null,
          optionName: null,
          barcode: null,
          modelNumber: null,
          salePrice: null,
          status: 'on_sale',
          mappingStatus: 'needs_review',
          sellableStock: null,
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        masterProductId,
        productVariantId,
        variantCode: 'KI-001-DEFAULT',
        variantName: '기본',
        recipeStatus: 'review_required',
        components: [],
        warnings: ['variant_inactive'],
      }],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        total: 1,
        inStock: 0,
        outOfStock: 0,
        unmatched: 0,
        needsReview: 1,
      },
    });

    expect(parsed.items[0]?.warnings).toEqual(['variant_inactive']);
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
