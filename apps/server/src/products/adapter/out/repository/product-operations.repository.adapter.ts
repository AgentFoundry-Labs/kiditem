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
  classifyDailyTrafficFact,
  type DailyTrafficFactSource,
} from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import { productAbcEvaluation } from '../../../mapper/product-abc-evaluation.mapper';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
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

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

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
            adSpend: true,
            adCoverageStatus: true,
            adObservedAt: true,
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
    const periodStart = startOfUtcDay(
      new Date(Date.now() - (query.periodDays - 1) * 86_400_000),
    );
    const [sellingMasterProductIds, sellingChannelProducts] = await Promise.all([
      listSellingMasterProductIds(this.prisma, organizationId),
      this.listSellingChannelProducts(organizationId),
    ]);
    const sellingMasterProductIdSet = new Set(sellingMasterProductIds);
    const rows = await this.prisma.masterProduct.findMany({
      where: productListWhere(organizationId, query, sellingMasterProductIds),
      include: productInclude(organizationId, periodStart),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return {
      items: rows.map((row) => toListItem(
        row,
        periodStart,
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

  async replaceChannelOptionInventory(
    input: Parameters<ProductOperationsRepositoryPort['replaceChannelOptionInventory']>[0],
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockProductMapping(tx, input.organizationId);
        const option = await tx.channelListingOption.findFirst({
          where: { id: input.channelListingOptionId, organizationId: input.organizationId },
          select: {
            id: true,
            listingId: true,
            listing: { select: { masterProductId: true } },
            inventoryComponents: {
              where: { organizationId: input.organizationId },
              select: { sellpiaInventorySkuId: true, quantity: true },
            },
          },
        });
        if (!option) throw new NotFoundException('Channel listing option was not found');
        await validateRecipeSkus(tx, input.organizationId, input.components);
        const recipeChanged = !sameRecipe(option.inventoryComponents, input.components);
        if (recipeChanged) {
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
        }
        const masterProductId = await resolveListingMasterProductId(
          tx,
          input.organizationId,
          option.listingId,
        );
        const listingChanged = option.listing.masterProductId !== masterProductId;
        if (listingChanged) {
          const updated = await tx.channelListing.updateMany({
            where: { id: option.listingId, organizationId: input.organizationId },
            data: { masterProductId },
          });
          if (updated.count !== 1) throw new NotFoundException('Channel listing was not found');
        }
        if (recipeChanged || listingChanged) {
          await advanceProductMappingGeneration(tx, input.organizationId);
        }
        return { masterProductId };
      }, TRANSACTION_OPTIONS);
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

function sameRecipe(
  current: readonly { sellpiaInventorySkuId: string; quantity: number }[],
  replacement: readonly { sellpiaInventorySkuId: string; quantity: number }[],
): boolean {
  if (current.length !== replacement.length) return false;
  const currentBySku = new Map(current.map((component) => [
    component.sellpiaInventorySkuId,
    component.quantity,
  ]));
  return replacement.every((component) =>
    currentBySku.get(component.sellpiaInventorySkuId) === component.quantity,
  );
}

async function validateActiveRecipeSkuIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const rows = await tx.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, isActive: true, masterProductId: true },
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
  if (ids.some((id) => !byId.get(id)?.masterProductId)) {
    throw new BadRequestException(
      'SellpiaInventorySku canonical MasterProduct must be synchronized before matching',
    );
  }
}

async function resolveListingMasterProductId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelListingId: string,
): Promise<string | null> {
  const listing = await tx.channelListing.findFirst({
    where: { id: channelListingId, organizationId },
    select: {
      options: {
        where: { organizationId },
        select: {
          inventoryComponents: {
            where: { organizationId },
            select: {
              sellpiaInventorySku: { select: { masterProductId: true } },
            },
          },
        },
      },
    },
  });
  if (!listing || listing.options.length === 0) return null;
  const ownerIds = new Set<string>();
  for (const option of listing.options) {
    if (option.inventoryComponents.length === 0) return null;
    for (const component of option.inventoryComponents) {
      const ownerId = component.sellpiaInventorySku.masterProductId;
      if (!ownerId) return null;
      ownerIds.add(ownerId);
    }
  }
  return ownerIds.size === 1 ? [...ownerIds][0]! : null;
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
  periodStart: Date,
  isSelling: boolean,
): ProductOperationsRepositoryListItem {
  const activeListings = row.channelListings.filter((listing) => listing.isActive);
  const dailyFacts = row.channelListings.flatMap(
    (listing) => listing.channelListingDailySnapshots,
  );
  const trafficFacts = dailyFacts.filter(isAcceptedTrafficFact);
  const advertisingFacts = dailyFacts.filter(hasAdvertisingEvidence);
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
  const adSpend = nullableSum(advertisingFacts, (fact) => fact.adSpend);
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
      traffic: dailyMetricFreshness(trafficFacts, 'traffic'),
      advertising: dailyMetricFreshness(advertisingFacts, 'advertising'),
    },
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
      ready: false,
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
    ready: calendarDate(coverageEnd) >= yesterdayKst,
    coverageStartDate: calendarDate(coverageStart),
    coverageEndDate: calendarDate(coverageEnd),
    capturedAt,
  };
}

type ProductTrafficFact = ProductRow['channelListings'][number]['channelListingDailySnapshots'][number];

function trafficFactSource(fact: ProductTrafficFact): DailyTrafficFactSource | null {
  return classifyDailyTrafficFact(fact.metaJson, calendarDate(fact.businessDate));
}

function isAcceptedTrafficFact(fact: ProductTrafficFact): boolean {
  return trafficFactSource(fact) !== null;
}

function hasAdvertisingEvidence(
  fact: ProductRow['channelListings'][number]['channelListingDailySnapshots'][number],
): boolean {
  return fact.adCoverageStatus !== null || fact.adSpend !== 0;
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

function nullableTrafficMetricSum<T>(
  rows: readonly T[],
  value: (row: T) => number,
): number | null {
  return nullableSum(rows, value);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
