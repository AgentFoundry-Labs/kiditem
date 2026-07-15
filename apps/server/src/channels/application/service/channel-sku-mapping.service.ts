import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  ReplaceChannelSkuComponentsInputSchema,
  type ChannelSkuMappingListItem,
  type ChannelSkuMappingListResponse,
  type ChannelSkuMatchCandidateListResponse,
  type RefreshChannelSkuMappingStatusInput,
} from '@kiditem/shared/channel-sku-matching';
import {
  extractExplicitOptionCodeTokens,
  normalizeIdentifier,
  normalizeRegisteredName,
  rankSellpiaMasterProductCandidates,
  statusForUnmappedCandidates,
  type CandidateSellpiaMasterProduct,
  type ChannelSkuEvidence,
} from '../../domain/channel-sku-candidate-ranking';
import { resolveChannelSkuAutomaticMatch } from '../../domain/channel-sku-automatic-match';
import {
  CHANNELS_SELLPIA_MASTER_PRODUCT_READ_PORT,
  type ChannelsSellpiaMasterProductReadPort,
} from '../port/out/cross-domain/sellpia-master-product-read.port';
import {
  CHANNEL_SKU_MAPPING_REPOSITORY_PORT,
  type ChannelSkuMappingCounts,
  type ChannelSkuMappingListQuery,
  type ChannelSkuMappingRepositoryPort,
  type UnmappedChannelSkuEvidenceRow,
} from '../port/out/repository/channel-sku-mapping.repository.port';
import { hydrateChannelSkuAvailabilityRows } from './channel-sku-availability.service';

export type ChannelSkuCandidateQuery = { search?: string; limit?: number };

@Injectable()
export class ChannelSkuMappingService {
  constructor(
    @Inject(CHANNEL_SKU_MAPPING_REPOSITORY_PORT)
    private readonly repository: ChannelSkuMappingRepositoryPort,
    @Inject(CHANNELS_SELLPIA_MASTER_PRODUCT_READ_PORT)
    private readonly inventory: ChannelsSellpiaMasterProductReadPort,
  ) {}

  async list(
    organizationId: string,
    query: Partial<ChannelSkuMappingListQuery>,
  ): Promise<ChannelSkuMappingListResponse> {
    const normalizedQuery: ChannelSkuMappingListQuery = {
      channelAccountId: query.channelAccountId,
      mappingStatus: query.mappingStatus ?? 'all',
      search: query.search?.trim() || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    };
    const result = await this.repository.list(organizationId, normalizedQuery);
    return {
      items: await hydrateChannelSkuAvailabilityRows(
        organizationId,
        result.rows,
        this.inventory,
      ),
      total: result.total,
      page: normalizedQuery.page,
      limit: normalizedQuery.limit,
      counts: result.counts,
    };
  }

  async candidates(
    organizationId: string,
    channelSkuId: string,
    query: ChannelSkuCandidateQuery,
  ): Promise<ChannelSkuMatchCandidateListResponse> {
    const evidence = await this.requireEvidence(organizationId, channelSkuId);
    const limit = capCandidateLimit(query.limit);
    const pools = await this.loadCandidatePools(
      organizationId,
      evidence,
      query.search,
      limit,
      true,
    );
    const ranked = rankSellpiaMasterProductCandidates({ evidence, ...pools }).slice(0, limit);
    return {
      items: ranked.map((candidate) => ({
        masterProductId: candidate.id,
        code: candidate.sellpiaProductCode,
        name: candidate.name,
        optionName: candidate.optionName,
        barcode: candidate.barcode,
        currentStock: candidate.currentStock,
        reason: candidate.reason,
        rank: candidate.rank,
      })),
    };
  }

  async refreshStatuses(
    organizationId: string,
    input: RefreshChannelSkuMappingStatusInput,
  ): Promise<ChannelSkuMappingCounts> {
    const evidenceRows = await this.repository.listUnmappedEvidence(
      organizationId,
      input.channelAccountId,
    );
    const exactCodes = distinctTrimmed(evidenceRows.flatMap(exactCodeEvidence));
    const identifiers = distinctNormalizedIdentifiers(evidenceRows);
    const normalizedNames = [...new Set(evidenceRows
      .map((evidence) => normalizeRegisteredName(evidence.registeredName))
      .filter((value): value is string => value !== null))];
    const [exactCodeCandidates, identifierCandidates, normalizedNameCandidates] =
      await Promise.all([
        exactCodes.length
          ? this.inventory.findBySellpiaCodes(organizationId, exactCodes)
          : Promise.resolve([]),
        identifiers.length
          ? this.inventory.findByBarcodes(organizationId, identifiers)
          : Promise.resolve([]),
        normalizedNames.length
          ? this.inventory.findByNormalizedNames(organizationId, normalizedNames)
          : Promise.resolve([]),
      ]);
    const automaticMasters = dedupeCandidates([
      ...exactCodeCandidates,
      ...identifierCandidates,
    ]).map((candidate) => ({
      id: candidate.id,
      code: candidate.sellpiaProductCode,
      barcode: candidate.barcode,
      isActive: candidate.isActive,
    }));
    const updates = evidenceRows.map((evidence) => {
      const match = resolveChannelSkuAutomaticMatch({
        productCode: evidence.sellerSku,
        barcode: evidence.barcode,
      }, automaticMasters);
      if (match.status === 'needs_review') {
        return {
          channelSkuId: evidence.channelSkuId,
          mappingStatus: 'needs_review' as const,
        };
      }
      if (match.status === 'unmatched') {
        const nameCandidates = rankSellpiaMasterProductCandidates({
          evidence,
          exactCodeCandidates: [],
          identifierCandidates: [],
          normalizedNameCandidates,
          nameSuggestionCandidates: [],
          manualSearchCandidates: [],
        });
        return {
          channelSkuId: evidence.channelSkuId,
          mappingStatus: statusForUnmappedCandidates(nameCandidates),
        };
      }
      return {
        channelSkuId: evidence.channelSkuId,
        mappingStatus: match.status,
        component: {
          masterProductId: match.masterProductId,
          quantity: match.quantity,
          mappingSource: match.source,
        },
      };
    });
    await this.repository.applyAutomaticMatches(organizationId, updates);
    const current = await this.repository.list(organizationId, {
      channelAccountId: input.channelAccountId,
      mappingStatus: 'all',
      page: 1,
      limit: 1,
    });
    return current.counts;
  }

  async replaceComponents(
    organizationId: string,
    userId: string,
    channelSkuId: string,
    rawInput: unknown,
  ): Promise<ChannelSkuMappingListItem> {
    const parsed = ReplaceChannelSkuComponentsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid ChannelSku component replacement',
        errors: parsed.error.flatten(),
      });
    }

    const evidence = await this.requireEvidence(organizationId, channelSkuId);
    let nextStatus: 'matched' | 'needs_review' | 'unmatched';
    if (parsed.data.components.length > 0) {
      const ids = parsed.data.components.map(({ masterProductId }) => masterProductId);
      const owned = await this.inventory.findByIds(organizationId, ids);
      const ownedById = new Map(owned.map((masterProduct) => [
        masterProduct.id.toLowerCase(),
        masterProduct,
      ]));
      if (ids.some((id) => !ownedById.has(id.toLowerCase()))) {
        throw new BadRequestException('One or more MasterProduct components do not belong to this organization');
      }
      if (ids.some((id) => !ownedById.get(id.toLowerCase())!.isActive)) {
        throw new BadRequestException('Inactive MasterProducts cannot be added to a component recipe');
      }
      nextStatus = 'matched';
    } else {
      const pools = await this.loadCandidatePools(
        organizationId,
        evidence,
        undefined,
        100,
        false,
      );
      nextStatus = statusForUnmappedCandidates(
        rankSellpiaMasterProductCandidates({ evidence, ...pools }),
      );
    }

    await this.repository.replaceComponents({
      organizationId,
      userId,
      channelSkuId,
      components: parsed.data.components,
      mappingSource: 'manual',
      nextStatus,
    });
    const updated = await this.repository.findOne(organizationId, channelSkuId);
    if (!updated) {
      throw new InternalServerErrorException('Updated ChannelSku mapping could not be reloaded');
    }
    return (await hydrateChannelSkuAvailabilityRows(
      organizationId,
      [updated],
      this.inventory,
    ))[0]!;
  }

  private async requireEvidence(
    organizationId: string,
    channelSkuId: string,
  ): Promise<UnmappedChannelSkuEvidenceRow> {
    const evidence = await this.repository.findEvidence(organizationId, channelSkuId);
    if (!evidence) throw new NotFoundException('ChannelSku mapping was not found');
    return evidence;
  }

  private async loadCandidatePools(
    organizationId: string,
    evidence: ChannelSkuEvidence,
    manualSearch: string | undefined,
    manualLimit: number,
    includeSuggestions: boolean,
  ): Promise<{
    exactCodeCandidates: CandidateSellpiaMasterProduct[];
    identifierCandidates: CandidateSellpiaMasterProduct[];
    normalizedNameCandidates: CandidateSellpiaMasterProduct[];
    nameSuggestionCandidates: CandidateSellpiaMasterProduct[];
    manualSearchCandidates: CandidateSellpiaMasterProduct[];
  }> {
    const exactCodes = distinctTrimmed(exactCodeEvidence(evidence));
    const identifiers = distinctNormalizedIdentifiers([evidence]);
    const normalizedName = normalizeRegisteredName(evidence.registeredName);
    const suggestionQueries = includeSuggestions
      ? distinctTrimmed([evidence.optionName, ...evidence.productNames]).slice(0, 3)
      : [];
    const trimmedManualSearch = manualSearch?.trim() ?? '';
    const [
      exactCodeCandidates,
      identifierCandidates,
      normalizedNameCandidates,
      suggestions,
      manualSearchCandidates,
    ] =
      await Promise.all([
        exactCodes.length
          ? this.inventory.findBySellpiaCodes(organizationId, exactCodes)
          : Promise.resolve([]),
        identifiers.length
          ? this.inventory.findByBarcodes(organizationId, identifiers)
          : Promise.resolve([]),
        normalizedName
          ? this.inventory.findByNormalizedNames(organizationId, [normalizedName])
          : Promise.resolve([]),
        Promise.all(suggestionQueries.map((query) =>
          this.inventory.search(organizationId, query, 10))),
        trimmedManualSearch
          ? this.inventory.search(organizationId, trimmedManualSearch, manualLimit)
          : Promise.resolve([]),
      ]);
    return {
      exactCodeCandidates,
      identifierCandidates,
      normalizedNameCandidates,
      nameSuggestionCandidates: dedupeCandidates(suggestions.flat()),
      manualSearchCandidates,
    };
  }

}

function exactCodeEvidence(evidence: ChannelSkuEvidence): Array<string | null> {
  return [
    evidence.sellerSku,
    evidence.modelNumber,
    ...extractExplicitOptionCodeTokens(evidence.optionName),
  ];
}

function distinctTrimmed(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(
    (value): value is string => Boolean(value),
  ))];
}

function distinctNormalizedIdentifiers(evidenceRows: ChannelSkuEvidence[]): string[] {
  return [...new Set(evidenceRows.flatMap((evidence) =>
    [normalizeIdentifier(evidence.modelNumber), normalizeIdentifier(evidence.barcode)]
      .filter((value): value is string => value !== null)))];
}

function dedupeCandidates(
  candidates: CandidateSellpiaMasterProduct[],
): CandidateSellpiaMasterProduct[] {
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
}

function capCandidateLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(100, Math.max(1, Math.trunc(limit!)));
}
