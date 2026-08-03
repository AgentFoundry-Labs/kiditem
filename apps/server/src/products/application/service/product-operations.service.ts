import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CreateMasterProductInputSchema,
  MasterProductOperationsListQuerySchema,
  type ProductOperationsChannelProductCount,
  type ProductOperationsInventoryFocus,
  ReplaceChannelOptionInventoryInputSchema,
  UpdateMasterProductInputSchema,
  type ProductDepletionProjection,
  type ProductOperationsListSummary,
} from '@kiditem/shared/product-operations';
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
import type { ProductOperationsPort } from '../port/in/product-operations.port';
import {
  PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT,
  type ProductOperationsDataStatusRepositoryPort,
} from '../port/out/repository/product-operations-data-status.repository.port';

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
    const inventoryBySkuId = await this.loadInventory(
      organizationId,
      raw.items.flatMap(({ inventoryOptions }) => inventoryOptions),
    );
    const placeholder = noDirectSales();
    const hydrated = raw.items.map((item) =>
      mapProductOperationsListItem(item, inventoryBySkuId, placeholder));
    const inventoryFiltered = query.inventoryStatus
      ? hydrated.filter(({ inventoryStatus }) =>
        inventoryStatus === query.inventoryStatus)
      : hydrated;
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
    const summaryMasterProductIdSet = new Set(items.map(({ id }) => id));
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
          summarizeChannelProducts(raw.items.filter((item) =>
            item.isActive && summaryMasterProductIdSet.has(item.id))),
        ),
        displayDataAsOf: dataStatus.displayDataAsOf,
      },
    };
  }

  async getProduct(organizationId: string, masterProductId: string) {
    const product = await this.repository.getProduct(organizationId, masterProductId);
    const mapped = mapProductOperationsDetail(
      product,
      await this.loadInventory(
        organizationId,
        product.channelListings.flatMap(({ options }) => options),
      ),
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
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
    const mapped = mapProductOperationsDetail(
      product,
      new Map(),
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
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
    const mapped = mapProductOperationsDetail(
      product,
      await this.loadInventory(
        organizationId,
        product.channelListings.flatMap(({ options }) => options),
      ),
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
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
    const product = await this.repository.replaceChannelOptionInventory({
      organizationId,
      channelListingOptionId,
      components: input.components,
    });
    const options = product.channelListings.flatMap(({ options }) => options);
    return mapProductOperationsDetail(
      product,
      await this.loadInventory(organizationId, options),
    );
  }

  private async loadInventory(
    organizationId: string,
    options: Array<{ inventoryComponents: Array<{ sellpiaInventorySkuId: string }> }>,
  ) {
    const sellpiaInventorySkuIds = [...new Set(options.flatMap(({ inventoryComponents }) =>
      inventoryComponents.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId)))].sort(
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
  products: Array<ReturnType<typeof mapProductOperationsListItem>>,
  channelProductCounts: ProductOperationsChannelProductCount[],
): ProductOperationsListSummary {
  const counts = products.reduce<ProductOperationsListSummary>((counts, product) => {
    const abcGrade = product.abcGrade;
    if (abcGrade === 'A' || abcGrade === 'B' || abcGrade === 'C') {
      counts.abcGradeCounts[abcGrade] += 1;
    } else {
      counts.abcGradeCounts.unclassified += 1;
    }
    const evaluation = product.abcEvaluation;
    if (evaluation) {
      counts.abcStatusCounts[evaluation.calculationStatus] += 1;
      if (abcGrade && evaluation.weightedContributionProfit !== null) {
        counts.abcContributionProfitByGrade[abcGrade] += Math.round(
          evaluation.weightedContributionProfit,
        );
      }
      if (!counts.abcFormula && evaluation.formula) counts.abcFormula = evaluation.formula;
    } else {
      counts.abcStatusCounts.CALIBRATION_PENDING += 1;
    }
    counts.inventoryStatusCounts[product.inventoryStatus] += 1;
    if (product.profit !== null && product.profit < 0) {
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
      READY: 0,
      INSUFFICIENT_EVIDENCE: 0,
      SOURCE_UNMAPPED: 0,
      CALIBRATION_PENDING: 0,
      RECALCULATING: 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
      ORDERS_SOURCE_STALE: 0,
      CALCULATION_ERROR: 0,
    },
    abcContributionProfitByGrade: { A: 0, B: 0, C: 0 },
    abcContributionProfitShareByGrade: { A: 0, B: 0, C: 0 },
    abcFormula: null,
    displayDataAsOf: conservativeDisplayDataAsOf(products),
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
  const contributionTotal = Object.values(counts.abcContributionProfitByGrade)
    .reduce((sum, value) => sum + value, 0);
  if (contributionTotal !== 0) {
    for (const grade of ['A', 'B', 'C'] as const) {
      counts.abcContributionProfitShareByGrade[grade] =
        counts.abcContributionProfitByGrade[grade] / contributionTotal;
    }
  }
  return counts;
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
  products: Array<{
    activeChannelProducts: Array<Omit<ProductOperationsChannelProductCount, 'count'>>;
  }>,
): ProductOperationsChannelProductCount[] {
  const counts = new Map<string, ProductOperationsChannelProductCount>();
  for (const product of products) {
    for (const channelProduct of product.activeChannelProducts) {
      const existing = counts.get(channelProduct.channelAccountId);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(channelProduct.channelAccountId, { ...channelProduct, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((left, right) =>
    left.channelAccountName.localeCompare(right.channelAccountName)
    || left.channelAccountId.localeCompare(right.channelAccountId));
}

function conservativeDisplayDataAsOf(
  products: Array<ReturnType<typeof mapProductOperationsListItem>>,
): string | null {
  const dates = products.flatMap((product) => [
    product.metricsFreshness.traffic.coverageEndDate,
    product.metricsFreshness.advertising.coverageEndDate,
    product.abcEvaluation?.sourceFreshness.evaluationCutoffDate ?? null,
  ]).filter((date): date is string => date !== null);
  return dates.length > 0 ? dates.reduce((earliest, date) => date < earliest ? date : earliest) : null;
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
