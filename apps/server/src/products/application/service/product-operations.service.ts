import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CreateMasterProductInputSchema,
  MasterProductOperationsListQuerySchema,
  type MasterProductOperationsListItem,
  type ProductOperationsChannelProductCount,
  type ProductOperationsInventoryFocus,
  ReplaceChannelOptionInventoryInputSchema,
  UpdateMasterProductInputSchema,
  type ProductDepletionProjection,
  type ProductOperationsListSummary,
} from '@kiditem/shared/product-operations';
import {
  type ProductAbcContributionAnalytics,
  type ProductAbcContributionOverview,
  type ProductAbcContributionProduct,
  type ProductAbcEvaluation,
} from '@kiditem/shared/product-abc';
import {
  PRODUCT_OPERATIONS_REPOSITORY_PORT,
  type ProductOperationsRepositoryPort,
} from '../port/out/repository/product-operations.repository.port';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../../inventory/application/port/in/stock/inventory-availability.port';
import {
  SELLPIA_PRODUCT_DEPLETION_READ_PORT,
  type SellpiaProductDepletionReadPort,
} from '../../../analytics/sellpia-product-sales/sellpia-product-depletion-read.port';
import {
  mapProductOperationsDetail,
  mapProductOperationsListItem,
} from '../../mapper/product-operations-inventory.mapper';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
} from '../../../ai/application/port/in/workspace/catalog-display-media.port';
import {
  PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT,
  type ProductOperationsDataStatusRepositoryPort,
  type ProductOperationsDataStatusFacts,
  type ProductOperationsAbcSourceManifest,
} from '../port/out/repository/product-operations-data-status.repository.port';
import {
  MASTER_PRODUCT_CONTRIBUTION_READ_PORT,
  type MasterProductContributionReadPort,
} from '../../../finance/application/port/in/master-product-contribution-read.port';
import {
  buildProductAbcReadModel,
  type ProductAbcSourceEvidence,
} from '../../domain/product-abc-read-model';
import type { ProductOperationsPort } from '../port/in/product-operations.port';

@Injectable()
export class ProductOperationsService implements ProductOperationsPort {
  private readonly logger = new Logger(ProductOperationsService.name);

  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsRepositoryPort,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
    @Inject(SELLPIA_PRODUCT_DEPLETION_READ_PORT)
    private readonly depletion: SellpiaProductDepletionReadPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
    @Inject(PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT)
    private readonly dataStatusRepository: ProductOperationsDataStatusRepositoryPort,
    @Inject(MASTER_PRODUCT_CONTRIBUTION_READ_PORT)
    private readonly contribution: MasterProductContributionReadPort,
  ) {}

  async listProducts(organizationId: string, rawQuery: unknown) {
    const query = parseOrBadRequest(
      MasterProductOperationsListQuerySchema,
      rawQuery,
      'Invalid product operations query',
    );
    const [raw, dataStatus] = await Promise.all([
      this.repository.listProducts(organizationId, query),
      this.dataStatusRepository.read(organizationId, query.periodDays),
    ]);
    const [inventoryBySkuId, contribution] = await Promise.all([
      this.loadInventory(
        organizationId,
        raw.items.flatMap(({ inventorySkuIds }) => inventorySkuIds),
      ),
      this.loadContribution(
        organizationId,
        dataStatus,
        raw.items.map(({ id }) => id),
      ),
    ]);
    const placeholder = noDirectSales();
    const contributionById = new Map(
      contribution?.products.map((product) => [product.masterProductId, product]) ?? [],
    );
    const hydrated = raw.items.map((item) => {
      const mapped = mapProductOperationsListItem(item, inventoryBySkuId, placeholder);
      return enrichAbc(
        mapped,
        dataStatus,
        contributionById.get(item.id) ?? null,
      );
    });
    const abcFiltered = query.abcCalculationStatus
      ? hydrated.filter(({ abc }) => abc.displayStatus === query.abcCalculationStatus)
      : hydrated;
    const inventoryFiltered = query.inventoryStatus
      ? abcFiltered.filter(({ inventoryStatus }) =>
        inventoryStatus === query.inventoryStatus)
      : abcFiltered;
    const summaryMasterProductIds = inventoryFiltered.map(({ id }) => id);
    const depletionByMasterProductId = await this.depletion.findByMasterProductIds({
      organizationId,
      masterProductIds: summaryMasterProductIds,
    });
    const withDepletion = inventoryFiltered.map((item) => ({
      ...item,
      depletion: depletionByMasterProductId.get(item.id) ?? placeholder,
    }));
    const items = query.inventoryFocus
      ? withDepletion.filter((item) => matchesInventoryFocus(item, query.inventoryFocus!))
      : withDepletion;
    const offset = (query.page - 1) * query.limit;
    const pageItems = items.slice(offset, offset + query.limit);
    return {
      items: await this.applyDisplayImages(organizationId, pageItems),
      total: items.length,
      page: query.page,
      limit: query.limit,
      summary: {
        ...summarizeProducts(
          items,
          summarizeChannelProducts(raw.sellingChannelProducts ?? []),
          contributionOverview(contribution),
          dataStatus.displayDataAsOf,
        ),
      },
    };
  }

  async getProduct(organizationId: string, masterProductId: string) {
    const [product, dataStatus] = await Promise.all([
      this.repository.getProduct(organizationId, masterProductId),
      this.dataStatusRepository.read(organizationId, 30),
    ]);
    const contribution = await this.loadContribution(
      organizationId,
      dataStatus,
      [masterProductId],
    );
    const mapped = mapProductOperationsDetail(
      product,
      await this.loadInventory(
        organizationId,
        product.inventorySkuIds,
      ),
    );
    const withAbc = enrichAbc(
      mapped,
      dataStatus,
      contribution?.products[0] ?? null,
    );
    return (await this.applyDisplayImages(organizationId, [withAbc]))[0]!;
  }

  async createProduct(
    organizationId: string,
    userId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateMasterProductInputSchema,
      omitLegacyAbcGrade(rawInput),
      'Invalid MasterProduct creation',
    );
    const product = await this.repository.createProduct({
      organizationId,
      product: input,
    });
    return this.hydrateProductRead(organizationId, product, new Map());
  }

  async updateProduct(
    organizationId: string,
    masterProductId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      UpdateMasterProductInputSchema,
      omitLegacyAbcGrade(rawInput),
      'Invalid MasterProduct update',
    );
    const product = await this.repository.updateProduct(
      organizationId,
      masterProductId,
      input,
    );
    return this.hydrateProductRead(
      organizationId,
      product,
      await this.loadInventory(
        organizationId,
        product.inventorySkuIds,
      ),
    );
  }

  async replaceChannelOptionInventory(
    organizationId: string,
    channelListingOptionId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      ReplaceChannelOptionInventoryInputSchema,
      rawInput,
      'Invalid channel option inventory replacement',
    );
    return this.repository.replaceChannelOptionInventory({
      organizationId,
      channelListingOptionId,
      components: input.components,
    });
  }

  private async loadInventory(
    organizationId: string,
    inventorySkuIds: string[],
  ) {
    const sellpiaInventorySkuIds = [...new Set(inventorySkuIds)].sort(
        (left, right) => left.localeCompare(right),
      );
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds,
    });
    return new Map(availability.items.map((item) => [
      item.sellpiaInventorySkuId,
      item,
    ]));
  }

  private async hydrateProductRead(
    organizationId: string,
    product: Awaited<ReturnType<ProductOperationsRepositoryPort['getProduct']>>,
    inventoryBySkuId: Awaited<ReturnType<ProductOperationsService['loadInventory']>>,
  ) {
    const dataStatus = await this.dataStatusRepository.read(organizationId, 30);
    const contribution = await this.loadContribution(
      organizationId,
      dataStatus,
      [product.id],
    );
    const mapped = enrichAbc(
      mapProductOperationsDetail(product, inventoryBySkuId),
      dataStatus,
      contribution?.products[0] ?? null,
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
  }

  private loadContribution(
    organizationId: string,
    dataStatus: ProductOperationsDataStatusFacts,
    masterProductIds: readonly string[],
  ): Promise<ProductAbcContributionAnalytics | null> {
    const basis = dataStatus.contributionBasis;
    if (!basis) return Promise.resolve(null);
    return this.contribution.readContribution({
      organizationId,
      ...basis,
      sellpiaSourceImportRunId: dataStatus.sourceVector.sellpia!.sourceImportRunId,
      advertisingSourceImportRunId:
        dataStatus.sourceVector.advertising!.sourceImportRunId,
      masterProductIds,
    });
  }

  private async applyDisplayImages<
    T extends { id: string; imageUrls: string[]; displayImageUrls: string[] },
  >(organizationId: string, products: T[]): Promise<T[]> {
    const fallbackIds = products
      .filter((product) => product.imageUrls.length === 0)
      .map((product) => product.id);
    if (fallbackIds.length === 0) return products;

    try {
      const targets = await this.repository.listDisplayMediaTargets(
        organizationId,
        fallbackIds,
      );
      const byProductId = new Map<string, typeof targets>();
      for (const target of targets) {
        const existing = byProductId.get(target.masterProductId) ?? [];
        existing.push(target);
        byProductId.set(target.masterProductId, existing);
      }

      const media = await this.catalogDisplayMedia.findDisplayMedia({
        organizationId,
        requests: fallbackIds.flatMap((key) => {
          const candidates = byProductId.get(key) ?? [];
          return candidates.length === 0 ? [] : [{
            key,
            candidates: candidates.map(({ channelListingId }) => ({
              channelListingId,
              externalOptionId: null,
            })),
          }];
        }),
      });
      return products.map((product) => {
        if (product.imageUrls.length > 0) return product;
        const url = media.get(product.id)?.url;
        return { ...product, displayImageUrls: url ? [url] : [] };
      });
    } catch (error) {
      this.logger.warn(
        `Product display media enrichment failed for organization ${organizationId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return products;
    }
  }
}

function omitLegacyAbcGrade(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return rawInput;
  const { abcGrade: _legacyAbcGrade, ...input } = rawInput as Record<string, unknown>;
  return input;
}

function noDirectSales(): ProductDepletionProjection {
  return {
    coverage: 'no_direct_sales',
    needsReorder: false,
    reorderSkuCount: 0,
    minMonthsOfAvailableStockLeft: null,
  };
}

function summarizeProducts(
  products: MasterProductOperationsListItem[],
  channelProductCounts: ProductOperationsChannelProductCount[],
  contributionOverviewValue: ProductAbcContributionOverview | null,
  displayDataAsOf: string | null,
): ProductOperationsListSummary {
  const counts = products.reduce<ProductOperationsListSummary>((counts, product) => {
    const abcGrade = product.abcGrade;
    if (abcGrade === 'A' || abcGrade === 'B' || abcGrade === 'C') {
      counts.abcGradeCounts[abcGrade] += 1;
    } else {
      counts.abcGradeCounts.unclassified += 1;
    }
    counts.abcStatusCounts[product.abc.displayStatus] += 1;
    const evaluation = product.abcEvaluation;
    if (!counts.abcFormula && evaluation?.formula) counts.abcFormula = evaluation.formula;
    counts.inventoryStatusCounts[product.inventoryStatus] += 1;
    if (product.contribution?.operatingProfit !== null
      && product.contribution?.operatingProfit !== undefined
      && product.contribution.operatingProfit < 0) {
      counts.negativeProfitCount += 1;
    }
    if (matchesInventoryFocus(product, 'imminent')) {
      counts.imminentProductCount += 1;
    }
    if (product.depletion.needsReorder) counts.reorderProductCount += 1;
    if (product.depletion.coverage !== 'no_direct_sales') {
      counts.depletionCoveredProductCount += 1;
    }
    if (product.depletion.coverage === 'shared') {
      counts.sharedDepletionProductCount += 1;
    }
    return counts;
  }, {
    abcGradeCounts: { A: 0, B: 0, C: 0, unclassified: 0 },
    abcStatusCounts: {
      NEW: 0,
      READY: 0,
      INSUFFICIENT_EVIDENCE: 0,
      SOURCE_UNMAPPED: 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
    },
    contributionOverview: contributionOverviewValue,
    abcFormula: null,
    displayDataAsOf,
    channelProductCounts,
    inventoryStatusCounts: {
      sellable: 0,
      partial_out_of_stock: 0,
      out_of_stock: 0,
      configuration_required: 0,
      review_required: 0,
    },
    negativeProfitCount: 0,
    imminentProductCount: 0,
    reorderProductCount: 0,
    depletionCoveredProductCount: 0,
    sharedDepletionProductCount: 0,
  });
  return counts;
}

function enrichAbc<T extends {
  id: string;
  abcGrade: 'A' | 'B' | 'C' | null;
  abcEvaluation: ProductAbcEvaluation | null;
}>(
  product: T,
  status: ProductOperationsDataStatusFacts,
  contribution: ProductAbcContributionProduct | null,
) {
  const current = status.products.find(({ masterProductId }) =>
    masterProductId === product.id);
  return {
    ...product,
    abc: buildProductAbcReadModel({
      evaluation: product.abcEvaluation,
      mappingValid: current?.mappingValid !== false,
      saleStartDate: current?.saleStartDate ?? null,
      evidence: {
        actualCutoff: status.actualCutoff,
        // Evidence carries a mapping generation only while it agrees with the
        // organization's current one; `mappingReady` is that agreement.
        mappingGeneration: status.mappingReady
          ? status.formulaState.mappingGeneration
          : null,
        sellpia: abcSourceEvidence(status.sellpia, status.sourceVector.sellpia),
        advertising: abcSourceEvidence(
          status.advertising,
          status.sourceVector.advertising,
        ),
      },
      formulaState: {
        formulaRevision: status.formulaState.formulaRevision,
        publicationRevision: status.formulaState.publicationRevision,
        officialCutoffDate: status.formulaState.officialCutoff,
        publishedAt: status.formulaState.publishedAt,
        mappingGeneration: status.formulaState.mappingGeneration,
      },
    }),
    contribution,
  };
}

function abcSourceEvidence(
  status: ProductOperationsDataStatusFacts['sellpia'],
  manifest: ProductOperationsAbcSourceManifest | null,
): ProductAbcSourceEvidence {
  return {
    status: status.status,
    actualCutoff: status.actualCutoff,
    latestAttemptState: status.latestAttemptState,
    errorCode: status.errorCode,
    sourceImportRunId: manifest?.sourceImportRunId ?? null,
    generation: manifest?.generation ?? null,
    coverageStartDate: manifest?.coverageStartDate ?? null,
    coverageEndDate: manifest?.coverageEndDate ?? null,
    capturedAt: status.capturedAt instanceof Date
      ? status.capturedAt.toISOString()
      : status.capturedAt,
  };
}

function contributionOverview(
  analytics: ProductAbcContributionAnalytics | null,
): ProductAbcContributionOverview | null {
  if (!analytics) return null;
  const { products: _products, ...overview } = analytics;
  return overview;
}

const IMMINENT_STOCK_MIN_MONTHS_EXCLUSIVE = 1.5;
const IMMINENT_STOCK_MAX_MONTHS_INCLUSIVE = 3;

function matchesInventoryFocus(
  product: Pick<ReturnType<typeof mapProductOperationsListItem>, 'inventoryStatus' | 'depletion'>,
  focus: ProductOperationsInventoryFocus,
): boolean {
  if (focus === 'attention') {
    return product.inventoryStatus === 'configuration_required'
      || product.inventoryStatus === 'review_required';
  }
  if (focus === 'out_of_stock') return product.inventoryStatus === 'out_of_stock';
  if (focus === 'reorder') return product.depletion.needsReorder;
  const months = product.depletion.minMonthsOfAvailableStockLeft;
  return !product.depletion.needsReorder
    && months !== null
    && months > IMMINENT_STOCK_MIN_MONTHS_EXCLUSIVE
    && months <= IMMINENT_STOCK_MAX_MONTHS_INCLUSIVE;
}

function summarizeChannelProducts(
  channelProducts: Array<Omit<ProductOperationsChannelProductCount, 'count'>>,
): ProductOperationsChannelProductCount[] {
  const counts = new Map<string, ProductOperationsChannelProductCount>();
  for (const channelProduct of channelProducts) {
    const existing = counts.get(channelProduct.channelAccountId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(channelProduct.channelAccountId, { ...channelProduct, count: 1 });
    }
  }
  return [...counts.values()].sort((left, right) =>
    left.channelAccountName.localeCompare(right.channelAccountName)
    || left.channelAccountId.localeCompare(right.channelAccountId));
}

function parseOrBadRequest<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } },
  input: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({ message, errors: parsed.error.flatten() });
  }
  return parsed.data;
}
