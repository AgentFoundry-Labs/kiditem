import {
  BadRequestException,
  ConflictException,
  Inject, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from '@kiditem/shared/channel-listing';
import { buildPeriodBasis, periodBasisStatus, WING_TRAFFIC_SOURCE } from '@kiditem/shared/dashboard';
import { lockProductMapping } from '../../../../common/product-mapping-generation';
import { advanceProductMappingGeneration } from './product-mapping-generation';
import { ProductStateException } from '../../../application/exception/product-state.exception';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { listingProductIdFromRecipes } from '../../../../channels/domain/listing/listing-product-summary';
import {
  advertisingApplies,
  readAdEvidenceCutoff,
  readAdWindowFacts,
  readListingAdWindowFacts,
  type AdListingWindowFacts,
} from '../../../../advertising/adapter/out/persistence/read/ad-target-facts';
import { addDays, businessDateKey, kstDayStart } from '../../../../common/kst';
import { readOrderWindowFacts, readListingOptionOrderFacts, type ListingOptionOrderFacts } from '../../../../orders/adapter/out/persistence/read/order-facts.reader';
import {
  readLatestListingSaleStatusFacts,
  readListingTrafficWindowFacts,
  type ListingTrafficDailyFact,
} from '../../../../channels/adapter/out/persistence/channel-listing-daily-facts';
import { PrismaService } from '../../../../prisma/prisma.service';
import { productAbcEvidenceCutoff } from '../../../domain/product-abc-display-status';
import { PRODUCT_TRANSACTIONAL_READ_PORT, type ProductTransactionalReadPort } from '../../../application/port/in/product-transactional-read.port';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadModel,
  type ProductSourceReadPort,
} from '../../../application/port/in/product-source-read.port';
import { lockProductSource } from './transaction/product-source-lock';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type { ProductSourceChange } from '../../../domain/product-source-change';
import type {
  MasterProductOperationsListQuery,
} from '@kiditem/shared/product-operations';
import type {
  ProductOperationsRepositoryDetail,
  ProductOperationsDisplayMediaTarget,
  ProductOperationsRepositoryListItem,
  ProductOperationsRepositoryPort,
} from '../../../application/port/out/persistence/product-operations.repository.port';

function channelListingSelect(organizationId: string) {
  return {
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
                masterProductId: true,
                quantity: true,
              },
            },
          },
        },
      } satisfies Prisma.ChannelListingSelect;
}

type ChannelProductRow = Prisma.ChannelListingGetPayload<{
  select: ReturnType<typeof channelListingSelect>;
}>;
type ProductRow = Prisma.MasterProductGetPayload<{}> & { channelListings: ChannelProductRow[] };

async function attachChannelListings(
  tx: Pick<Prisma.TransactionClient, 'channelListing'>,
  organizationId: string,
  products: Prisma.MasterProductGetPayload<{}>[],
): Promise<ProductRow[]> {
  if (!products.length) return [];
  const listings = await tx.channelListing.findMany({
    where: {
      organizationId,
      options: { some: {
          organizationId,
          inventoryComponents: { some: {
            organizationId,
            masterProductId: { in: products.map(({ id }) => id) },
          } },
        } },
    },
    select: channelListingSelect(organizationId),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const byProduct = new Map<string, ChannelProductRow[]>();
  for (const listing of listings) {
    const linkedProductIds = new Set([
      ...listing.options.flatMap((option) =>
        option.inventoryComponents.map((component) => component.masterProductId)),
    ]);
    for (const productId of linkedProductIds) {
      const group = byProduct.get(productId) ?? [];
      group.push(listing);
      byProduct.set(productId, group);
    }
  }
  return products.map((product) => ({ ...product, channelListings: byProduct.get(product.id) ?? [] }));
}

type InventorySkuIdentityById = ReadonlyMap<
  string,
  ProductSourceReadModel
>;

@Injectable()
export class ProductOperationsRepositoryAdapter
implements ProductOperationsRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly inventorySkuRead: ProductSourceReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT)
    private readonly channelAccounts: ChannelAccountPort,
  ) {}

  async listDisplayMediaTargets(
    organizationId: string,
    masterProductIds: string[],
  ): Promise<ProductOperationsDisplayMediaTarget[]> {
    const ids = [...new Set(masterProductIds)];
    if (ids.length === 0) return [];
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        options: { some: { organizationId, inventoryComponents: { some: { organizationId, masterProductId: { in: ids } } } } },
        isActive: true,
        channelAccount: { is: { organizationId, status: 'active' } },
      },
      select: {
        id: true,
        externalId: true,
        options: { where: { organizationId }, select: { inventoryComponents: { where: { organizationId }, select: { masterProductId: true } } } },
        channelAccount: { select: { isPrimary: true } },

      },
    });
    return rows.map((row) => ({ ...row, masterProductId: listingProductIdFromRecipes(row.options) }))
      .flatMap((row) => row.masterProductId && ids.includes(row.masterProductId)
      ? [{
        masterProductId: row.masterProductId,
        channelListingId: row.id,

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
    const { sellingMasterProductIds, sellingChannelProducts, rows, inventoryIdentities, adByListing, traffic, adCoverage, orders, orderLines } =
      await this.prisma.$transaction(async (tx) => {
        const sellingMasterProductIds = await listSellingMasterProductIds(
          tx,
          organizationId,
          undefined,
          this.inventoryTransactionalRead,
        );
        const sellingChannelProducts = await this.listSellingChannelProducts(tx, organizationId);
        const rows = await attachChannelListings(tx, organizationId, await tx.masterProduct.findMany({
          where: productListWhere(organizationId, query, sellingMasterProductIds),
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        }));
        const inventoryIdentities = await this.readInventoryIdentitiesInTransaction(
          tx,
          organizationId,
          rows,
        );
        // The ad window keeps the period length but ends at the ad evidence
        // cutoff: yesterday, unless every account held yesterday as unreported.
        const adCutoff = await readAdEvidenceCutoff(tx, { organizationId, closedDay: cutoff }, this.channelAccounts);
        const adPeriodStart = addDays(adCutoff, -(query.periodDays - 1));
        const adPeriodEnd = addDays(adCutoff, 1);
        const adByListing = await readListingAdWindowFacts(tx, { organizationId, from: adPeriodStart, to: adPeriodEnd }, this.channelAccounts);
        const adWindow = await readAdWindowFacts(tx, { organizationId, from: adPeriodStart, to: adPeriodEnd }, this.channelAccounts);
        const applies = await advertisingApplies(tx, organizationId, this.channelAccounts);
        const adCoverage = {
          ready: !applies || adWindow.days.length === query.periodDays,
          coverageStartDate: businessDateKey(adPeriodStart),
          coverageEndDate: businessDateKey(adCutoff),
          capturedAt: adWindow.observedAt,
        };
        const traffic = await readListingTrafficWindowFacts(tx, {
          organizationId, from: periodStart, to: periodEnd,
          listingIds: rows.flatMap((row) => row.channelListings.map((listing) => listing.id)),
        });
        const orderWindow = { organizationId, from: kstDayStart(periodStart), to: kstDayStart(periodEnd) };
        const orders = await readOrderWindowFacts(tx, orderWindow, this.channelAccounts);
        const orderLines = await readListingOptionOrderFacts(tx, orderWindow);
        return {
          sellingMasterProductIds,
          sellingChannelProducts,
          rows,
          inventoryIdentities,
          adByListing,
          traffic,
          adCoverage,
          orders,
          orderLines,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const sellingMasterProductIdSet = new Set(sellingMasterProductIds);
    const inventorySkuById = new Map(inventoryIdentities.map((identity) => [
      identity.masterProductId,
      identity,
    ]));
    // The reader also returns rows on refused dates; only covered days count.
    const trafficDates = new Set(traffic.coverage.includedDates);
    const trafficByListing = new Map<string, ListingTrafficDailyFact[]>();
    for (const fact of traffic.rows) {
      if (!trafficDates.has(fact.businessDate)) continue;
      const facts = trafficByListing.get(fact.listingId) ?? [];
      facts.push(fact);
      trafficByListing.set(fact.listingId, facts);
    }
    const adFactsByListing = new Map(adByListing.map((facts) => [facts.listingId, facts]));
    // Views and cart adds sum the days Wing traffic covered. The basis carries
    // those days, and every reader derives the status word from it.
    const trafficCoverage = {
      capturedAt: traffic.latestObservedAt,
      basis: buildPeriodBasis({
        from: businessDateKey(periodStart),
        to: businessDateKey(cutoff),
        includedDates: traffic.coverage.includedDates,
        invalidDates: traffic.coverage.invalidDates,
        sources: [WING_TRAFFIC_SOURCE],
      }),
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
        inventorySkuById,
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
    const row = await this.prisma.$transaction(async (tx) => {
      const product = await tx.masterProduct.findFirst({ where: { id: masterProductId, organizationId } });
      return product ? (await attachChannelListings(tx, organizationId, [product]))[0] : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (!row) throw new ProductStateException('NOT_FOUND', 'MasterProduct was not found');
    const inventoryIdentities = await this.readInventoryIdentities(
      organizationId,
      [row],
    );
    return toDetail(row, new Map(inventoryIdentities.map((identity) => [
      identity.masterProductId,
      identity,
    ])));
  }

  async correctSourceBinding(organizationId: string, masterProductId: string, change: ProductSourceChange): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockProductMapping(tx, organizationId);
        await lockProductSource(tx, organizationId);
        const product = await tx.masterProduct.findFirst({ where: { id: masterProductId, organizationId } });
        if (!product) throw new ProductStateException('NOT_FOUND', 'MasterProduct was not found');
        const state = await tx.sellpiaInventoryState.findUnique({ where: { organizationId } });
        if (state?.activeGeneration !== null && state?.activeGeneration !== undefined) {
          throw new ProductStateException('SOURCE_CONFLICT', 'Source codes cannot change during collection.');
        }
        if (product.sourceProductCode === change.sourceProductCode && product.sourceOptionCode === change.sourceOptionCode) return;
        await tx.masterProduct.updateMany({ where: { id: masterProductId, organizationId }, data: change });
        await advanceProductMappingGeneration(tx, organizationId);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProductStateException('SOURCE_CONFLICT', 'The source identity already belongs to another product.');
      }
      throw error;
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
        data: input,
      });
      if (result.count === 0) throw new ProductStateException('NOT_FOUND', 'MasterProduct was not found');
      return this.getProduct(organizationId, masterProductId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  private async readInventoryIdentitiesInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    rows: ProductRow[],
  ): Promise<ProductSourceReadModel[]> {
    const ids = collectInventorySkuIds(rows);
    if (ids.length === 0) return [];
    return this.inventoryTransactionalRead.readSourceIdentities(
      { client: tx },
      { organizationId, selector: { kind: 'ids', values: ids } },
    );
  }

  private async readInventoryIdentities(
    organizationId: string,
    rows: ProductRow[],
  ): Promise<ProductSourceReadModel[]> {
    const ids = collectInventorySkuIds(rows);
    if (ids.length === 0) return [];
    return this.inventorySkuRead.findByIds(organizationId, ids);
  }

}

function compareDisplayMediaTargets(
  left: ProductOperationsDisplayMediaTarget,
  right: ProductOperationsDisplayMediaTarget,
): number {
  return left.masterProductId.localeCompare(right.masterProductId)
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
    ...(query.activeStatus === 'active' ? { id: { in: [...sellingMasterProductIds] } } : {}),
    ...(query.activeStatus === 'inactive' ? { id: { notIn: [...sellingMasterProductIds] } } : {}),
    ...(search ? {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { optionName: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  };
}

function toDetail(
  row: ProductRow,
  inventorySkuById: InventorySkuIdentityById,
): ProductOperationsRepositoryDetail {
  return {
    ...metadata(row),
    inventorySkuIds: [row.id],
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
      options: listing.options.map((option) => toRepositoryOption(option, inventorySkuById)),
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
  inventorySkuById: InventorySkuIdentityById,
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
  const listedOnWing = row.channelListings.some(
    (listing) => listing.isActive
      && listing.channelAccount.channel === 'coupang'
      && listing.channelAccount.status === 'active',
  );
  const trafficStatus = periodBasisStatus(trafficCoverage.basis);
  // Wing listing projections carry option/page visitors, not account UV.
  // Product Hub may retain explicitly uploaded listing visitors, but never
  // presents a sum of Wing option projections as unique visitors. Visitors
  // stay a whole-window value, summed only when every day is covered.
  const visitorCount = listedOnWing && trafficStatus === 'complete'
    ? nullableTrafficMetricSum(csvTrafficFacts, (fact) => fact.visitors)
    : null;
  // Views and cart adds sum the covered days. A covered day measures a listing
  // only through its row; a product with none has unmeasured traffic, not zero.
  const viewCount = listedOnWing && trafficStatus !== 'empty'
    ? nullableTrafficMetricSum(trafficFacts, (fact) => fact.views)
    : null;
  const cartAddCount = listedOnWing && trafficStatus !== 'empty'
    ? nullableTrafficMetricSum(trafficFacts, (fact) => fact.cartAdds)
    : null;
  const optionIds = new Set(row.channelListings.flatMap((listing) => listing.options.map(({ id }) => id)));
  const productOrders = orderLines.filter((line) => optionIds.has(line.listingOptionId));
  const orderCount = orderCoverage.ready ? new Set(productOrders.map(({ orderId }) => orderId)).size : null;
  const salesQuantity = orderCoverage.ready ? productOrders.reduce((sum, line) => sum + line.quantity, 0) : null;
  const salesAmount = orderCoverage.ready ? productOrders.reduce((sum, line) => sum + line.revenue, 0) : null;
  const adSpend = adCoverage.ready
    ? advertisingFacts.reduce((total, fact) => total + fact.spend, 0)
    : null;
  // A rate over two measurements needs identical dates (ADR-0006): while the ad
  // window ends at an earlier evidence cutoff, the rate is unavailable.
  const adAndSalesShareDates = adCoverage.coverageStartDate === orderCoverage.coverageStartDate
    && adCoverage.coverageEndDate === orderCoverage.coverageEndDate;
  return {
    ...metadata(row),
    abcCreatedAt: row.createdAt,
    isSelling,
    updatedAt: row.updatedAt,
    inventorySkuIds: [row.id],
    activeChannelProducts: activeListings.map((listing) => ({
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      channelAccountName: listing.channelAccount.name,
    })),
    inventoryOptions: activeListings.flatMap((listing) =>
      listing.options.map((option) => toRepositoryOption(option, inventorySkuById))),
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
    adSpendRate: adSpend !== null && salesAmount !== null && salesAmount > 0 && adAndSalesShareDates
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
    displayReference: { type: 'product_code' as const, label: '상품 코드', value: row.code },
    name: row.name,
    imageUrls: row.imageUrls,
  };
}


function toRepositoryOption(
  option: ProductRow['channelListings'][number]['options'][number],
  inventorySkuById: InventorySkuIdentityById,
) {
  return {
    id: option.id,
    externalOptionId: option.externalOptionId,
    itemName: option.itemName,
    sellerSku: option.sellerSku,
    barcode: option.barcode,
    status: option.status,
    isActive: option.isActive,
    inventoryComponents: option.inventoryComponents.map((component) => {
      const sku = inventorySkuById.get(component.masterProductId);
      return {
        id: component.id,
        masterProductId: component.masterProductId,
        code: sku?.code ?? null,
        name: sku?.name ?? null,
        optionName: sku?.optionName ?? null,
        barcode: sku?.barcode ?? null,
        quantity: component.quantity,
      };
    }),
  };
}

function collectInventorySkuIds(rows: readonly ProductRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.channelListings.flatMap((listing) =>
    listing.options.flatMap((option) => option.inventoryComponents.map(
      (component) => component.masterProductId,
    )))))].sort();
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
