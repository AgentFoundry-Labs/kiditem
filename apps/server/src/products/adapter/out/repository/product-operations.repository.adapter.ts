import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from '@kiditem/shared/channel-listing';
import {
  dailyTrafficFactSource,
  type DailyTrafficFactSource,
} from '@kiditem/shared/advertising';
import { readListingAdWindowFacts, type AdListingWindowFacts } from '../../../../common/ad-window-facts';
import { addDays, businessDateKey, evidenceCutoffDate, kstBusinessDate } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
import { productAbcEvaluation } from '../../../mapper/product-abc-evaluation.mapper';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type {
  MasterProductOperationsListQuery,
} from '@kiditem/shared/product-operations';
import type {
  ProductOperationsRepositoryDetail,
  ProductOperationsDisplayMediaTarget,
  ProductOperationsRepositoryListItem,
  ProductOperationsRepositoryPort,
} from '../../../application/port/out/repository/product-operations.repository.port';

function productInclude(organizationId: string, periodStart?: Date) {
  return {
    abcEvaluation: { include: { formulaVersion: true } },
    inventorySkus: {
      where: { organizationId },
      orderBy: { id: 'asc' as const },
      select: { id: true },
    },
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
      select: {
        id: true,
        channelAccountId: true,
        externalId: true,
        displayName: true,
        status: true,
        isActive: true,
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
            trafficObservedAt: true,
            lastObservedAt: true,
            metaJson: true,
          },
        },
        options: {
          where: { organizationId },
          orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
          select: {
            id: true,
            externalOptionId: true,
            itemName: true,
            sellerSku: true,
            barcode: true,
            status: true,
            isActive: true,
            inventoryComponents: {
              where: { organizationId },
              orderBy: { createdAt: 'asc' as const },
              select: {
                id: true,
                sellpiaInventorySkuId: true,
                quantity: true,
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
    const periodStart = addDays(kstBusinessDate(new Date()), -(query.periodDays - 1));
    const [sellingMasterProductIds, sellingChannelProducts] = await Promise.all([
      listSellingMasterProductIds(this.prisma, organizationId),
      this.listSellingChannelProducts(organizationId),
    ]);
    const sellingMasterProductIdSet = new Set(sellingMasterProductIds);
    const [rows, adByListing] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: productListWhere(organizationId, query, sellingMasterProductIds),
        include: productInclude(organizationId, periodStart),
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      readListingAdWindowFacts(this.prisma, { organizationId, from: periodStart }),
    ]);
    const adFactsByListing = new Map(adByListing.map((facts) => [facts.listingId, facts]));
    return {
      items: rows.map((row) => toListItem(
        row,
        adFactsByListing,
        sellingMasterProductIdSet.has(row.id),
      )),
      page: query.page,
      limit: query.limit,
      sellingChannelProducts,
    };
  }

  private async listSellingChannelProducts(organizationId: string) {
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        channelAccount: {
          is: {
            organizationId,
            status: 'active',
            channel: { in: ['coupang', 'rocket'] },
          },
        },
      },
      select: {
        isActive: true,
        status: true,
        rawJson: true,
        channelAccount: {
          select: { id: true, channel: true, name: true },
        },
        channelListingDailySnapshots: {
          where: { organizationId },
          orderBy: [
            { businessDate: 'desc' },
            { lastObservedAt: 'desc' },
          ],
          take: 1,
          select: { saleStatus: true },
        },
        options: {
          where: { organizationId },
          select: { status: true },
        },
      },
    });
    return rows.flatMap((row) => isChannelListingOnSale(
      resolveChannelListingSaleStatus({
        latestSnapshotStatus: row.channelListingDailySnapshots[0]?.saleStatus,
        rawStatus: rawSaleStatus(row.rawJson),
        optionStatuses: row.options.map((option) => option.status),
        listingStatus: row.status,
        isActive: row.isActive,
      }),
    ) ? [{
      channelAccountId: row.channelAccount.id,
      channel: row.channelAccount.channel,
      channelAccountName: row.channelAccount.name,
    }] : []);
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

function rawSaleStatus(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['saleStatus', 'salesStatus', 'sale_status', '판매상태']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function productListWhere(
  organizationId: string,
  query: MasterProductOperationsListQuery,
  sellingMasterProductIds: readonly string[],
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
    ...(query.activeStatus === 'active' ? { id: { in: [...sellingMasterProductIds] } } : {}),
    ...(query.activeStatus === 'inactive' ? { id: { notIn: [...sellingMasterProductIds] } } : {}),
    ...(query.abcGrade === 'unclassified'
      ? { abcGrade: null }
      : query.abcGrade
        ? { abcGrade: query.abcGrade }
        : {}),
    ...(query.adStatus === 'active' ? { adTier: { not: null } } : {}),
    ...(query.adStatus === 'inactive' ? { adTier: 'inactive' } : {}),
    ...(query.adStatus === 'unconfigured' ? { adTier: null } : {}),
  };
}

function toDetail(row: ProductRow): ProductOperationsRepositoryDetail {
  return {
    ...metadata(row),
    inventorySkuIds: row.inventorySkus.map(({ id }) => id),
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
  adFactsByListing: ReadonlyMap<string, AdListingWindowFacts>,
  isSelling: boolean,
): ProductOperationsRepositoryListItem {
  const activeListings = row.channelListings.filter((listing) => listing.isActive);
  const dailyFacts = row.channelListings.flatMap(
    (listing) => listing.channelListingDailySnapshots,
  );
  const trafficFacts = dailyFacts.filter(isAcceptedTrafficFact);
  const advertisingFacts = row.channelListings.flatMap((listing) => {
    const facts = adFactsByListing.get(listing.id);
    return facts ? [facts] : [];
  });
  const csvTrafficFacts = trafficFacts.filter(
    (fact) => trafficFactSource(fact) === 'csv_upload',
  );
  // Wing listing projections carry option/page visitors, not account UV.
  // Product Hub may retain explicitly uploaded listing visitors, but never
  // presents a sum of Wing option projections as unique visitors.
  const visitorCount = nullableTrafficMetricSum(csvTrafficFacts, (fact) => fact.trafficVisitors);
  const viewCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficViews);
  const cartAddCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficCartAdds);
  const orderCount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficOrders);
  const salesQuantity = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficSalesQty);
  const salesAmount = nullableTrafficMetricSum(trafficFacts, (fact) => fact.trafficRevenue);
  const adSpend = nullableSum(advertisingFacts, (fact) => fact.spend);
  return {
    ...metadata(row),
    abcCreatedAt: row.createdAt,
    isSelling,
    updatedAt: row.updatedAt,
    inventorySkuIds: row.inventorySkus.map(({ id }) => id),
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
      traffic: dailyMetricFreshness(trafficFacts),
      advertising: advertisingFreshness(advertisingFacts),
    },
  };
}

/** Ready when the measured window reaches yesterday (KST). */
function freshness(coverageStart: string, coverageEnd: string, capturedAt: Date) {
  const yesterdayKst = businessDateKey(evidenceCutoffDate());
  return {
    ready: coverageEnd >= yesterdayKst,
    coverageStartDate: coverageStart,
    coverageEndDate: coverageEnd,
    capturedAt,
  };
}

const NO_FRESHNESS = { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null };

function advertisingFreshness(facts: readonly AdListingWindowFacts[]) {
  if (facts.length === 0) return NO_FRESHNESS;
  const first = facts[0]!;
  const start = facts.reduce((earliest, f) => (f.firstDate < earliest ? f.firstDate : earliest), first.firstDate);
  const end = facts.reduce((latest, f) => (f.lastDate > latest ? f.lastDate : latest), first.lastDate);
  const capturedAt = facts.reduce((latest, f) => (f.observedAt > latest ? f.observedAt : latest), first.observedAt);
  return freshness(start, end, capturedAt);
}

function dailyMetricFreshness(
  facts: readonly {
    businessDate: Date;
    lastObservedAt: Date;
    trafficObservedAt: Date | null;
  }[],
) {
  if (facts.length === 0) return NO_FRESHNESS;
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
      const observedAt = fact.trafficObservedAt ?? fact.lastObservedAt;
      return observedAt > latest ? observedAt : latest;
    },
    first.trafficObservedAt ?? first.lastObservedAt,
  );
  return freshness(calendarDate(coverageStart), calendarDate(coverageEnd), capturedAt);
}

type ProductTrafficFact = ProductRow['channelListings'][number]['channelListingDailySnapshots'][number];

function trafficFactSource(fact: ProductTrafficFact): DailyTrafficFactSource | null {
  return dailyTrafficFactSource(fact.metaJson);
}

/** A traffic row is a measurement only on a day the source reported. */
function isAcceptedTrafficFact(fact: ProductTrafficFact): boolean {
  return fact.trafficObservedAt !== null;
}

function metadata(row: ProductRow) {
  const abcEvaluation = productAbcEvaluation(row.abcEvaluation);
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
    abcGrade: abcEvaluation?.abcGrade ?? null,
    abcEvaluation,
    profitTag: row.profitTag,
    adTier: row.adTier,
    adBudgetLimit: row.adBudgetLimit,
    healthScore: row.healthScore,
    healthUpdatedAt: row.healthUpdatedAt,
    isActive: row.isActive,
  };
}

function calendarDate(value: Date): string {
  return businessDateKey(value);
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

function nullableTrafficMetricSum<T>(
  rows: readonly T[],
  value: (row: T) => number,
): number | null {
  return nullableSum(rows, value);
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
