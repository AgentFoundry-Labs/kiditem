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
  rankInventorySkuCandidates,
  statusForUnmappedCandidates,
  type CandidateInventorySku,
  type ChannelSkuEvidence,
} from '../../domain/channel-sku-candidate-ranking';
import {
  CHANNELS_INVENTORY_SKU_READ_PORT,
  type ChannelsInventorySkuReadPort,
} from '../port/out/cross-domain/inventory-sku-read.port';
import {
  CHANNEL_SKU_MAPPING_REPOSITORY_PORT,
  type ChannelSkuMappingCounts,
  type ChannelSkuMappingListQuery,
  type ChannelSkuMappingRepositoryPort,
  type ChannelSkuMappingRow,
  type UnmappedChannelSkuEvidenceRow,
} from '../port/out/repository/channel-sku-mapping.repository.port';

export type ChannelSkuCandidateQuery = { search?: string; limit?: number };

@Injectable()
export class ChannelSkuMappingService {
  constructor(
    @Inject(CHANNEL_SKU_MAPPING_REPOSITORY_PORT)
    private readonly repository: ChannelSkuMappingRepositoryPort,
    @Inject(CHANNELS_INVENTORY_SKU_READ_PORT)
    private readonly inventory: ChannelsInventorySkuReadPort,
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
      items: await this.hydrateRows(organizationId, result.rows),
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
    const ranked = rankInventorySkuCandidates({ evidence, ...pools }).slice(0, limit);
    return {
      items: ranked.map((candidate) => ({
        inventorySkuId: candidate.id,
        sellpiaProductCode: candidate.sellpiaProductCode,
        name: candidate.name,
        optionName: candidate.optionName,
        barcode: candidate.barcode,
        reportedStock: candidate.reportedStock,
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
    const [exactCodeCandidates, identifierCandidates] = await Promise.all([
      exactCodes.length
        ? this.inventory.findBySellpiaCodes(organizationId, exactCodes)
        : Promise.resolve([]),
      identifiers.length
        ? this.inventory.findByBarcodes(organizationId, identifiers)
        : Promise.resolve([]),
    ]);
    const updates = evidenceRows.map((evidence) => ({
      channelSkuId: evidence.channelSkuId,
      mappingStatus: statusForUnmappedCandidates(rankInventorySkuCandidates({
        evidence,
        exactCodeCandidates,
        identifierCandidates,
        nameSuggestionCandidates: [],
        manualSearchCandidates: [],
      })),
    }));
    await this.repository.updateUnmappedStatuses(organizationId, updates);
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
      const ids = parsed.data.components.map(({ inventorySkuId }) => inventorySkuId);
      const owned = await this.inventory.findByIds(organizationId, ids);
      const ownedIds = new Set(owned.map(({ id }) => id.toLowerCase()));
      if (ids.some((id) => !ownedIds.has(id.toLowerCase()))) {
        throw new BadRequestException('One or more InventorySku components do not belong to this organization');
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
        rankInventorySkuCandidates({ evidence, ...pools }),
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
    return (await this.hydrateRows(organizationId, [updated]))[0]!;
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
    exactCodeCandidates: CandidateInventorySku[];
    identifierCandidates: CandidateInventorySku[];
    nameSuggestionCandidates: CandidateInventorySku[];
    manualSearchCandidates: CandidateInventorySku[];
  }> {
    const exactCodes = distinctTrimmed(exactCodeEvidence(evidence));
    const identifiers = distinctNormalizedIdentifiers([evidence]);
    const suggestionQueries = includeSuggestions
      ? distinctTrimmed([evidence.optionName, ...evidence.productNames]).slice(0, 3)
      : [];
    const trimmedManualSearch = manualSearch?.trim() ?? '';
    const [exactCodeCandidates, identifierCandidates, suggestions, manualSearchCandidates] =
      await Promise.all([
        exactCodes.length
          ? this.inventory.findBySellpiaCodes(organizationId, exactCodes)
          : Promise.resolve([]),
        identifiers.length
          ? this.inventory.findByBarcodes(organizationId, identifiers)
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
      nameSuggestionCandidates: dedupeCandidates(suggestions.flat()),
      manualSearchCandidates,
    };
  }

  private async hydrateRows(
    organizationId: string,
    rows: ChannelSkuMappingRow[],
  ): Promise<ChannelSkuMappingListItem[]> {
    const ids = [...new Set(rows.flatMap((row) =>
      row.componentRefs.map(({ inventorySkuId }) => inventorySkuId)))];
    const inventoryRows = ids.length
      ? await this.inventory.findByIds(organizationId, ids)
      : [];
    const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
    if (ids.some((id) => !inventoryById.has(id))) {
      throw new InternalServerErrorException('ChannelSku component references a missing InventorySku');
    }
    return rows.map((row) => ({
      channelAccount: row.channelAccount,
      product: row.product,
      sku: {
        ...row.sku,
        mappingStatus: row.componentRefs.length > 0
          ? 'matched'
          : row.sku.mappingStatus === 'needs_review'
            ? 'needs_review'
            : 'unmatched',
        updatedAt: row.sku.updatedAt.toISOString(),
      },
      components: row.componentRefs.map((component) => {
        const inventorySku = inventoryById.get(component.inventorySkuId)!;
        return {
          inventorySkuId: inventorySku.id,
          sellpiaProductCode: inventorySku.sellpiaProductCode,
          name: inventorySku.name,
          optionName: inventorySku.optionName,
          barcode: inventorySku.barcode,
          reportedStock: inventorySku.reportedStock,
          quantity: component.quantity,
          mappingSource: component.mappingSource,
        };
      }),
    }));
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

function dedupeCandidates(candidates: CandidateInventorySku[]): CandidateInventorySku[] {
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
}

function capCandidateLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(100, Math.max(1, Math.trunc(limit!)));
}
