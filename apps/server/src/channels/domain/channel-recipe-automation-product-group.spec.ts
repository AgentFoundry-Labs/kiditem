import { describe, expect, it } from 'vitest';
import type { ChannelRecipeAutomationItem } from '@kiditem/shared/channel-recipe-automation';
import {
  classifyRecipeAutomationProductGroups,
  type ChannelRecipeAutomationProductTopology,
} from './channel-recipe-automation-product-group';

const autoItem = item('variant-a', 'option-a', 'auto_apply');
const configuredItem = item('variant-b', 'option-b', 'already_configured');
const reviewItem = item('variant-b', 'option-b', 'operator_review');

describe('classifyRecipeAutomationProductGroups', () => {
  it('allows automatic variants when every other child is already configured', () => {
    expect(classifyRecipeAutomationProductGroups([
      product([option('option-b', 'variant-b'), option('option-a', 'variant-a')]),
    ], [configuredItem, autoItem])).toEqual([expect.objectContaining({
      decision: 'auto_apply',
      channelListingOptionIds: ['option-a', 'option-b'],
      productVariantIds: ['variant-a', 'variant-b'],
      autoApplyProductVariantIds: ['variant-a'],
    })]);
  });

  it('withholds every automatic variant when one child needs operator review', () => {
    expect(classifyRecipeAutomationProductGroups([
      product([option('option-a', 'variant-a'), option('option-b', 'variant-b')]),
    ], [autoItem, reviewItem])).toEqual([expect.objectContaining({
      decision: 'operator_review',
      autoApplyProductVariantIds: [],
    })]);
  });

  it('blocks a product containing an unlinked option', () => {
    expect(classifyRecipeAutomationProductGroups([
      product([option('option-a', 'variant-a'), option('option-b', null)]),
    ], [autoItem])).toEqual([expect.objectContaining({
      decision: 'blocked',
      autoApplyProductVariantIds: [],
    })]);
  });

  it('blocks a product without a confirmed master product link', () => {
    expect(classifyRecipeAutomationProductGroups([
      { ...product([option('option-a', 'variant-a')]), masterProductId: null },
    ], [autoItem])).toEqual([expect.objectContaining({
      decision: 'blocked',
      autoApplyProductVariantIds: [],
    })]);
  });
});

function product(
  options: ChannelRecipeAutomationProductTopology['options'],
): ChannelRecipeAutomationProductTopology {
  return {
    channelListingId: 'listing-a',
    masterProductId: 'master-a',
    options,
  };
}

function option(channelListingOptionId: string, productVariantId: string | null) {
  return { channelListingOptionId, productVariantId };
}

function item(
  productVariantId: string,
  channelListingOptionId: string,
  decision: ChannelRecipeAutomationItem['decision'],
): ChannelRecipeAutomationItem {
  return {
    productVariantId,
    masterProductId: 'master-a',
    channelListingOptionIds: [channelListingOptionId],
    decision,
    reason: decision === 'auto_apply' ? 'exact_unique_code' : decision === 'already_configured'
      ? 'already_configured'
      : 'quantity_review',
    sellpiaInventorySkuId: decision === 'auto_apply' ? 'sku-a' : null,
    sellpiaCode: decision === 'auto_apply' ? 'SP-A' : null,
    recommendedQuantity: decision === 'auto_apply' ? 1 : null,
    evidenceLabels: [],
  };
}
