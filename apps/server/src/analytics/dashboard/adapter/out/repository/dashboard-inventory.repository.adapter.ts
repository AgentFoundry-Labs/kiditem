// Inventory-side read model for the dashboard. Encapsulates the Prisma
// reads behind the inventory tile: grade counts, unread alerts, active
// product counts, per-listing profit metrics (shared helper), inventory
// Sellpia zero-stock and channel-SKU mapping-attention counts, last-7d grade history,
// low-CTR thumbnail count, and A-grade master products with their
// channel-listing review counts.
//
// 2-hop joins (A-grade review fetch) bind organization on both
// MasterProduct and ChannelListing both bind organizationId.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../../../common/per-listing-profit';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import type {
  DashboardInventoryRepositoryPort,
  DashboardPerListingMetrics,
  GradeCountRow,
  GradeChangeRow,
  AGradeReviewRow,
} from '../../../application/port/out/repository/dashboard-inventory.repository.port';

@Injectable()
export class DashboardInventoryRepositoryAdapter
  implements DashboardInventoryRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async countActiveProductsByGrade(
    organizationId: string,
  ): Promise<GradeCountRow[]> {
    const rows = await this.prisma.masterProduct.groupBy({
      by: ['abcGrade'],
      _count: { id: true },
      where: {
        organizationId,
        isActive: true,
        abcGrade: { in: ['A', 'B', 'C'] },
      },
    });
    return rows.map((r) => ({
      abcGrade: r.abcGrade,
      count: r._count.id,
    } satisfies GradeCountRow));
  }

  async findUnreadAlerts(
    organizationId: string,
    limit: number,
  ): Promise<DashboardAlertItem[]> {
    const rows = await this.prisma.alert.findMany({
      where: { organizationId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((a) => ({
      id: a.id,
      kind: a.kind as DashboardAlertItem['kind'],
      status: a.status as DashboardAlertItem['status'],
      type: a.type,
      severity: a.severity,
      title: a.title,
      message: a.message,
      operationKey: a.operationKey,
      sourceType: a.sourceType,
      href: a.href,
      progress: a.progress,
      targetType: a.targetType,
      targetId: a.targetId,
      isRead: a.isRead,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    } satisfies DashboardAlertItem));
  }

  async countActiveProducts(organizationId: string): Promise<number> {
    return this.prisma.masterProduct.count({
      where: { organizationId, isActive: true },
    });
  }

  async countChannelLinkedProducts(organizationId: string): Promise<number> {
    const linked = await this.prisma.channelListing.groupBy({
      by: ['masterProductId'],
      where: {
        organizationId,
        isActive: true,
        masterProductId: { not: null },
      },
    });
    return linked.length;
  }

  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DashboardPerListingMetrics[]> {
    return buildPerListingMetrics(this.prisma, organizationId, monthStart, monthEnd);
  }

  countOutOfStockMasterProducts(organizationId: string): Promise<number> {
    return this.prisma.sellpiaInventorySku.count({
      where: {
        organizationId,
        isActive: true,
        currentStock: 0,
      },
    });
  }

  countMappingAttentionChannelSkus(organizationId: string): Promise<number> {
    return this.prisma.channelListingOption.count({
      where: {
        organizationId,
        isActive: true,
        listing: { is: { organizationId, isActive: true } },
        OR: [
          { productVariantId: null },
          { listing: { is: { organizationId, masterProductId: null } } },
          { productVariant: { is: { isActive: false } } },
          { productVariant: { is: { components: { none: {} } } } },
          {
            productVariant: {
              is: {
                components: {
                  some: { sellpiaInventorySku: { is: { isActive: false } } },
                },
              },
            },
          },
        ],
      },
    });
  }

  async countChannelSkusByMappingStatus(
    organizationId: string,
  ): Promise<Array<{ mappingStatus: string; count: number }>> {
    const base = {
      organizationId,
      isActive: true,
      listing: { is: { organizationId, isActive: true } },
    } as const;
    const [unmatched, needsReview, total] = await Promise.all([
      this.prisma.channelListingOption.count({
        where: {
          ...base,
          OR: [
            { productVariantId: null },
            { listing: { is: { organizationId, masterProductId: null } } },
          ],
        },
      }),
      this.prisma.channelListingOption.count({
        where: {
          ...base,
          productVariantId: { not: null },
          listing: { is: { organizationId, isActive: true, masterProductId: { not: null } } },
          OR: [
            { productVariant: { is: { isActive: false } } },
            { productVariant: { is: { components: { none: {} } } } },
            {
              productVariant: {
                is: {
                  components: {
                    some: { sellpiaInventorySku: { is: { isActive: false } } },
                  },
                },
              },
            },
          ],
        },
      }),
      this.prisma.channelListingOption.count({ where: base }),
    ]);
    return [
      { mappingStatus: 'unmatched', count: unmatched },
      { mappingStatus: 'needs_review', count: needsReview },
      { mappingStatus: 'matched', count: Math.max(0, total - unmatched - needsReview) },
    ];
  }

  async findGradeHistory(
    organizationId: string,
    since: Date,
  ): Promise<GradeChangeRow[]> {
    return this.prisma.gradeHistory.findMany({
      where: { organizationId, calculatedAt: { gte: since } },
      select: { oldGrade: true, newGrade: true },
    });
  }

  async countLowCtrThumbnails(organizationId: string): Promise<number> {
    return this.prisma.thumbnail.count({
      where: { organizationId, ctr: { lt: 1.5, gt: 0 } },
    });
  }

  async findAGradeReviewCounts(
    organizationId: string,
  ): Promise<AGradeReviewRow[]> {
    // 2-hop tenant scope: master.organizationId +
    // listings.organizationId on the nested filter.
    const products = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isActive: true,
        abcGrade: 'A',
      },
      select: {
        channelListings: {
          where: { organizationId, isActive: true },
          select: { _count: { select: { reviews: true } } },
        },
      },
    });
    return products.map((product) => ({
      reviewCount: product.channelListings.reduce(
        (sum, listing) => sum + listing._count.reviews,
        0,
      ),
    } satisfies AGradeReviewRow));
  }
}
