import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MasterProductOperationsListQuery,
} from '@kiditem/shared/product-operations';
import {
  ProductAbcEvaluationSchema,
  ProductAbcFormulaSummarySchema,
  type ProductAbcEvaluation,
} from '@kiditem/shared/product-abc';
import type {
  ProductOperationsRepositoryDetail,
  ProductOperationsDisplayMediaTarget,
  ProductOperationsRepositoryListItem,
  ProductOperationsRepositoryPort,
} from '../../../application/port/out/repository/product-operations.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

function productInclude(organizationId: string, periodStart?: Date) {
  return {
    abcEvaluation: { include: { formulaVersion: true } },
    originChannelListing: {
      select: {
        externalId: true,
        channelAccount: {
          select: { name: true },
        },
      },
    },
    channelListings: {
      where: { organizationId },
      orderBy: { createdAt: 'asc' as const },
      include: {
        channelAccount: {
          select: { id: true, channel: true, name: true },
        },
        channelListingDailySnapshots: {
          where: {
            organizationId,
            ...(periodStart ? { businessDate: { gte: periodStart } } : {}),
          },
          select: {
            businessDate: true,
            trafficVisitors: true,
            trafficViews: true,
            trafficCartAdds: true,
            trafficOrders: true,
            trafficSalesQty: true,
            trafficRevenue: true,
            adSpend: true,
            adCoverageStatus: true,
            adObservedAt: true,
            trafficCoverageStatus: true,
            trafficObservedAt: true,
            lastObservedAt: true,
          },
        },
        profitLoss: {
          where: { organizationId },
          select: { year: true, month: true, netProfit: true },
        },
        options: {
          where: { organizationId },
          orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
          include: {
            inventoryComponents: {
              where: { organizationId },
              orderBy: { createdAt: 'asc' as const },
              include: {
                sellpiaInventorySku: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    optionName: true,
                    barcode: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

type ProductRow = Prisma.MasterProductGetPayload<{
  include: ReturnType<typeof productInclude>;
}>;

@Injectable()
export class ProductOperationsRepositoryAdapter
implements ProductOperationsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listDisplayMediaTargets(
    organizationId: string,
    masterProductIds: string[],
  ): Promise<ProductOperationsDisplayMediaTarget[]> {
    const ids = [...new Set(masterProductIds)];
    if (ids.length === 0) return [];
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        masterProductId: { in: ids },
        isActive: true,
        channelAccount: { is: { organizationId, status: 'active' } },
      },
      select: {
        id: true,
        externalId: true,
        masterProductId: true,
        channelAccount: { select: { isPrimary: true } },
        masterProduct: { select: { originChannelListingId: true } },
      },
    });
    return rows.flatMap((row) => row.masterProductId && row.masterProduct
      ? [{
        masterProductId: row.masterProductId,
        channelListingId: row.id,
        isOrigin: row.masterProduct.originChannelListingId === row.id,
        isPrimaryAccount: row.channelAccount.isPrimary,
        listingExternalId: row.externalId,
      }]
      : []).sort(compareDisplayMediaTargets);
  }

  async listProducts(
    organizationId: string,
    query: MasterProductOperationsListQuery,
  ) {
    const periodStart = startOfUtcDay(
      new Date(Date.now() - (query.periodDays - 1) * 86_400_000),
    );
    const rows = await this.prisma.masterProduct.findMany({
      where: productListWhere(organizationId, query),
      include: productInclude(organizationId, periodStart),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return {
      items: rows.map((row) => toListItem(row, periodStart)),
      page: query.page,
      limit: query.limit,
    };
  }

  async getProduct(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductOperationsRepositoryDetail> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id: masterProductId, organizationId },
      include: productInclude(organizationId),
    });
    if (!row) throw new NotFoundException('MasterProduct was not found');
    return toDetail(row);
  }

  async createProduct(input: {
    organizationId: string;
    product: Parameters<ProductOperationsRepositoryPort['createProduct']>[0]['product'];
  }): Promise<ProductOperationsRepositoryDetail> {
    try {
      const product = await this.prisma.masterProduct.create({
        data: {
          organizationId: input.organizationId,
          description: null,
          category: null,
          brand: null,
          tags: [],
          imageUrls: [],
          profitTag: null,
          adTier: null,
          adBudgetLimit: null,
          healthScore: null,
          isActive: true,
          ...input.product,
        },
        select: { id: true },
      });
      return this.getProduct(input.organizationId, product.id);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async updateProduct(
    organizationId: string,
    masterProductId: string,
    input: Parameters<ProductOperationsRepositoryPort['updateProduct']>[2],
  ): Promise<ProductOperationsRepositoryDetail> {
    try {
      const result = await this.prisma.masterProduct.updateMany({
        where: { id: masterProductId, organizationId },
        data: {
          ...input,
          ...('healthScore' in input ? { healthUpdatedAt: new Date() } : {}),
        },
      });
      if (result.count === 0) throw new NotFoundException('MasterProduct was not found');
      return this.getProduct(organizationId, masterProductId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async replaceChannelOptionInventory(
    input: Parameters<ProductOperationsRepositoryPort['replaceChannelOptionInventory']>[0],
  ): Promise<ProductOperationsRepositoryDetail> {
    try {
      const masterProductId = await this.prisma.$transaction(async (tx) => {
        const option = await tx.channelListingOption.findFirst({
          where: { id: input.channelListingOptionId, organizationId: input.organizationId },
          select: {
            id: true,
            listing: { select: { masterProductId: true } },
          },
        });
        if (!option) throw new NotFoundException('Channel listing option was not found');
        if (!option.listing.masterProductId) {
          throw new BadRequestException('Channel listing must be linked to a MasterProduct first');
        }
        await validateRecipeSkus(tx, input.organizationId, input.components);
        await tx.channelListingOptionInventoryComponent.deleteMany({
          where: {
            organizationId: input.organizationId,
            channelListingOptionId: input.channelListingOptionId,
          },
        });
        if (input.components.length > 0) {
          await tx.channelListingOptionInventoryComponent.createMany({
            data: input.components.map((component) => ({
              organizationId: input.organizationId,
              channelListingOptionId: input.channelListingOptionId,
              sellpiaInventorySkuId: component.sellpiaInventorySkuId,
              quantity: component.quantity,
            })),
          });
        }
        return option.listing.masterProductId;
      }, TRANSACTION_OPTIONS);
      return this.getProduct(input.organizationId, masterProductId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }
}

function compareDisplayMediaTargets(
  left: ProductOperationsDisplayMediaTarget,
  right: ProductOperationsDisplayMediaTarget,
): number {
  return left.masterProductId.localeCompare(right.masterProductId)
    || Number(right.isOrigin) - Number(left.isOrigin)
    || Number(right.isPrimaryAccount) - Number(left.isPrimaryAccount)
    || left.listingExternalId.localeCompare(right.listingExternalId)
    || left.channelListingId.localeCompare(right.channelListingId);
}

function productListWhere(
  organizationId: string,
  query: MasterProductOperationsListQuery,
): Prisma.MasterProductWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
    ...(search ? {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.activeStatus === 'active' ? { isActive: true } : {}),
    ...(query.activeStatus === 'inactive' ? { isActive: false } : {}),
    ...(query.abcGrade === 'unclassified'
      ? { abcGrade: null }
      : query.abcGrade
        ? { abcGrade: query.abcGrade }
        : {}),
    ...(query.abcCalculationStatus ? {
      abcEvaluation: { is: { calculationStatus: query.abcCalculationStatus } },
    } : {}),
    ...(query.adStatus === 'active' ? { adTier: { not: null } } : {}),
    ...(query.adStatus === 'inactive' ? { adTier: 'inactive' } : {}),
    ...(query.adStatus === 'unconfigured' ? { adTier: null } : {}),
  };
}

async function validateRecipeSkus(
  tx: Prisma.TransactionClient,
  organizationId: string,
  components: readonly { sellpiaInventorySkuId: string; quantity: number }[],
): Promise<void> {
  if (components.some((component) => component.quantity <= 0)) {
    throw new BadRequestException('Channel option inventory quantities must be positive');
  }
  const ids = [...new Set(components.map((component) => component.sellpiaInventorySkuId))];
  if (ids.length !== components.length) {
    throw new BadRequestException('Channel option inventory SKUs must be unique');
  }
  await validateActiveRecipeSkuIds(tx, organizationId, ids);
}

async function validateActiveRecipeSkuIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const rows = await tx.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, isActive: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (ids.some((id) => !byId.has(id))) {
    throw new BadRequestException(
      'One or more SellpiaInventorySku components do not belong to this organization',
    );
  }
  if (ids.some((id) => byId.get(id)?.isActive !== true)) {
    throw new BadRequestException('Inactive SellpiaInventorySku components require review');
  }
}

function toDetail(row: ProductRow): ProductOperationsRepositoryDetail {
  return {
    ...metadata(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    channelListings: row.channelListings.map((listing) => ({
      id: listing.id,
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      channelAccountName: listing.channelAccount.name,
      externalId: listing.externalId,
      displayName: listing.displayName,
      status: listing.status,
      isActive: listing.isActive,
      options: listing.options.map(toRepositoryOption),
    })),
  };
}

function toListItem(
  row: ProductRow,
  periodStart: Date,
): ProductOperationsRepositoryListItem {
  const activeListings = row.channelListings.filter((listing) => listing.isActive);
  const dailyFacts = row.channelListings.flatMap(
    (listing) => listing.channelListingDailySnapshots,
  );
  const trafficFacts = dailyFacts.filter(hasTrafficEvidence);
  const advertisingFacts = dailyFacts.filter(hasAdvertisingEvidence);
  const visitorCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficVisitors);
  const viewCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficViews);
  const cartAddCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficCartAdds);
  const orderCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficOrders);
  const salesQuantity = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficSalesQty);
  const salesAmount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficRevenue);
  const adSpend = nullableSum(advertisingFacts, (fact) => fact.adSpend);
  const profits = row.channelListings.flatMap((listing) =>
    listing.profitLoss.filter((fact) => monthEndUtc(fact.year, fact.month) >= periodStart),
  );
  return {
    ...metadata(row),
    updatedAt: row.updatedAt,
    activeChannelProducts: activeListings.map((listing) => ({
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      channelAccountName: listing.channelAccount.name,
    })),
    inventoryOptions: activeListings.flatMap((listing) =>
      listing.options.map(toRepositoryOption)),
    channelCount: activeListings.length,
    channelStatus: activeListings.length === 0
      ? 'unlisted'
      : activeListings.length < row.channelListings.length
        ? 'partial'
        : 'listed',
    traffic: visitorCount,
    visitorCount,
    viewCount,
    cartAddCount,
    orderCount,
    salesQuantity,
    salesAmount,
    adSpend,
    adSpendRate: adSpend !== null && salesAmount !== null && salesAmount > 0
      ? (adSpend / salesAmount) * 100
      : null,
    metricsFreshness: {
      traffic: dailyMetricFreshness(trafficFacts, 'traffic'),
      advertising: dailyMetricFreshness(advertisingFacts, 'advertising'),
    },
    profit: nullableSum(profits, (fact) => fact.netProfit),
    contributionProfitVelocity30: decimalToFinite(row.abcEvaluation?.profitVelocity30 ?? null),
    contributionMargin: decimalToFinite(row.abcEvaluation?.weightedContributionMargin ?? null),
  };
}

function dailyMetricFreshness(
  facts: readonly {
    businessDate: Date;
    lastObservedAt: Date;
    adObservedAt: Date | null;
    trafficObservedAt: Date | null;
  }[],
  source: 'traffic' | 'advertising',
) {
  if (facts.length === 0) {
    return {
      status: 'MISSING' as const,
      coverageStartDate: null,
      coverageEndDate: null,
      capturedAt: null,
    };
  }
  const first = facts[0]!;
  const coverageStart = facts.reduce(
    (earliest, fact) => fact.businessDate < earliest ? fact.businessDate : earliest,
    first.businessDate,
  );
  const coverageEnd = facts.reduce(
    (latest, fact) => fact.businessDate > latest ? fact.businessDate : latest,
    first.businessDate,
  );
  const capturedAt = facts.reduce(
    (latest, fact) => {
      const observedAt = source === 'traffic'
        ? fact.trafficObservedAt ?? fact.lastObservedAt
        : fact.adObservedAt ?? fact.lastObservedAt;
      return observedAt > latest ? observedAt : latest;
    },
    source === 'traffic'
      ? first.trafficObservedAt ?? first.lastObservedAt
      : first.adObservedAt ?? first.lastObservedAt,
  );
  const yesterdayKst = new Date(Date.now() + (9 * 60 * 60 * 1000) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    status: calendarDate(coverageEnd) >= yesterdayKst ? 'READY' as const : 'STALE' as const,
    coverageStartDate: calendarDate(coverageStart),
    coverageEndDate: calendarDate(coverageEnd),
    capturedAt,
  };
}

function hasTrafficEvidence(
  fact: ProductRow['channelListings'][number]['channelListingDailySnapshots'][number],
): boolean {
  return fact.trafficCoverageStatus !== null
    || fact.trafficVisitors !== 0
    || fact.trafficViews !== 0
    || fact.trafficCartAdds !== 0
    || fact.trafficOrders !== 0
    || fact.trafficSalesQty !== 0
    || fact.trafficRevenue !== 0;
}

function hasAdvertisingEvidence(
  fact: ProductRow['channelListings'][number]['channelListingDailySnapshots'][number],
): boolean {
  return fact.adCoverageStatus !== null || fact.adSpend !== 0;
}

function metadata(row: ProductRow) {
  return {
    id: row.id,
    code: row.code,
    displayReference: row.originChannelListing
      ? {
          type: 'channel_product' as const,
          label: `${row.originChannelListing.channelAccount.name} 상품번호`,
          value: row.originChannelListing.externalId,
        }
      : {
          type: 'product_code' as const,
          label: '상품 코드',
          value: row.code,
        },
    name: row.name,
    description: row.description,
    category: row.category,
    brand: row.brand,
    tags: row.tags,
    imageUrls: row.imageUrls,
    abcGrade: productAbcGrade(row.abcGrade),
    abcEvaluation: productAbcEvaluation(row.abcEvaluation, row.abcGrade),
    profitTag: row.profitTag,
    adTier: row.adTier,
    adBudgetLimit: row.adBudgetLimit,
    healthScore: row.healthScore,
    healthUpdatedAt: row.healthUpdatedAt,
    isActive: row.isActive,
  };
}

function productAbcGrade(value: string | null): 'A' | 'B' | 'C' | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

function productAbcEvaluation(
  row: ProductRow['abcEvaluation'],
  abcGrade: string | null,
) : ProductAbcEvaluation | null {
  if (!row) return null;
  const cutoff = row.evaluationCutoffDate ?? row.sourceCoverageEndDate ?? row.calculatedAt;
  if (!cutoff || !row.costComponentsJson) return null;
  const formula = row.formulaVersion
    ? ProductAbcFormulaSummarySchema.safeParse(row.formulaVersion.formulaJson)
    : null;
  const parsed = ProductAbcEvaluationSchema.safeParse({
    abcGrade: productAbcGrade(abcGrade),
    calculationStatus: row.calculationStatus,
    rawScore: decimalToFinite(row.rawScore),
    adjustedScore: decimalToFinite(row.adjustedScore),
    reliability: decimalToFinite(row.reliability),
    weightedRevenue: decimalToFinite(row.weightedRevenue),
    weightedOrderTimeCogs: decimalToFinite(row.weightedOrderTimeCogs),
    weightedAdSpend: decimalToFinite(row.weightedAdSpend),
    weightedContributionProfit: decimalToFinite(row.weightedContributionProfit),
    profitVelocity30: decimalToFinite(row.profitVelocity30),
    weightedContributionMargin: decimalToFinite(row.weightedContributionMargin),
    lossRecurrence: decimalToFinite(row.lossRecurrence),
    paidOrderCount: row.paidOrderCount,
    observationDays: row.observationDays,
    firstValidPaidSaleAt: row.firstValidPaidSaleAt,
    formula: formula?.success ? formula.data : null,
    sourceFreshness: {
      evaluationCutoffDate: calendarDate(cutoff),
      sellpia: {
        status: row.sellpiaSourceStatus,
        coverageStartDate: row.sellpiaCoverageStartDate ?? row.sourceCoverageStartDate
          ? calendarDate((row.sellpiaCoverageStartDate ?? row.sourceCoverageStartDate)!)
          : null,
        coverageEndDate: row.sellpiaCoverageEndDate ?? row.sourceCoverageEndDate
          ? calendarDate((row.sellpiaCoverageEndDate ?? row.sourceCoverageEndDate)!)
          : null,
        capturedAt: row.sellpiaSourceCapturedAt,
      },
      advertising: {
        status: row.advertisingSourceStatus,
        coverageStartDate: row.advertisingCoverageStartDate
          ? calendarDate(row.advertisingCoverageStartDate)
          : null,
        coverageEndDate: row.advertisingCoverageEndDate
          ? calendarDate(row.advertisingCoverageEndDate)
          : null,
        capturedAt: row.advertisingSourceCapturedAt,
      },
      orders: {
        status: row.ordersSourceStatus,
        coverageStartDate: row.ordersCoverageStartDate
          ? calendarDate(row.ordersCoverageStartDate)
          : null,
        coverageEndDate: row.ordersCoverageEndDate
          ? calendarDate(row.ordersCoverageEndDate)
          : null,
        capturedAt: row.ordersSourceCapturedAt,
      },
      mapping: {
        status: row.mappingSourceStatus,
        inventoryGeneration: row.mappingInventoryGeneration?.toString() ?? null,
        verifiedAt: row.mappingVerifiedAt,
      },
    },
    costBreakdown: row.costComponentsJson,
    statusDetail: row.statusDetail,
    calculatedAt: row.calculatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function decimalToFinite(value: Prisma.Decimal | null): number | null {
  if (value === null) return null;
  const number = value.toNumber();
  return Number.isFinite(number) ? number : null;
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toRepositoryOption(
  option: ProductRow['channelListings'][number]['options'][number],
) {
  return {
    id: option.id,
    externalOptionId: option.externalOptionId,
    itemName: option.itemName,
    sellerSku: option.sellerSku,
    barcode: option.barcode,
    status: option.status,
    isActive: option.isActive,
    inventoryComponents: option.inventoryComponents.map((component) => ({
      id: component.id,
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      code: component.sellpiaInventorySku.code,
      name: component.sellpiaInventorySku.name,
      optionName: component.sellpiaInventorySku.optionName,
      barcode: component.sellpiaInventorySku.barcode,
      quantity: component.quantity,
    })),
  };
}

function nullableSum<T>(rows: readonly T[], value: (row: T) => number): number | null {
  return rows.length === 0 ? null : rows.reduce((sum, row) => sum + value(row), 0);
}

function nullableTrafficMetricSum<T extends { trafficCoverageStatus: string | null }>(
  rows: readonly T[],
  value: (row: T) => number,
): number | null {
  const evidencedRows = rows.filter((row) =>
    row.trafficCoverageStatus !== null || value(row) !== 0);
  return nullableSum(evidencedRows, value);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthEndUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function translateMutationError(error: unknown): unknown {
  if (
    error instanceof BadRequestException
    || error instanceof NotFoundException
    || error instanceof ConflictException
  ) {
    return error;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Product code already exists in this organization');
  }
  return error;
}
