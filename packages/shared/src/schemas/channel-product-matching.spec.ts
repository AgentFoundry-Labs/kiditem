import { describe, expect, it } from 'vitest';
import {
  ChannelProductAutoMatchResponseSchema,
  ChannelProductCandidateListResponseSchema,
  ChannelProductMatchingCountsSchema,
  ChannelProductMatchingQueueResponseSchema,
  ChannelOptionInventoryComponentSchema,
  ChannelRecipeSuggestionResponseSchema,
  LinkChannelListingProductInputSchema,
} from './channel-product-matching';

const accountId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const optionId = '44444444-4444-4444-8444-444444444444';
const componentId = '55555555-5555-4555-8555-555555555555';
const inventorySkuId = '66666666-6666-4666-8666-666666666666';

describe('direct channel product and inventory matching contracts', () => {
  it('requires physical availability to equal current stock', () => {
    expect(ChannelOptionInventoryComponentSchema.safeParse({
      id: componentId,
      sellpiaInventorySkuId: inventorySkuId,
      code: 'SP-100',
      name: '낱개 재고',
      optionName: null,
      barcode: null,
      currentStock: 85,
      availableStock: 84,
      isActive: true,
      quantity: 10,
    }).success).toBe(false);
  });

  it('requires typed evidence for every product candidate', () => {
    expect(ChannelProductCandidateListResponseSchema.parse({
      items: [{
        masterProductId: productId,
        code: 'MP-1',
        name: '운영 상품',
        category: null,
        brand: null,
        reason: 'exact_code',
        evidence: {
          providerIdentity: null,
          code: 'MP-1',
          barcode: null,
          normalizedName: null,
          aiExplanation: null,
          score: null,
        },
        rank: 1,
      }],
    }).items).toHaveLength(1);
    expect(() => ChannelProductCandidateListResponseSchema.parse({
      items: [{
        masterProductId: productId,
        code: 'MP-1',
        name: '운영 상품',
        category: null,
        brand: null,
        reason: 'exact_code',
        evidence: {
          providerIdentity: null,
          code: null,
          barcode: null,
          normalizedName: null,
          aiExplanation: null,
          score: null,
        },
        rank: 1,
      }],
    })).toThrow();
  });

  it('parses one MasterProduct link and one direct channel option inventory recipe', () => {
    const parsed = ChannelProductMatchingQueueResponseSchema.parse({
      products: [{
        channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡 본계정' },
        listing: {
          id: listingId,
          externalId: '13712531060',
          displayName: '채널 상품',
          status: 'active',
          saleStatus: '판매중',
          masterProductId: productId,
          channelImageUrl: '/uploads/channel.jpg',
          updatedAt: '2026-08-03T00:00:00.000Z',
        },
        linkedProduct: {
          id: productId,
          code: 'MP-1',
          name: '운영 상품',
          displayImageUrl: '/uploads/master.jpg',
        },
        optionCount: 1,
        configuredOptionCount: 1,
      }],
      options: [{
        channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡 본계정' },
        listing: { id: listingId, externalId: '13712531060', masterProductId: productId },
        option: {
          id: optionId,
          externalOptionId: 'option-10',
          itemName: '10개 묶음',
          sellerSku: 'PACK-10',
          barcode: null,
          updatedAt: '2026-08-03T00:00:00.000Z',
          inventoryComponents: [{
            id: componentId,
            sellpiaInventorySkuId: inventorySkuId,
            code: 'SP-100',
            name: '낱개 재고',
            optionName: null,
            barcode: null,
            currentStock: 85,
            availableStock: 85,
            isActive: true,
            quantity: 10,
          }],
        },
        capacity: 8,
      }],
      counts: {
        products: { all: 1, linked: 1, unlinked: 0 },
        options: { all: 1, configured: 1, unconfigured: 0 },
      },
    });

    expect(parsed.options[0]?.option.inventoryComponents[0]).toMatchObject({
      sellpiaInventorySkuId: inventorySkuId,
      quantity: 10,
    });
    expect(parsed.options[0]?.capacity).toBe(8);
    expect(parsed.options[0]?.option).not.toHaveProperty('productVariantId');
  });

  it('requires configured and unconfigured counts to partition all options', () => {
    expect(ChannelProductMatchingCountsSchema.parse({
      products: { all: 2, linked: 1, unlinked: 1 },
      options: { all: 3, configured: 2, unconfigured: 1 },
    }).options.configured).toBe(2);
    expect(() => ChannelProductMatchingCountsSchema.parse({
      products: { all: 2, linked: 1, unlinked: 1 },
      options: { all: 3, configured: 3, unconfigured: 1 },
    })).toThrow();
  });

  it('accepts only the nullable listing-to-MasterProduct command', () => {
    expect(LinkChannelListingProductInputSchema.parse({ masterProductId: productId })).toEqual({ masterProductId: productId });
    expect(LinkChannelListingProductInputSchema.parse({ masterProductId: null })).toEqual({ masterProductId: null });
    expect(() => LinkChannelListingProductInputSchema.parse({ productVariantId: optionId })).toThrow();
  });

  it('publishes direct auto-match totals', () => {
    expect(ChannelProductAutoMatchResponseSchema.parse({
      evaluatedListings: 4,
      matchedListings: 2,
      configuredOptions: 3,
    })).toEqual({ evaluatedListings: 4, matchedListings: 2, configuredOptions: 3 });
  });

  it('keeps deterministic inventory evidence bounded to one channel option', () => {
    const parsed = ChannelRecipeSuggestionResponseSchema.parse({
      channelListingOptionId: optionId,
      masterProductId: productId,
      status: 'unique_code',
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
      reason: '판매자 SKU와 Sellpia 코드가 일치합니다.',
      existingComponents: [],
      proposals: [{
        sellpiaInventorySkuId: inventorySkuId,
        code: 'SP-100',
        name: '낱개 재고',
        optionName: null,
        currentStock: null,
        evidence: [{ kind: 'seller_sku_code', channelValue: 'SP-100', normalizedValue: 'SP-100' }],
        requiresQuantityConfirmation: false,
        recommendedQuantity: 1,
      }],
    });
    expect(parsed.channelListingOptionId).toBe(optionId);
    expect(parsed).not.toHaveProperty('productVariantId');
  });
});
