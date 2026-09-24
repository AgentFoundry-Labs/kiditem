import { businessDateKey, kstBusinessDate } from '../../../common/kst';
import { MASTER_PRODUCT_MONTHLY_SALES_READ_PORT, type MasterProductMonthlySalesReadPort } from '../../../analytics/application/port/in/master-product-monthly-sales-read.port';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MasterProductOperationsListQuerySchema,
  type MasterProductOperationsListItem,
  type ProductOperationsChannelProductCount,
  type ProductOperationsInventoryFocus,
  deriveProductAdvertisingStatus,
  deriveProductInventoryStatus,
  type ProductDepletionProjection,
  type ProductOperationsListSummary,
  type ProductOperationsSort,
  type ProductMonthlySales,
} from '@kiditem/shared/product-operations';
import {
  productAbcDisplayStatus,
  type ProductAbcContributionAnalytics,
  type ProductAbcContributionOverview,
  type ProductAbcContributionProduct,
  type ProductAbcEvaluation,
} from '@kiditem/shared/product-abc';
import {
  PRODUCT_OPERATIONS_REPOSITORY_PORT,
  type ProductOperationsRepositoryPort,
} from '../port/out/persistence/product-operations.repository.port';
import {
  PRODUCT_AVAILABILITY_PORT,
  type ProductAvailabilityPort,
} from '../port/in/product-availability.port';
import {
  SELLPIA_PRODUCT_DEPLETION_READ_PORT,
  type SellpiaProductDepletionReadPort,
} from '../../../analytics/sellpia-product-sales/sellpia-product-depletion-read.port';
import {
  mapProductOperationsDetail,
  mapProductOperationsListItem,
} from '../../domain/product-operations-inventory.mapper';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
} from '../../../content/application/port/in/workspace/catalog-display-media.port';
import {
  PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT,
  type ProductOperationsDataStatusRepositoryPort,
  type ProductOperationsDataStatusFacts,
} from '../port/out/persistence/product-operations-data-status.repository.port';
import {
  MASTER_PRODUCT_CONTRIBUTION_READ_PORT,
  type MasterProductContributionReadPort,
} from '../../../finance/application/port/in/master-product-contribution-read.port';
import {
  buildProductAbcReadModel,
  type ProductAbcSourceEvidence,
} from '../../domain/product-abc-read-model';
import type { ProductQueryPort } from '../port/in/product-query.port';
import { ProductInputException } from '../exception/product-input.exception';


@Injectable()
export class ProductQueryUseCase implements ProductQueryPort {
  private readonly logger = new Logger(ProductQueryUseCase.name);

  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsRepositoryPort,
    @Inject(PRODUCT_AVAILABILITY_PORT)
    private readonly inventory: ProductAvailabilityPort,
    @Inject(SELLPIA_PRODUCT_DEPLETION_READ_PORT)
    private readonly depletion: SellpiaProductDepletionReadPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
    @Inject(PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT)
    private readonly dataStatusRepository: ProductOperationsDataStatusRepositoryPort,
    @Inject(MASTER_PRODUCT_CONTRIBUTION_READ_PORT)
    private readonly contribution: MasterProductContributionReadPort,
    @Inject(MASTER_PRODUCT_MONTHLY_SALES_READ_PORT)
    private readonly monthlySales: MasterProductMonthlySalesReadPort,
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
    const advertisingFiltered = query.adStatus === 'all'
      ? hydrated
      : hydrated.filter(({ adSpend }) => deriveProductAdvertisingStatus(adSpend) === query.adStatus);
    const gradeFiltered = query.abcGrade === 'unclassified'
      ? advertisingFiltered.filter(({ abcGrade }) => abcGrade === null)
      : query.abcGrade
        ? advertisingFiltered.filter(({ abcGrade }) => abcGrade === query.abcGrade)
        : advertisingFiltered;
    const abcFiltered = query.abcCalculationStatus
      ? gradeFiltered.filter(({ abc }) => productAbcDisplayStatus(abc) === query.abcCalculationStatus)
      : gradeFiltered;
    const inventoryFiltered = query.inventoryStatus
      ? abcFiltered.filter((item) =>
        deriveProductInventoryStatus(item) === query.inventoryStatus)
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
    const yearMonth = businessDateKey(kstBusinessDate(new Date())).slice(0, 7);
    const monthly = await this.monthlySales.readMonthlySales({
      organizationId, masterProductIds: items.map(({ id }) => id), yearMonth,
    });
    const withMonthly = items.map((item) => {
      const sales = monthly.get(item.id);
      return { ...item, monthly: sales ? {
        ...sales, yearMonth,
        // Existing live Finance profit is order/recipe-based. Sellpia purchase
        // amounts cannot be substituted for the cost of these monthly sales.
        cost: null, grossProfit: null, grossMarginRate: null,
      } satisfies ProductMonthlySales : null };
    });
    const offset = (query.page - 1) * query.limit;
    const createdAt = new Map(raw.items.map((item) => [item.id, item.abcCreatedAt.getTime()]));
    const ranked = rankProducts(withMonthly, query.sort, createdAt);
    const pageItems = ranked.slice(offset, offset + query.limit);
    return {
      items: await this.applyDisplayImages(organizationId, pageItems),
      total: items.length,
      page: query.page,
      limit: query.limit,
      summary: {
        ...summarizeProducts(
          withMonthly,
          summarizeChannelProducts(raw.sellingChannelProducts ?? []),
          contributionOverview(contribution),
          dataStatus.displayDataAsOf,
          dataStatus.formulaState.officialCutoff,
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

  private async loadInventory(
    organizationId: string,
    inventorySkuIds: string[],
  ) {
    const masterProductIds = [...new Set(inventorySkuIds)].sort(
        (left, right) => left.localeCompare(right),
      );
    const availability = await this.inventory.findByMasterProductIds({
      organizationId,
      masterProductIds,
    });
    return new Map(availability.items.map((item) => [
      item.masterProductId,
      item,
    ]));
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

function noDirectSales(): ProductDepletionProjection {
  return {
    coverage: 'no_direct_sales',
    monthlyOutflow: null,
    outflowMonthCount: 0,
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
  abcOfficialCutoffDate: string | null,
): ProductOperationsListSummary {
  const counts = products.reduce<ProductOperationsListSummary>((counts, product) => {
    const abcGrade = product.abcGrade;
    if (abcGrade === 'A' || abcGrade === 'B' || abcGrade === 'C') {
      counts.abcGradeCounts[abcGrade] += 1;
    } else {
      counts.abcGradeCounts.unclassified += 1;
    }
    const evaluation = product.abcEvaluation;
    if (!counts.abcFormula && evaluation?.formula) counts.abcFormula = evaluation.formula;
    counts.inventoryStatusCounts[deriveProductInventoryStatus(product)] += 1;
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
    return counts;
  }, {
    abcGradeCounts: { A: 0, B: 0, C: 0, unclassified: 0 },
    contributionOverview: contributionOverviewValue,
    abcFormula: null,
    abcOfficialCutoffDate,
    displayDataAsOf,
    channelProductCounts,
    inventoryStatusCounts: {
      sellable: 0,
      out_of_stock: 0,
      configuration_required: 0,
      review_required: 0,
      uncollected: 0,
    },
    negativeProfitCount: 0,
    imminentProductCount: 0,
    reorderProductCount: 0,
    depletionCoveredProductCount: 0,
  });
  return counts;
}

function enrichAbc<T extends { id: string }>(
  product: T,
  status: ProductOperationsDataStatusFacts,
  contribution: ProductAbcContributionProduct | null,
) {
  const current = status.products.find(({ masterProductId }) =>
    masterProductId === product.id);
  const abc = buildProductAbcReadModel({
    evaluation: current?.evaluation ?? null,
    mappingValid: current?.mappingValid !== false,
    saleStartDate: current?.saleStartDate ?? null,
    evidence: {
      actualCutoff: status.actualCutoff,
      // Evidence carries a mapping generation only while it agrees with the
      // organization's current one; `mappingReady` is that agreement.
      mappingGeneration: status.mappingReady
        ? status.formulaState.mappingGeneration
        : null,
      sellpia: abcSourceEvidence(status.sellpia),
      advertising: abcSourceEvidence(status.advertising),
    },
    formulaState: {
      formulaRevision: current?.evaluation?.formulaRevision
        ?? status.formulaState.formulaRevision,
      publicationRevision: status.formulaState.publicationRevision,
      officialCutoffDate: status.formulaState.officialCutoff,
      publishedAt: status.formulaState.publishedAt,
      mappingGeneration: status.formulaState.mappingGeneration,
    },
  });
  return {
    ...product,
    abcGrade: abc.abcGrade,
    abcEvaluation: abc.evaluation,
    abc,
    contribution,
  };
}

function abcSourceEvidence(
  status: ProductOperationsDataStatusFacts['sellpia'],
): ProductAbcSourceEvidence {
  return {
    requiredCutoff: status.requiredCutoff,
    actualCutoff: status.actualCutoff,
    latestAttemptState: status.latestAttempt?.state ?? null,
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
  product: Pick<ReturnType<typeof mapProductOperationsListItem>, 'inventory' | 'inventoryUnits' | 'depletion'>,
  focus: ProductOperationsInventoryFocus,
): boolean {
  if (focus === 'attention') {
    return deriveProductInventoryStatus(product) === 'configuration_required'
      || deriveProductInventoryStatus(product) === 'review_required';
  }
  if (focus === 'out_of_stock') return deriveProductInventoryStatus(product) === 'out_of_stock';
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
    throw new ProductInputException(message);
  }
  return parsed.data;
}

function rankProducts<T extends MasterProductOperationsListItem>(
  products: readonly T[], sort: ProductOperationsSort, createdAt: ReadonlyMap<string, number>,
): T[] {
  const value = (product: T): number | null => {
    switch (sort) {
      case 'revenue': return product.monthly?.revenue ?? null;
      case 'sold': return product.monthly?.soldQuantity ?? null;
      case 'stock': return product.inventoryUnits;
      case 'latest': return createdAt.get(product.id) ?? null;
    }
  };
  return [...products].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    return (left !== null && right !== null ? right - left : 0) || a.id.localeCompare(b.id);
  });
}
