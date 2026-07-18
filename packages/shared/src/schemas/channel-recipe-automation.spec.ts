import { describe, expect, it } from 'vitest';
import {
  ApplyChannelRecipeAutomationInputSchema,
  ChannelRecipeAutomationPreviewSchema,
} from './channel-recipe-automation';

describe('channel recipe automation contracts', () => {
  it('accepts a version-fenced preview with explicit variant and option counts', () => {
    expect(ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        variants: 3,
        affectedOptions: 4,
        autoApply: 1,
        operatorReview: 1,
        blocked: 1,
        alreadyConfigured: 0,
      },
      items: [],
    }).proposalVersion).toHaveLength(64);
  });

  it('requires the exact preview version when applying', () => {
    expect(() => ApplyChannelRecipeAutomationInputSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'stale',
    })).toThrow();
  });

  it('requires one quantity-one SKU for an automatic item', () => {
    expect(() => ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        variants: 1,
        affectedOptions: 1,
        autoApply: 1,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      items: [{
        productVariantId: '22222222-2222-4222-8222-222222222222',
        masterProductId: '33333333-3333-4333-8333-333333333333',
        channelListingOptionIds: ['44444444-4444-4444-8444-444444444444'],
        decision: 'auto_apply',
        reason: 'exact_unique_code',
        sellpiaInventorySkuId: null,
        sellpiaCode: null,
        recommendedQuantity: null,
        evidenceLabels: ['seller_sku_code:SP-1'],
      }],
    })).toThrow(/quantity 1/);
  });
});
