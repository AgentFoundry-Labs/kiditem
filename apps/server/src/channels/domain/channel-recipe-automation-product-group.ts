import type {
  ChannelRecipeAutomationItem,
  ChannelRecipeAutomationProductGroup,
} from '@kiditem/shared/channel-recipe-automation';

export type ChannelRecipeAutomationProductTopology = {
  channelListingId: string;
  masterProductId: string | null;
  options: Array<{
    channelListingOptionId: string;
    productVariantId: string | null;
  }>;
};

export function classifyRecipeAutomationProductGroups(
  products: ChannelRecipeAutomationProductTopology[],
  items: ChannelRecipeAutomationItem[],
): ChannelRecipeAutomationProductGroup[] {
  const itemsByOptionId = new Map<string, ChannelRecipeAutomationItem>();
  for (const item of items) {
    for (const channelListingOptionId of item.channelListingOptionIds) {
      itemsByOptionId.set(channelListingOptionId, item);
    }
  }

  return products.map((product) => {
    const channelListingOptionIds = product.options
      .map((option) => option.channelListingOptionId)
      .sort();
    const productVariantIds = [...new Set(product.options
      .map((option) => option.productVariantId)
      .filter((id): id is string => id !== null))]
      .sort();
    const childDecisions = product.options.map((option) => {
      if (!option.productVariantId) return 'blocked' as const;
      return itemsByOptionId.get(option.channelListingOptionId)?.decision ?? 'blocked';
    });
    const decision = product.masterProductId === null
      ? 'blocked'
      : groupDecision(childDecisions);
    const autoApplyProductVariantIds = decision === 'auto_apply'
      ? [...new Set(product.options.flatMap((option) => {
        const item = itemsByOptionId.get(option.channelListingOptionId);
        return item?.decision === 'auto_apply' ? [item.productVariantId] : [];
      }))].sort()
      : [];

    return {
      channelListingId: product.channelListingId,
      masterProductId: product.masterProductId,
      channelListingOptionIds,
      productVariantIds,
      decision,
      autoApplyProductVariantIds,
    };
  }).sort((left, right) => left.channelListingId.localeCompare(right.channelListingId));
}

function groupDecision(
  decisions: ChannelRecipeAutomationItem['decision'][],
): ChannelRecipeAutomationItem['decision'] {
  if (decisions.includes('blocked')) return 'blocked';
  if (decisions.includes('operator_review')) return 'operator_review';
  if (decisions.includes('auto_apply')) return 'auto_apply';
  return 'already_configured';
}
