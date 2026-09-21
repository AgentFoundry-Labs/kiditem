import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChannelRecipeSuggestionResponseSchema,
  type ChannelRecipeSuggestionResponse,
} from '@kiditem/shared/channel-product-matching';
import {
  classifyChannelRecipeSuggestion,
  normalizeRecipeIdentityText,
} from '../../domain/channel-recipe-suggestion';
import {
  createChannelRecipeNameIndex,
  rankChannelRecipeNameCandidates,
  scoreChannelRecipeNameCandidate,
  scoreChannelRecipeNameCandidateIfComparable,
} from '../../domain/channel-recipe-name-matcher';
import {
  SELLPIA_RECIPE_EVIDENCE_PORT,
  type SellpiaRecipeEvidencePort,
} from '../port/out/cross-domain/sellpia-recipe-evidence.port';
import {
  SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
  type SellpiaManualMatchRepositoryPort,
} from '../port/out/repository/sellpia-manual-match.repository.port';
import {
  CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT,
  type ChannelRecipeSuggestionContextRepositoryPort,
} from '../port/out/repository/channel-recipe-suggestion-context.repository.port';
import { normalizeSellpiaManualMatchAlias } from '../../domain/sellpia-manual-match-alias';

const EMPTY_MANUAL_MATCH_READER: Pick<
  SellpiaManualMatchRepositoryPort,
  'findByNormalizedAliases'
> = {
  findByNormalizedAliases: async () => [],
};

@Injectable()
export class ChannelRecipeSuggestionService {
  constructor(
    @Inject(CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT)
    private readonly contextRepository: ChannelRecipeSuggestionContextRepositoryPort,
    @Inject(SELLPIA_RECIPE_EVIDENCE_PORT)
    private readonly evidence: SellpiaRecipeEvidencePort,
    @Inject(SELLPIA_MANUAL_MATCH_REPOSITORY_PORT)
    private readonly manualMatches: Pick<
      SellpiaManualMatchRepositoryPort,
      'findByNormalizedAliases'
    > = EMPTY_MANUAL_MATCH_READER,
  ) {}

  async suggest(
    organizationId: string,
    channelListingOptionId: string,
  ): Promise<ChannelRecipeSuggestionResponse> {
    const context = await this.contextRepository.getContext(organizationId, channelListingOptionId);
    if (!context) throw new NotFoundException('ChannelListingOption was not found');

    const [suggestion] = await this.suggestBatch(organizationId, [{
      masterProductId: context.masterProductId!,
      selectedChannelListingOptionIds: [channelListingOptionId],
      allLinkedOptions: context.options,
      existingComponents: context.existingComponents,
    }]);
    return suggestion!;
  }

  suggestRegistration(
    organizationId: string,
    input: {
      sourceCandidateId: string;
      listingName: string;
      itemName: string | null;
    },
  ): Promise<ChannelRecipeSuggestionResponse> {
    return this.suggestContexts(organizationId, [{
      masterProductId: null,
      selectedChannelListingOptionIds: [input.sourceCandidateId],
      allLinkedOptions: [{
        channelListingOptionId: input.sourceCandidateId,
        listingName: input.listingName,
        itemName: input.itemName,
        sellerSku: null,
        modelNumber: null,
        barcode: null,
      }],
      existingComponents: [],
    }]).then(([suggestion]) => suggestion!);
  }

  async resolveSelectedRegistrationSku(
    organizationId: string,
    masterProductId: string,
  ) {
    const [sku] = await this.evidence.findByIds(
      organizationId,
      [masterProductId],
    );
    if (!sku) {
      throw new ConflictException(
        '선택한 셀피아 상품을 현재 조직의 활성 재고에서 찾을 수 없습니다.',
      );
    }
    return sku;
  }

  async suggestBatch(
    organizationId: string,
    contexts: RecipeSuggestionContext[],
  ): Promise<ChannelRecipeSuggestionResponse[]> {
    return this.suggestContexts(organizationId, contexts);
  }

  private async suggestContexts(
    organizationId: string,
    contexts: RecipeSuggestionContext[],
  ): Promise<ChannelRecipeSuggestionResponse[]> {
    if (contexts.length === 0) return [];
    const allOptions = contexts.flatMap((context) => context.allLinkedOptions);
    const codeValues = distinct(allOptions.flatMap((option) => [
      option.sellerSku,
      option.modelNumber,
    ]));
    const barcodeValues = distinct(allOptions.map((option) =>
      normalizePhysicalBarcode(option.barcode)));
    const nameValues = distinct(allOptions.map((option) =>
      normalizeRecipeIdentityText(option.listingName)));
    const manualAliasCandidates = manualMatchAliasCandidates(allOptions);
    const [
      skusByCode,
      skusByBarcode,
      skusByName,
      activeMatchingSkus,
      manualMatchRows,
    ] = await Promise.all([
      this.evidence.findByCodes(organizationId, codeValues),
      this.evidence.findByNormalizedBarcodes(organizationId, barcodeValues),
      this.evidence.findByNormalizedNames(organizationId, nameValues),
      this.evidence.listActiveForMatching(organizationId),
      this.manualMatches.findByNormalizedAliases(
        organizationId,
        manualAliasCandidates.map((candidate) => candidate.normalizedValue),
      ),
    ]);
    const matchingNameIndex = createChannelRecipeNameIndex(activeMatchingSkus);
    const activeMatchingSkuById = new Map(activeMatchingSkus.map((sku) => [
      sku.masterProductId,
      sku,
    ]));

    return contexts.map((context) => {
      const codeEvidence = context.allLinkedOptions.flatMap((option) => [
        ...evidenceForCode(
          option.sellerSku,
          'seller_sku_code',
          skusByCode,
          context.allLinkedOptions,
        ),
        ...evidenceForCode(
          option.modelNumber,
          'model_number_code',
          skusByCode,
          context.allLinkedOptions,
        ),
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
            nameCompatibilityScore: scoreChannelRecipeNameCandidateIfComparable(
              context.allLinkedOptions,
              sku,
            ),
            sku,
          }));
      });
      const { nameOptionEvidence, nameEvidence } = evidenceForNames(
        context.allLinkedOptions,
        skusByName,
      );
      const similarityEvidence = rankChannelRecipeNameCandidates(
        context.allLinkedOptions,
        matchingNameIndex,
      );
      const contextManualAliasCandidates = manualMatchAliasCandidates(
        context.allLinkedOptions,
      );
      const manualMatchEvidence = contextManualAliasCandidates.flatMap((candidate) =>
        manualMatchRows
          .filter((row) => row.normalizedAlias === candidate.normalizedValue)
          .flatMap((row) => {
            const sku = activeMatchingSkuById.get(row.masterProductId);
            return sku ? [{
              channelValue: candidate.channelValue,
              normalizedValue: candidate.normalizedValue,
              quantity: row.itemCount,
              sku,
            }] : [];
          }));
      return ChannelRecipeSuggestionResponseSchema.parse(classifyChannelRecipeSuggestion({
        channelListingOptionId: context.selectedChannelListingOptionIds[0]!,
        masterProductId: context.masterProductId,
        options: context.allLinkedOptions,
        existingComponents: context.existingComponents,
        codeEvidence,
        barcodeEvidence,
        nameOptionEvidence,
        nameEvidence,
        similarityEvidence,
        manualMatchEvidence,
      }));
    });
  }
}

function manualMatchAliasCandidates(
  options: RecipeSuggestionContext['allLinkedOptions'],
): Array<{ channelValue: string; normalizedValue: string }> {
  const byNormalizedValue = new Map<string, string>();
  for (const option of options) {
    const listingName = option.listingName?.trim() || null;
    const itemName = option.itemName?.trim() || null;
    const values = [
      listingName,
      itemName,
      listingName && itemName ? `${listingName}:${itemName}` : null,
    ];
    for (const channelValue of values) {
      if (!channelValue) continue;
      const normalizedValue = normalizeSellpiaManualMatchAlias(channelValue);
      if (!normalizedValue || byNormalizedValue.has(normalizedValue)) continue;
      byNormalizedValue.set(normalizedValue, channelValue);
    }
  }
  return [...byNormalizedValue.entries()]
    .map(([normalizedValue, channelValue]) => ({ channelValue, normalizedValue }))
    .sort((left, right) => left.normalizedValue.localeCompare(right.normalizedValue));
}

type RecipeSuggestionContext = {
  masterProductId: string | null;
  selectedChannelListingOptionIds: string[];
  allLinkedOptions: Array<{
    channelListingOptionId: string;
    listingName: string | null;
    itemName: string | null;
    sellerSku: string | null;
    modelNumber: string | null;
    barcode: string | null;
  }>;
  existingComponents: Array<{
    masterProductId: string;
    code: string;
    quantity: number;
    source: 'manual' | 'deterministic';
    confirmedBy: string | null;
    confirmedAt: Date | string;
  }>;
};

function evidenceForCode(
  channelValue: string | null,
  kind: 'seller_sku_code' | 'model_number_code',
  skus: Awaited<ReturnType<SellpiaRecipeEvidencePort['findByCodes']>>,
  options: RecipeSuggestionContext['allLinkedOptions'],
) {
  if (!channelValue?.trim()) return [];
  return skus.filter((sku) => sku.code === channelValue.trim()).map((sku) => ({
    kind,
    channelValue: channelValue.trim(),
    nameCompatibilityScore: scoreChannelRecipeNameCandidate(options, sku).score,
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
  options: RecipeSuggestionContext['allLinkedOptions'],
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
