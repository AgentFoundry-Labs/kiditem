import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChannelRecipeSuggestionResponseSchema,
  type ChannelRecipeSuggestionResponse,
} from '@kiditem/shared/channel-product-matching';
import {
  classifyChannelRecipeSuggestion,
  normalizeRecipeSuggestionName,
} from '../../domain/channel-recipe-suggestion';
import {
  SELLPIA_RECIPE_EVIDENCE_PORT,
  type SellpiaRecipeEvidencePort,
} from '../port/out/cross-domain/sellpia-recipe-evidence.port';
import {
  CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT,
  type ChannelRecipeSuggestionContextRepositoryPort,
} from '../port/out/repository/channel-recipe-suggestion-context.repository.port';

@Injectable()
export class ChannelRecipeSuggestionService {
  constructor(
    @Inject(CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT)
    private readonly contextRepository: ChannelRecipeSuggestionContextRepositoryPort,
    @Inject(SELLPIA_RECIPE_EVIDENCE_PORT)
    private readonly evidence: SellpiaRecipeEvidencePort,
  ) {}

  async suggest(
    organizationId: string,
    channelListingOptionId: string,
  ): Promise<ChannelRecipeSuggestionResponse> {
    const context = await this.contextRepository.getContext(organizationId, channelListingOptionId);
    if (!context) throw new NotFoundException('ChannelListingOption was not found');

    const codeValues = distinct(context.options.flatMap((option) => [option.sellerSku, option.modelNumber]));
    const nameValues = distinct(context.options.flatMap((option) => [option.listingName, option.itemName]))
      .map(normalizeRecipeSuggestionName)
      .filter(Boolean)
      .sort();
    const [skusByCode, skusByName] = await Promise.all([
      this.evidence.findByCodes(organizationId, codeValues),
      this.evidence.findByNormalizedNames(organizationId, nameValues),
    ]);
    const codeEvidence = context.options.flatMap((option) => [
      ...evidenceForCode(option.sellerSku, 'seller_sku_code', skusByCode),
      ...evidenceForCode(option.modelNumber, 'model_number_code', skusByCode),
    ]);
    const nameEvidence = context.options.flatMap((option) => [option.listingName, option.itemName]
      .filter((value): value is string => Boolean(value?.trim()))
      .flatMap((channelValue) => {
        const normalizedValue = normalizeRecipeSuggestionName(channelValue);
        return skusByName
          .filter((sku) => normalizeRecipeSuggestionName(sku.name) === normalizedValue)
          .map((sku) => ({ channelValue, normalizedValue, sku }));
      }));
    return ChannelRecipeSuggestionResponseSchema.parse(classifyChannelRecipeSuggestion({
      ...context,
      codeEvidence,
      nameEvidence,
    }));
  }
}

function evidenceForCode(
  channelValue: string | null,
  kind: 'seller_sku_code' | 'model_number_code',
  skus: Awaited<ReturnType<SellpiaRecipeEvidencePort['findByCodes']>>,
) {
  if (!channelValue?.trim()) return [];
  return skus.filter((sku) => sku.code === channelValue.trim()).map((sku) => ({
    kind,
    channelValue: channelValue.trim(),
    sku,
  }));
}

function distinct(values: Array<string | null>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))].sort();
}
