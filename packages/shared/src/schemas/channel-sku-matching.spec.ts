import { describe, expect, it } from 'vitest';
import { ChannelAccountListItemSchema } from './channel-account';
import {
  ChannelSkuMappingListResponseSchema,
  ChannelSkuMappingStatusSchema,
  ChannelSkuMatchCandidateListResponseSchema,
  ChannelSkuMatchCandidateReasonSchema,
  MAX_CHANNEL_SKU_COMPONENTS,
  RefreshChannelSkuMappingStatusInputSchema,
  RefreshChannelSkuMappingStatusResponseSchema,
  ReplaceChannelSkuComponentsInputSchema,
} from './channel-sku-matching';

const channelAccountId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000002';
const channelSkuId = '00000000-0000-4000-8000-000000000003';
const inventorySkuId = '00000000-0000-4000-8000-000000000004';
const secondInventorySkuId = '00000000-0000-4000-8000-000000000005';

const component = {
  inventorySkuId,
  sellpiaProductCode: 'SP-001',
  name: '실리콘 식판',
  optionName: '핑크',
  barcode: '8801234567890',
  reportedStock: 17,
  quantity: 1,
  mappingSource: 'exact_sellpia_code',
};

const listItem = {
  channelAccount: {
    id: channelAccountId,
    channel: 'coupang',
    name: '쿠팡 메인',
  },
  product: {
    id: productId,
    externalProductId: 'CP-PRODUCT-1',
    registeredName: '실리콘 식판 세트',
    displayName: '키즈 실리콘 식판',
    status: 'approved',
  },
  sku: {
    id: channelSkuId,
    externalSkuId: 'CP-SKU-1',
    sellerSku: 'SELLER-SKU-1',
    optionName: '4개입',
    barcode: null,
    modelNumber: 'MODEL-1',
    salePrice: 24_900,
    status: 'active',
    mappingStatus: 'matched',
    updatedAt: '2026-07-11T00:00:00.000Z',
  },
  components: [component],
};

describe('channel SKU matching contracts', () => {
  it('accepts only the frozen mapping statuses', () => {
    expect(ChannelSkuMappingStatusSchema.options).toEqual([
      'unmatched',
      'needs_review',
      'matched',
    ]);
    expect(() => ChannelSkuMappingStatusSchema.parse('conflict')).toThrow();
  });

  it('keeps account, parent product, channel SKU, and Sellpia component metadata independent', () => {
    const parsed = ChannelSkuMappingListResponseSchema.parse({
      items: [listItem],
      total: 1,
      page: 1,
      limit: 20,
      counts: { all: 1, unmatched: 0, needsReview: 0, matched: 1 },
    });

    expect(parsed.items[0]).toMatchObject({
      channelAccount: { id: channelAccountId, channel: 'coupang', name: '쿠팡 메인' },
      product: { id: productId, externalProductId: 'CP-PRODUCT-1' },
      sku: { id: channelSkuId, externalSkuId: 'CP-SKU-1', mappingStatus: 'matched' },
      components: [{ inventorySkuId, sellpiaProductCode: 'SP-001', reportedStock: 17 }],
    });
  });

  it('publishes channel-account selector metadata', () => {
    expect(ChannelAccountListItemSchema.parse({
      id: channelAccountId,
      channel: 'coupang',
      name: '쿠팡 메인',
      externalAccountId: 'external-account-1',
      vendorId: 'vendor-1',
      sellerId: 'seller-1',
      isPrimary: true,
    })).toMatchObject({ id: channelAccountId, isPrimary: true });
  });

  it('keeps reported stock in responses and rejects it from replacement input', () => {
    expect(ChannelSkuMappingListResponseSchema.parse({
      items: [listItem],
      total: 1,
      page: 1,
      limit: 20,
      counts: { all: 1, unmatched: 0, needsReview: 0, matched: 1 },
    }).items[0]?.components[0]?.reportedStock).toBe(17);

    expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
      components: [{ inventorySkuId, quantity: 1, reportedStock: 17 }],
    })).toThrow();
  });

  it('parses a same-SKU four-pack', () => {
    expect(ReplaceChannelSkuComponentsInputSchema.parse({
      components: [{ inventorySkuId, quantity: 4 }],
    })).toEqual({ components: [{ inventorySkuId, quantity: 4 }] });
  });

  it('parses a mixed two-component recipe', () => {
    expect(ReplaceChannelSkuComponentsInputSchema.parse({
      components: [
        { inventorySkuId, quantity: 1 },
        { inventorySkuId: secondInventorySkuId, quantity: 2 },
      ],
    }).components).toHaveLength(2);
  });

  it('exports the 50-component limit and rejects a 51-row replacement', () => {
    expect(MAX_CHANNEL_SKU_COMPONENTS).toBe(50);
    const components = Array.from({ length: MAX_CHANNEL_SKU_COMPONENTS + 1 }, (_, index) => ({
      inventorySkuId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      quantity: 1,
    }));

    expect(() => ReplaceChannelSkuComponentsInputSchema.parse({ components })).toThrow();
  });

  it('accepts explicit unmapping and rejects duplicate InventorySku IDs', () => {
    expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
      components: [
        { inventorySkuId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
        { inventorySkuId: '00000000-0000-4000-8000-000000000001', quantity: 2 },
      ],
    })).toThrow(/duplicate/i);

    expect(ReplaceChannelSkuComponentsInputSchema.parse({ components: [] })).toEqual({ components: [] });
  });

  it('rejects duplicate InventorySku IDs that differ only by UUID casing', () => {
    expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
      components: [
        { inventorySkuId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: 1 },
        { inventorySkuId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', quantity: 2 },
      ],
    })).toThrow(/duplicate/i);
  });

  it.each([0, -1, 1.5])('rejects invalid component quantity %s', (quantity) => {
    expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
      components: [{ inventorySkuId, quantity }],
    })).toThrow();
  });

  it('strictly rejects privilege-looking and response-only replacement fields', () => {
    for (const extra of [
      { mappingSource: 'manual' },
      { createdBy: '00000000-0000-4000-8000-000000000006' },
      { organizationId: '00000000-0000-4000-8000-000000000007' },
    ]) {
      expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
        components: [{ inventorySkuId, quantity: 1 }],
        ...extra,
      })).toThrow();
    }

    expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
      components: [{ inventorySkuId, quantity: 1, mappingSource: 'manual' }],
    })).toThrow();
  });

  it('accepts only the frozen candidate reasons', () => {
    expect(ChannelSkuMatchCandidateReasonSchema.options).toEqual([
      'exact_sellpia_code',
      'unique_barcode',
      'ambiguous_identifier',
      'name_suggestion',
      'manual_search',
    ]);
    expect(() => ChannelSkuMatchCandidateReasonSchema.parse('fuzzy_barcode')).toThrow();
  });

  it('parses candidate lists with display stock and reason metadata', () => {
    expect(ChannelSkuMatchCandidateListResponseSchema.parse({
      items: [{
        inventorySkuId,
        sellpiaProductCode: 'SP-001',
        name: '실리콘 식판',
        optionName: '핑크',
        barcode: '8801234567890',
        reportedStock: 17,
        reason: 'unique_barcode',
        rank: 0,
      }],
    }).items[0]?.reason).toBe('unique_barcode');
  });

  it('strictly scopes refresh requests and returns mapping counts', () => {
    expect(RefreshChannelSkuMappingStatusInputSchema.parse({ channelAccountId })).toEqual({
      channelAccountId,
    });
    expect(() => RefreshChannelSkuMappingStatusInputSchema.parse({
      channelAccountId,
      organizationId: '00000000-0000-4000-8000-000000000007',
    })).toThrow();
    expect(RefreshChannelSkuMappingStatusResponseSchema.parse({
      all: 3,
      unmatched: 1,
      needsReview: 1,
      matched: 1,
    }).all).toBe(3);
  });
});
