// Inventory-side read model for the dashboard. Encapsulates the Prisma
// reads behind the inventory tile: grade counts, unread alerts, active
// product counts, per-listing profit metrics (shared helper), inventory
// stock rows for the JS-side needReorder count, last-7d grade history,
// low-CTR thumbnail count, and A-grade master products with their
// channel-listing review counts.
//
// 2-hop joins (A-grade review fetch) bind organization on both
// MasterProduct and ChannelListing per ADR-0018 Rule 3.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../../../common/per-listing-profit';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import type {
  DashboardInventoryRepositoryPort,
  DashboardPerListingMetrics,
  GradeCountRow,
  InventoryStockRow,
  GradeChangeRow,
  AGradeReviewRow,
} from '../../../application/port/out/dashboard-inventory.repository.port';

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
      _count: true,
      where: {
        organizationId,
        isDeleted: false,
        abcGrade: { in: ['A', 'B', 'C'] },
        listings: { some: { organizationId, isDeleted: false } },
      },
    });
    return rows.map((r) => ({
      abcGrade: r.abcGrade,
      count: r._count,
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
      where: { organizationId, isDeleted: false },
    });
  }

  async countChannelLinkedProducts(organizationId: string): Promise<number> {
    return this.prisma.masterProduct.count({
      where: {
        organizationId,
        isDeleted: false,
        listings: { some: { organizationId, isDeleted: false } },
      },
    });
  }

  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DashboardPerListingMetrics[]> {
    return buildPerListingMetrics(this.prisma, organizationId, monthStart, monthEnd);
  }

  async findInventoryStockRows(
    organizationId: string,
  ): Promise<InventoryStockRow[]> {
    return this.prisma.inventory.findMany({
      where: { organizationId, currentStock: { gt: 0 } },
      select: { currentStock: true, reorderPoint: true },
    });
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
    // 2-hop IDOR (ADR-0018 Rule 3): master.organizationId +
    // listings.organizationId on the nested filter.
    const masters = await this.prisma.masterProduct.findMany({
      where: { organizationId, isDeleted: false, abcGrade: 'A' },
      include: {
        listings: {
          where: { organizationId },
          select: { _count: { select: { reviews: true } } },
        },
      },
    });
    return masters.map((m) => ({
      reviewCount: m.listings.reduce(
        (sum, l) => sum + l._count.reviews,
        0,
      ),
    } satisfies AGradeReviewRow));
  }
}
