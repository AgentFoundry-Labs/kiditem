import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  ApplyChannelRecipeAutomationInputSchema,
  ApplyChannelRecipeAutomationResponseSchema,
  ChannelRecipeAutomationPreviewSchema,
  type ChannelRecipeAutomationItem,
  type ChannelRecipeAutomationProductGroup,
  type ChannelRecipeAutomationReason,
} from '@kiditem/shared/channel-recipe-automation';
import {
  PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT,
  type ProductVariantRecipeAutomationPort,
} from '../../../products/application/port/in/product-variant-recipe-automation.port';
import type { ChannelRecipeSuggestionResponse } from '../../domain/channel-recipe-suggestion';
import { classifyRecipeAutomationProductGroups } from '../../domain/channel-recipe-automation-product-group';
import {
  CHANNEL_RECIPE_AUTOMATION_CONTEXT_REPOSITORY_PORT,
  type ChannelRecipeAutomationContext,
  type ChannelRecipeAutomationContextRepositoryPort,
} from '../port/out/repository/channel-recipe-automation-context.repository.port';
import { ChannelRecipeSuggestionService } from './channel-recipe-suggestion.service';

@Injectable()
export class ChannelRecipeAutomationService {
  constructor(
    @Inject(CHANNEL_RECIPE_AUTOMATION_CONTEXT_REPOSITORY_PORT)
    private readonly contexts: ChannelRecipeAutomationContextRepositoryPort,
    private readonly suggestions: ChannelRecipeSuggestionService,
    @Inject(PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT)
    private readonly products: ProductVariantRecipeAutomationPort,
  ) {}

  async preview(organizationId: string, channelAccountId: string) {
    const accountContext = await this.contexts.listContexts(organizationId, channelAccountId);
    const suggestions = await this.suggestions.suggestBatch(
      organizationId,
      accountContext.variants,
    );
    const suggestionByVariant = new Map(suggestions.map((suggestion) => [
      suggestion.productVariantId,
      suggestion,
    ]));
    const items = accountContext.variants.map((context) => toPreviewItem(
      context,
      requiredSuggestion(suggestionByVariant, context.productVariantId),
    )).sort((left, right) => left.productVariantId.localeCompare(right.productVariantId));
    const productGroups = classifyRecipeAutomationProductGroups(
      accountContext.products,
      items,
    );

    return ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId,
      proposalVersion: proposalVersion(items, productGroups),
      generatedAt: new Date().toISOString(),
      summary: {
        products: productGroups.length,
        autoApplyProducts: productGroups.filter((group) =>
          group.autoApplyProductVariantIds.length > 0).length,
        operatorReviewProducts: countDecision(productGroups, 'operator_review'),
        blockedProducts: countDecision(productGroups, 'blocked'),
        alreadyConfiguredProducts: countDecision(productGroups, 'already_configured'),
        variants: items.length,
        affectedOptions: items.reduce(
          (sum, item) => sum + item.channelListingOptionIds.length,
          0,
        ),
        autoApply: countDecision(items, 'auto_apply'),
        operatorReview: countDecision(items, 'operator_review'),
        blocked: countDecision(items, 'blocked'),
        alreadyConfigured: countDecision(items, 'already_configured'),
      },
      productGroups,
      items,
    });
  }

  async apply(organizationId: string, body: unknown) {
    const input = ApplyChannelRecipeAutomationInputSchema.parse(body);
    const preview = await this.preview(organizationId, input.channelAccountId);
    if (input.proposalVersion !== preview.proposalVersion) {
      throw new ConflictException(
        'Recipe automation preview changed; refresh and review again',
      );
    }
    const safeVariantIds = new Set(preview.productGroups.flatMap((group) =>
      group.autoApplyProductVariantIds));
    const automaticItems = preview.items.filter((item) =>
      item.decision === 'auto_apply' && safeVariantIds.has(item.productVariantId));
    const result = await this.products.applyIfEmpty({
      organizationId,
      recipes: automaticItems.map((item) => ({
        productVariantId: item.productVariantId,
        sellpiaInventorySkuId: item.sellpiaInventorySkuId!,
        quantity: item.recommendedQuantity!,
      })),
    });
    const appliedIds = new Set(result.appliedProductVariantIds);
    const appliedProducts = preview.productGroups.filter((group) =>
      group.autoApplyProductVariantIds.some((id) => appliedIds.has(id))).length;
    return ApplyChannelRecipeAutomationResponseSchema.parse({
      proposalVersion: preview.proposalVersion,
      appliedProducts,
      skippedProducts: preview.productGroups.length - appliedProducts,
      appliedVariants: result.appliedProductVariantIds.length,
      affectedOptions: automaticItems
        .filter((item) => appliedIds.has(item.productVariantId))
        .reduce((sum, item) => sum + item.channelListingOptionIds.length, 0),
      skippedExistingVariants: result.skippedExistingProductVariantIds.length,
    });
  }
}

function toPreviewItem(
  context: ChannelRecipeAutomationContext,
  suggestion: ChannelRecipeSuggestionResponse,
): ChannelRecipeAutomationItem {
  const proposals = suggestion.proposals;
  const singleProposal = proposals.length === 1 ? proposals[0]! : null;
  const existing = suggestion.existingComponents.length === 1
    ? suggestion.existingComponents[0]!
    : null;
  return {
    productVariantId: context.productVariantId,
    masterProductId: context.masterProductId,
    channelListingOptionIds: [...context.selectedChannelListingOptionIds].sort(),
    decision: suggestion.automationDecision,
    reason: automationReason(suggestion.status),
    sellpiaInventorySkuId: singleProposal?.sellpiaInventorySkuId
      ?? existing?.sellpiaInventorySkuId
      ?? null,
    sellpiaCode: singleProposal?.code ?? existing?.code ?? null,
    recommendedQuantity: suggestion.recommendedQuantity,
    evidenceLabels: existing
      ? [`source: ${existing.source}`]
      : proposals.flatMap((proposal) => proposal.evidence.map((evidence) =>
        `${evidence.kind}: ${evidence.channelValue}`)),
  };
}

function requiredSuggestion(
  suggestions: Map<string | null, ChannelRecipeSuggestionResponse>,
  productVariantId: string,
): ChannelRecipeSuggestionResponse {
  const suggestion = suggestions.get(productVariantId);
  if (!suggestion) {
    throw new Error(`Recipe suggestion missing for ProductVariant ${productVariantId}`);
  }
  return suggestion;
}

function automationReason(
  status: ChannelRecipeSuggestionResponse['status'],
): ChannelRecipeAutomationReason {
  switch (status) {
    case 'unique_code': return 'exact_unique_code';
    case 'unique_barcode': return 'unique_physical_barcode';
    case 'exact_name_option': return 'exact_unique_name_option';
    case 'exact_name': return 'exact_unique_name';
    case 'high_confidence_name': return 'high_confidence_name';
    case 'identifier_name_mismatch': return 'identifier_name_mismatch';
    case 'already_configured': return 'already_configured';
    case 'quantity_review': return 'quantity_review';
    case 'conflict': return 'conflict';
    case 'ambiguous': return 'ambiguous';
    case 'name_review_only': return 'name_review_only';
    case 'no_match': return 'no_match';
  }
}

function countDecision(
  items: Array<{ decision: ChannelRecipeAutomationItem['decision'] }>,
  decision: ChannelRecipeAutomationItem['decision'],
) {
  return items.filter((item) => item.decision === decision).length;
}

function proposalVersion(
  items: ChannelRecipeAutomationItem[],
  productGroups: ChannelRecipeAutomationProductGroup[],
): string {
  const stableItems = items.map((item) => ({
    productVariantId: item.productVariantId,
    channelListingOptionIds: [...item.channelListingOptionIds].sort(),
    decision: item.decision,
    reason: item.reason,
    sellpiaInventorySkuId: item.sellpiaInventorySkuId,
    recommendedQuantity: item.recommendedQuantity,
  }));
  const stableProductGroups = productGroups.map((group) => ({
    channelListingId: group.channelListingId,
    masterProductId: group.masterProductId,
    channelListingOptionIds: group.channelListingOptionIds,
    productVariantIds: group.productVariantIds,
    decision: group.decision,
    autoApplyProductVariantIds: group.autoApplyProductVariantIds,
  }));
  return createHash('sha256').update(JSON.stringify({
    items: stableItems,
    productGroups: stableProductGroups,
  })).digest('hex');
}
