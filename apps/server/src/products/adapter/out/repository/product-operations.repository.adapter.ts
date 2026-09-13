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
  advertisingApplies,
  readAdWindowFacts,
  readListingAdWindowFacts,
  type AdListingWindowFacts,
} from '../../../../advertising/read/ad-target-facts';
import { addDays, businessDateKey, kstDayStart } from '../../../../common/kst';
import { readOrderWindowFacts, readListingOptionOrderFacts, type ListingOptionOrderFacts } from '../../../../orders/read/order-facts.reader';
import {
  readLatestListingSaleStatusFacts,
  readListingTrafficWindowFacts,
  type ListingTrafficDailyFact,
} from '../../../../channels/read/channel-listing-daily-facts';
import { PrismaService } from '../../../../prisma/prisma.service';
import { productAbcEvidenceCutoff } from '../../../domain/product-abc-display-status';
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

function productInclude(organizationId: string) {
  return {
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
          select: { id: true, channel: true, name: true, status: true },
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
    const cutoff = new Date(`${productAbcEvidenceCutoff(new Date())}T00:00:00.000Z`);
    const periodStart = addDays(cutoff, -(query.periodDays - 1));
    const periodEnd = addDays(cutoff, 1);
    const { sellingMasterProductIds, sellingChannelProducts, rows, adByListing, traffic, adCoverage, orders, orderLines } =
      await this.prisma.$transaction(async (tx) => {
        const sellingMasterProductIds = await listSellingMasterProductIds(tx, organizationId);
        const sellingChannelProducts = await this.listSellingChannelProducts(tx, organizationId);
        const rows = await tx.masterProduct.findMany({
          where: productListWhere(organizationId, query, sellingMasterProductIds),
          include: productInclude(organizationId),
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        });
        const adByListing = await readListingAdWindowFacts(tx, { organizationId, from: periodStart, to: periodEnd });
        const adWindow = await readAdWindowFacts(tx, { organizationId, from: periodStart, to: periodEnd });
        const applies = await advertisingApplies(tx, organizationId);
        const adCoverage = {
          ready: !applies || adWindow.days.length === query.periodDays,
          coverageStartDate: businessDateKey(periodStart),
          coverageEndDate: businessDateKey(cutoff),
          capturedAt: adWindow.observedAt,
        };
        const traffic = await readListingTrafficWindowFacts(tx, {
          organizationId, from: periodStart, to: periodEnd,
          listingIds: rows.flatMap((row) => row.channelListings.map((listing) => listing.id)),
        });
        const orderWindow = { organizationId, from: kstDayStart(periodStart), to: kstDayStart(periodEnd) };
        const orders = await readOrderWindowFacts(tx, orderWindow);
        const orderLines = await readListingOptionOrderFacts(tx, orderWindow);
        return { sellingMasterProductIds, sellingChannelProducts, rows, adByListing, traffic, adCoverage, orders, orderLines };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const sellingMasterProductIdSet = new Set(sellingMasterProductIds);
    const trafficByListing = new Map<string, ListingTrafficDailyFact[]>();
    for (const fact of traffic.rows) {
      const facts = trafficByListing.get(fact.listingId) ?? [];
      facts.push(fact);
      trafficByListing.set(fact.listingId, facts);
    }
    const adFactsByListing = new Map(adByListing.map((facts) => [facts.listingId, facts]));
    const trafficCoverage = {
      ready: traffic.coverage.includedDates.length === query.periodDays
        && traffic.coverage.invalidDates.length === 0 && traffic.coverage.missingDates.length === 0,
      coverageStartDate: businessDateKey(periodStart),
      coverageEndDate: businessDateKey(cutoff),
      capturedAt: traffic.latestObservedAt,
    };
    const orderCoverage = {
      ready: orders.orderCount !== null,
      coverageStartDate: businessDateKey(periodStart),
      coverageEndDate: businessDateKey(cutoff),
      capturedAt: orders.observedAt,
    };
    return {
      items: rows.map((row) => toListItem(
        row,
        adFactsByListing,
        trafficByListing,
        sellingMasterProductIdSet.has(row.id),
        adCoverage,
        trafficCoverage,
        orderCoverage,
        orderLines,
      )),
      page: query.page,
      limit: query.limit,
      sellingChannelProducts,
    };
  }

  private async listSellingChannelProducts(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const rows = await tx.channelListing.findMany({
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
        id: true,
        isActive: true,
        status: true,
        rawJson: true,
        channelAccount: {
          select: { id: true, channel: true, name: true },
        },
        options: {
          where: { organizationId },
          select: { status: true },
        },
      },
    });
    const statusFacts = await readLatestListingSaleStatusFacts(tx, {
      organizationId,
      listingIds: rows.map((row) => row.id),
    });
    const saleStatusByListing = new Map(statusFacts.map((fact) => [
      fact.listingId,
      fact.saleStatus,
    ]));
    return rows.flatMap((row) => isChannelListingOnSale(
      resolveChannelListingSaleStatus({
        latestSnapshotStatus: saleStatusByListing.get(row.id) ?? null,
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
  trafficFactsByListing: ReadonlyMap<string, readonly ListingTrafficDailyFact[]>,
  isSelling: boolean,
  adCoverage: ProductOperationsRepositoryListItem['metricsFreshness']['advertising'],
  trafficCoverage: ProductOperationsRepositoryListItem['metricsFreshness']['traffic'],
  orderCoverage: ProductOperationsRepositoryListItem['metricsFreshness']['orders'],
  orderLines: readonly ListingOptionOrderFacts[],
): ProductOperationsRepositoryListItem {
  const activeListings = row.channelListings.filter((listing) => listing.isActive);
  const dailyFacts = row.channelListings.flatMap(
    (listing) => trafficFactsByListing.get(listing.id) ?? [],
  );
  const trafficFacts = dailyFacts;
  const advertisingFacts = row.channelListings.flatMap((listing) => {
    const facts = adFactsByListing.get(listing.id);
    return facts ? [facts] : [];
  });
  const csvTrafficFacts = trafficFacts.filter(
    (fact) => fact.source === 'csv_upload',
  );
  const trafficMeasured = trafficCoverage.ready && row.channelListings.some(
    (listing) => listing.isActive
      && listing.channelAccount.channel === 'coupang'
      && listing.channelAccount.status === 'active',
  );
  // Wing listing projections carry option/page visitors, not account UV.
  // Product Hub may retain explicitly uploaded listing visitors, but never
  // presents a sum of Wing option projections as unique visitors.
  const visitorCount = trafficMeasured
    ? nullableTrafficMetricSum(csvTrafficFacts, (fact) => fact.visitors)
    : null;
  const viewCount = trafficMeasured
    ? trafficFacts.reduce((sum, fact) => sum + fact.views, 0)
    : null;
  const cartAddCount = trafficMeasured
    ? trafficFacts.reduce((sum, fact) => sum + fact.cartAdds, 0)
    : null;
  const optionIds = new Set(row.channelListings.flatMap((listing) => listing.options.map(({ id }) => id)));
  const productOrders = orderLines.filter((line) => optionIds.has(line.listingOptionId));
  const orderCount = orderCoverage.ready ? new Set(productOrders.map(({ orderId }) => orderId)).size : null;
  const salesQuantity = orderCoverage.ready ? productOrders.reduce((sum, line) => sum + line.quantity, 0) : null;
  const salesAmount = orderCoverage.ready ? productOrders.reduce((sum, line) => sum + line.revenue, 0) : null;
  const adSpend = adCoverage.ready
    ? advertisingFacts.reduce((total, fact) => total + fact.spend, 0)
    : null;
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
      traffic: trafficCoverage,
      advertising: adCoverage,
      orders: orderCoverage,
    },
  };
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
    profitTag: row.profitTag,
    adTier: row.adTier,
    adBudgetLimit: row.adBudgetLimit,
    healthScore: row.healthScore,
    healthUpdatedAt: row.healthUpdatedAt,
    isActive: row.isActive,
  };
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
