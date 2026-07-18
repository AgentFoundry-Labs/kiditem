import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChannelRecipeSuggestionResponseSchema,
  type ChannelRecipeSuggestionResponse,
} from '@kiditem/shared/channel-product-matching';
import {
  classifyChannelRecipeSuggestion,
  normalizeRecipeIdentityText,
} from '../../domain/channel-recipe-suggestion';
import {
  SELLPIA_RECIPE_EVIDENCE_PORT,
  type SellpiaRecipeEvidencePort,
} from '../port/out/cross-domain/sellpia-recipe-evidence.port';
import {
  type ChannelRecipeAutomationContext,
} from '../port/out/repository/channel-recipe-automation-context.repository.port';
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

    const [suggestion] = await this.suggestBatch(organizationId, [{
      productVariantId: context.productVariantId!,
      masterProductId: context.masterProductId!,
      selectedChannelListingOptionIds: [channelListingOptionId],
      allLinkedOptions: context.options,
      existingComponents: context.existingComponents,
    }]);
    return suggestion!;
  }

  async suggestBatch(
    organizationId: string,
    contexts: ChannelRecipeAutomationContext[],
  ): Promise<ChannelRecipeSuggestionResponse[]> {
    const allOptions = contexts.flatMap((context) => context.allLinkedOptions);
    const codeValues = distinct(allOptions.flatMap((option) => [
      option.sellerSku,
      option.modelNumber,
    ]));
    const barcodeValues = distinct(allOptions.map((option) =>
      normalizePhysicalBarcode(option.barcode)));
    const nameValues = distinct(allOptions.map((option) =>
      normalizeRecipeIdentityText(option.listingName)));
    const [skusByCode, skusByBarcode, skusByName] = await Promise.all([
      this.evidence.findByCodes(organizationId, codeValues),
      this.evidence.findByNormalizedBarcodes(organizationId, barcodeValues),
      this.evidence.findByNormalizedNames(organizationId, nameValues),
    ]);

    return contexts.map((context) => {
      const codeEvidence = context.allLinkedOptions.flatMap((option) => [
        ...evidenceForCode(option.sellerSku, 'seller_sku_code', skusByCode),
        ...evidenceForCode(option.modelNumber, 'model_number_code', skusByCode),
      ]);
      const barcodeEvidence = context.allLinkedOptions.flatMap((option) => {
        const normalizedValue = normalizePhysicalBarcode(option.barcode);
        if (!normalizedValue || !option.barcode) return [];
        return skusByBarcode
          .filter((sku) => normalizePhysicalBarcode(sku.barcode) === normalizedValue)
          .map((sku) => ({
            kind: 'unique_physical_barcode' as const,
            channelValue: option.barcode!,
            normalizedValue,
            sku,
          }));
      });
      const { nameOptionEvidence, nameEvidence } = evidenceForNames(
        context.allLinkedOptions,
        skusByName,
      );
      return ChannelRecipeSuggestionResponseSchema.parse(classifyChannelRecipeSuggestion({
        channelListingOptionId: context.selectedChannelListingOptionIds[0]!,
        productVariantId: context.productVariantId,
        masterProductId: context.masterProductId,
        options: context.allLinkedOptions,
        existingComponents: context.existingComponents,
        codeEvidence,
        barcodeEvidence,
        nameOptionEvidence,
        nameEvidence,
      }));
    });
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

function normalizePhysicalBarcode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9]/g, '');
  return /^\d{8,14}$/.test(normalized) ? normalized : null;
}

function evidenceForNames(
  options: ChannelRecipeAutomationContext['allLinkedOptions'],
  skus: Awaited<ReturnType<SellpiaRecipeEvidencePort['findByNormalizedNames']>>,
) {
  const nameOptionEvidence: Array<{
    productValue: string;
    optionValue: string | null;
    normalizedProductValue: string;
    normalizedOptionValue: string | null;
    sku: (typeof skus)[number];
  }> = [];
  const nameEvidence: Array<{
    channelValue: string;
    normalizedValue: string;
    sku: (typeof skus)[number];
  }> = [];
  for (const option of options) {
    const normalizedProductValue = normalizeRecipeIdentityText(option.listingName);
    if (!normalizedProductValue || !option.listingName) continue;
    for (const sku of skus) {
      if (normalizeRecipeIdentityText(sku.name) !== normalizedProductValue) continue;
      const normalizedOptionValue = normalizeRecipeIdentityText(option.itemName);
      const normalizedSkuOption = normalizeRecipeIdentityText(sku.optionName);
      const optionCompatible = normalizedSkuOption === normalizedOptionValue
        || (normalizedSkuOption === null && normalizedOptionValue === normalizedProductValue);
      if (optionCompatible) {
        nameOptionEvidence.push({
          productValue: option.listingName,
          optionValue: option.itemName,
          normalizedProductValue,
          normalizedOptionValue,
          sku,
        });
      } else {
        nameEvidence.push({
          channelValue: option.listingName,
          normalizedValue: normalizedProductValue,
          sku,
        });
      }
    }
  }
  return { nameOptionEvidence, nameEvidence };
}
