import { describe, expect, it } from 'vitest';
import {
  ApplyChannelRecipeAutomationInputSchema,
  ApplyChannelRecipeAutomationResponseSchema,
  ChannelRecipeAutomationPreviewSchema,
} from './channel-recipe-automation';

const productGroup = {
  channelListingId: '55555555-5555-4555-8555-555555555555',
  masterProductId: '33333333-3333-4333-8333-333333333333',
  channelListingOptionIds: ['44444444-4444-4444-8444-444444444444'],
  productVariantIds: ['22222222-2222-4222-8222-222222222222'],
  decision: 'auto_apply' as const,
  autoApplyProductVariantIds: ['22222222-2222-4222-8222-222222222222'],
};

describe('channel recipe automation contracts', () => {
  it('accepts a version-fenced preview with explicit variant and option counts', () => {
    expect(ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: 1,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        variants: 3,
        affectedOptions: 4,
        autoApply: 1,
        operatorReview: 1,
        blocked: 1,
        alreadyConfigured: 0,
      },
      productGroups: [productGroup],
      items: [],
    }).proposalVersion).toHaveLength(64);
  });

  it('rejects an automatic product group without an automatic variant', () => {
    expect(() => ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: 1,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        variants: 1,
        affectedOptions: 1,
        autoApply: 1,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [{
        ...productGroup,
        autoApplyProductVariantIds: [],
      }],
      items: [],
    })).toThrow(/automatic variant/);
  });

  it('allows safe automatic variants within an operator-review product group', () => {
    expect(ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: 0,
        operatorReviewProducts: 1,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        variants: 1,
        affectedOptions: 1,
        autoApply: 1,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [{
        ...productGroup,
        decision: 'operator_review',
      }],
      items: [],
    }).productGroups[0]?.autoApplyProductVariantIds).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('requires the exact preview version when applying', () => {
    expect(() => ApplyChannelRecipeAutomationInputSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'stale',
    })).toThrow();
  });

  it('requires one SKU with a positive quantity for an automatic item', () => {
    expect(() => ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 1,
        autoApplyProducts: 1,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        variants: 1,
        affectedOptions: 1,
        autoApply: 1,
        operatorReview: 0,
        blocked: 0,
        alreadyConfigured: 0,
      },
      productGroups: [productGroup],
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
    })).toThrow(/positive quantity/);
  });

  it('accepts product-level apply counts', () => {
    expect(ApplyChannelRecipeAutomationResponseSchema.parse({
      proposalVersion: 'a'.repeat(64),
      appliedProducts: 1,
      skippedProducts: 2,
      appliedVariants: 1,
      affectedOptions: 1,
      skippedExistingVariants: 0,
    })).toMatchObject({
      appliedProducts: 1,
      skippedProducts: 2,
    });
  });
});
