import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  ApplyChannelRecipeAutomationInputSchema,
  ApplyChannelRecipeAutomationResponseSchema,
  ChannelRecipeAutomationPreviewSchema,
  type ChannelRecipeAutomationItem,
  type ChannelRecipeAutomationReason,
} from '@kiditem/shared/channel-recipe-automation';
import {
  PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT,
  type ProductVariantRecipeAutomationPort,
} from '../../../products/application/port/in/product-variant-recipe-automation.port';
import type { ChannelRecipeSuggestionResponse } from '../../domain/channel-recipe-suggestion';
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
    const contexts = await this.contexts.listContexts(organizationId, channelAccountId);
    const suggestions = await this.suggestions.suggestBatch(organizationId, contexts);
    const suggestionByVariant = new Map(suggestions.map((suggestion) => [
      suggestion.productVariantId,
      suggestion,
    ]));
    const items = contexts.map((context) => toPreviewItem(
      context,
      requiredSuggestion(suggestionByVariant, context.productVariantId),
    )).sort((left, right) => left.productVariantId.localeCompare(right.productVariantId));

    return ChannelRecipeAutomationPreviewSchema.parse({
      channelAccountId,
      proposalVersion: proposalVersion(items),
      generatedAt: new Date().toISOString(),
      summary: {
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
    const automaticItems = preview.items.filter((item) => item.decision === 'auto_apply');
    const result = await this.products.applyIfEmpty({
      organizationId,
      recipes: automaticItems.map((item) => ({
        productVariantId: item.productVariantId,
        sellpiaInventorySkuId: item.sellpiaInventorySkuId!,
        quantity: 1 as const,
      })),
    });
    const appliedIds = new Set(result.appliedProductVariantIds);
    return ApplyChannelRecipeAutomationResponseSchema.parse({
      proposalVersion: preview.proposalVersion,
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
    case 'already_configured': return 'already_configured';
    case 'quantity_review': return 'quantity_review';
    case 'conflict': return 'conflict';
    case 'ambiguous': return 'ambiguous';
    case 'name_review_only': return 'name_review_only';
    case 'no_match': return 'no_match';
  }
}

function countDecision(
  items: ChannelRecipeAutomationItem[],
  decision: ChannelRecipeAutomationItem['decision'],
) {
  return items.filter((item) => item.decision === decision).length;
}

function proposalVersion(items: ChannelRecipeAutomationItem[]): string {
  const stable = items.map((item) => ({
    productVariantId: item.productVariantId,
    channelListingOptionIds: [...item.channelListingOptionIds].sort(),
    decision: item.decision,
    reason: item.reason,
    sellpiaInventorySkuId: item.sellpiaInventorySkuId,
    recommendedQuantity: item.recommendedQuantity,
  }));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
