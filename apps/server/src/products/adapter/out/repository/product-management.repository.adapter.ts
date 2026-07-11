import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../../common/per-listing-profit';
import type {
  ActiveAdTargetRow,
  GradeMasterRow,
  ManagementCandidateRow,
  ManagementListingRow,
  ManagementOptionRow,
  MetricSums,
  PerListingProfitMetric,
  ProductManagementMasterWhereInput,
  ProductManagementRepositoryPort,
  ReviewSnapshotRow,
  StatusListingRow,
  StoredGradeMasterRow,
} from '../../../application/port/out/repository/product-management.repository.port';
import type { MasterWithImageRows } from '../../../application/port/out/repository/master-product.repository.port';
import { MASTER_WITH_IMAGES } from './master-product.query';
import { buildProductManagementMasterWhere } from './product-management.filters';

function hasMasterId<T extends { masterId: string | null }>(
  row: T,
): row is T & { masterId: string } {
  return row.masterId !== null;
}

@Injectable()
export class ProductManagementRepositoryAdapter implements ProductManagementRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  countMasters(input: ProductManagementMasterWhereInput): Promise<number> {
    return this.prisma.masterProduct.count({ where: this.masterWhere(input) });
  }

  findManagementCandidates(input: ProductManagementMasterWhereInput): Promise<ManagementCandidateRow[]> {
    return this.prisma.masterProduct.findMany({
      where: this.masterWhere(input),
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findMastersByIds(organizationId: string, orderedIds: string[]): Promise<MasterWithImageRows[]> {
    if (orderedIds.length === 0) return [];
    const rows = await this.prisma.masterProduct.findMany({
      where: { organizationId, id: { in: orderedIds } },
      include: MASTER_WITH_IMAGES,
    }) as MasterWithImageRows[];
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async findPipelineMasterIds(input: ProductManagementMasterWhereInput): Promise<string[]> {
    const rows = await this.prisma.masterProduct.findMany({
      where: this.masterWhere(input),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findAllMasterIds(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isDeleted: false,
        listings: { some: { organizationId, isDeleted: false } },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findChannelLinkedMasterIds(organizationId: string, masterIds: string[]): Promise<string[]> {
    if (masterIds.length === 0) return [];
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        masterId: { in: masterIds, not: null },
        isDeleted: false,
      },
      select: { masterId: true },
    });
    return rows.filter(hasMasterId).map((row) => row.masterId);
  }

  async findStatusListingRows(organizationId: string, masterIds?: string[]): Promise<StatusListingRow[]> {
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        isDeleted: false,
        masterId: masterIds
          ? { in: masterIds, not: null }
          : { not: null },
      },
      select: { masterId: true, status: true, exposureStatus: true },
    });
    return rows.filter(hasMasterId);
  }

  findManagementOptionRows(organizationId: string, masterIds: string[]): Promise<ManagementOptionRow[]> {
    return this.prisma.productOption.findMany({
      where: { organizationId, masterId: { in: masterIds }, isDeleted: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        masterId: true,
        sku: true,
        costPrice: true,
        sellPrice: true,
        commissionRate: true,
        shippingCost: true,
      },
    }) as unknown as Promise<ManagementOptionRow[]>;
  }

  async findManagementListingRows(organizationId: string, masterIds: string[]): Promise<ManagementListingRow[]> {
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        masterId: { in: masterIds, not: null },
        isDeleted: false,
      },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        masterId: true,
        externalId: true,
        channelName: true,
        channelPrice: true,
      },
    });
    return rows.filter(hasMasterId);
  }

  async groupMetricsByListing(
    organizationId: string,
    listingIds: string[],
    gte: Date,
    lt?: Date,
  ): Promise<Map<string, MetricSums>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: {
        organizationId,
        listingId: { in: listingIds },
        businessDate: { gte, ...(lt ? { lt } : {}) },
      },
      _sum: {
        trafficVisitors: true,
        trafficViews: true,
        trafficCartAdds: true,
        trafficOrders: true,
        trafficSalesQty: true,
        trafficRevenue: true,
        adSpend: true,
        adImpressions: true,
        adClicks: true,
      },
    });
    const map = new Map<string, MetricSums>();
    for (const row of rows) {
      map.set(row.listingId, {
        visitors: row._sum.trafficVisitors ?? 0,
        views: row._sum.trafficViews ?? 0,
        cartAdds: row._sum.trafficCartAdds ?? 0,
        orders: row._sum.trafficOrders ?? 0,
        salesQty: row._sum.trafficSalesQty ?? 0,
        revenue: row._sum.trafficRevenue ?? 0,
        adSpend: row._sum.adSpend ?? 0,
        adImpressions: row._sum.adImpressions ?? 0,
        adClicks: row._sum.adClicks ?? 0,
      });
    }
    return map;
  }

  findReviewSnapshotRows(organizationId: string, listingIds: string[]): Promise<ReviewSnapshotRow[]> {
    if (listingIds.length === 0) return Promise.resolve([]);
    return this.prisma.channelListingDailySnapshot.findMany({
      where: { organizationId, listingId: { in: listingIds } },
      orderBy: [{ listingId: 'asc' }, { businessDate: 'desc' }],
      select: { listingId: true, reviewCount: true },
    });
  }

  async findLatestTargetAdBusinessDate(organizationId: string): Promise<Date | null> {
    const row = await this.prisma.channelAdTargetDailySnapshot.findFirst({
      where: { organizationId, targetType: 'product' },
      orderBy: { businessDate: 'desc' },
      select: { businessDate: true },
    });
    return row?.businessDate ?? null;
  }

  async findLatestListingAdBusinessDate(organizationId: string): Promise<Date | null> {
    const row = await this.prisma.channelListingDailySnapshot.findFirst({
      where: {
        organizationId,
        OR: [
          { adSpend: { gt: 0 } },
          { adRevenue: { gt: 0 } },
          { adClicks: { gt: 0 } },
          { adImpressions: { gt: 0 } },
        ],
      },
      orderBy: { businessDate: 'desc' },
      select: { businessDate: true },
    });
    return row?.businessDate ?? null;
  }

  findActiveAdTargetRows(organizationId: string, businessDate: Date): Promise<ActiveAdTargetRow[]> {
    return this.prisma.channelAdTargetDailySnapshot.findMany({
      where: { organizationId, targetType: 'product', businessDate },
      select: {
        listingId: true,
        optionId: true,
        onOff: true,
        status: true,
        spend: true,
        adSpend: true,
        revenue: true,
        adRevenue: true,
        clicks: true,
        impressions: true,
      },
    });
  }

  async findListingAdListingIds(organizationId: string, businessDate: Date): Promise<string[]> {
    const rows = await this.prisma.channelListingDailySnapshot.findMany({
      where: {
        organizationId,
        businessDate,
        OR: [
          { adSpend: { gt: 0 } },
          { adRevenue: { gt: 0 } },
          { adClicks: { gt: 0 } },
          { adImpressions: { gt: 0 } },
        ],
      },
      select: { listingId: true },
    });
    return rows.map((row) => row.listingId);
  }

  async findMasterIdsForListings(
    organizationId: string,
    listingIds: string[],
    masterIds?: string[],
  ): Promise<string[]> {
    if (listingIds.length === 0) return [];
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        id: { in: listingIds },
        isDeleted: false,
        masterId: masterIds
          ? { in: masterIds, not: null }
          : { not: null },
      },
      select: { masterId: true },
    });
    return listings.filter(hasMasterId).map((listing) => listing.masterId);
  }

  async findMasterIdsForOptions(
    organizationId: string,
    optionIds: string[],
    masterIds?: string[],
  ): Promise<string[]> {
    if (optionIds.length === 0) return [];
    const options = await this.prisma.productOption.findMany({
      where: {
        organizationId,
        id: { in: optionIds },
        isDeleted: false,
        ...(masterIds ? { masterId: { in: masterIds } } : {}),
      },
      select: { masterId: true },
    });
    return options.map((option) => option.masterId);
  }

  async buildPerListingProfitMetrics(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<PerListingProfitMetric[]> {
    const metrics = await buildPerListingMetrics(this.prisma, organizationId, from, to);
    return metrics.map((metric) => ({
      masterId: metric.masterId,
      revenue: metric.revenue,
      netProfit: metric.netProfit,
      orderCount: metric.orderCount,
    }));
  }

  findGradeMasterRows(organizationId: string): Promise<GradeMasterRow[]> {
    return this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isDeleted: false,
        listings: { some: { organizationId, isDeleted: false } },
      },
      select: { id: true, createdAt: true },
    });
  }

  findStoredGradeMasters(organizationId: string, masterIds: string[]): Promise<StoredGradeMasterRow[]> {
    return this.prisma.masterProduct.findMany({
      where: { organizationId, id: { in: masterIds }, isDeleted: false },
      select: { id: true, name: true, abcGrade: true },
    });
  }

  async updateStoredGrade(input: {
    organizationId: string;
    masterId: string;
    currentGrade: string | null;
    nextGrade: 'A' | 'B' | 'C';
  }): Promise<number> {
    const updated = await this.prisma.masterProduct.updateMany({
      where: { id: input.masterId, organizationId: input.organizationId, abcGrade: input.currentGrade },
      data: { abcGrade: input.nextGrade },
    });
    return updated.count;
  }

  async updateStoredGradeAndAlert(input: {
    organizationId: string;
    masterId: string;
    masterName: string;
    currentGrade: 'A' | 'B' | 'C';
    nextGrade: 'A' | 'B' | 'C';
    severity: 'warning' | 'info';
  }): Promise<void> {
    await this.prisma.$transaction(async (client) => {
      const updated = await client.masterProduct.updateMany({
        where: {
          id: input.masterId,
          organizationId: input.organizationId,
          abcGrade: input.currentGrade,
        },
        data: { abcGrade: input.nextGrade },
      });
      if (updated.count === 0) return;

      await client.alert.create({
        data: {
          organizationId: input.organizationId,
          targetType: 'master',
          targetId: input.masterId,
          type: 'product_grade_change',
          severity: input.severity,
          title: `${input.masterName} ${input.currentGrade}->${input.nextGrade}`,
          message: `상품 등급이 ${input.currentGrade}등급에서 ${input.nextGrade}등급으로 변경되었습니다.`,
          isRead: false,
        },
      });
    });
  }

  private masterWhere(input: ProductManagementMasterWhereInput): Prisma.MasterProductWhereInput {
    return buildProductManagementMasterWhere(input.organizationId, input.query, input.matchingIds);
  }
}
