import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { currentBusinessDate } from '../../../domain/business-date';
import { upsertWingTrackedProductSnapshots } from './wing-tracked-product-snapshot.persistence';
import { lockWingTrackedProductsSource } from './wing-tracked-product-source-lock';
import type { Prisma } from '@prisma/client';
import type {
  UpsertWingTrackedProductInput,
  WingTrackedHistory,
  WingTrackedProductRepositoryPort,
  WingTrackedProductRow,
  WingTrackedProductWithLatest,
  WingTrackedSnapshotRow,
} from '../../../application/port/out/repository/wing-tracked-product.repository.port';

/** Organization-scoped tracker CRUD and snapshot reads. */
@Injectable()
export class WingTrackedProductRepositoryAdapter implements WingTrackedProductRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<WingTrackedProductWithLatest[]> {
    const rows = await this.prisma.coupangWingTrackedProduct.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { snapshots: { orderBy: { businessDate: 'desc' }, take: 1 } },
    });
    return rows.map((row) => ({
      ...toTrackerRow(row),
      latestSnapshot: row.snapshots[0] ? toSnapshotRow(row.snapshots[0]) : null,
    }));
  }

  async registerWithInitialSnapshot(
    input: UpsertWingTrackedProductInput & WingTrackedSnapshotValues,
    organizationId: string,
  ): Promise<WingTrackedProductRow> {
    const capturedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      await lockWingTrackedProductsSource(tx, organizationId);
      const row = await tx.coupangWingTrackedProduct.upsert({
        where: { organizationId_productId: { organizationId, productId: input.productId } },
        create: {
          organizationId,
          productId: input.productId,
          itemId: input.itemId ?? null,
          vendorItemId: input.vendorItemId ?? null,
          productName: input.productName,
          imagePath: input.imagePath ?? null,
          brandName: input.brandName ?? null,
          categoryHierarchy: input.categoryHierarchy ?? null,
          sourceKeyword: input.sourceKeyword ?? null,
          enabled: true,
        },
        update: {
          enabled: true,
          productName: input.productName,
          ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
          ...(input.vendorItemId !== undefined ? { vendorItemId: input.vendorItemId } : {}),
          ...(input.imagePath !== undefined ? { imagePath: input.imagePath } : {}),
          ...(input.brandName !== undefined ? { brandName: input.brandName } : {}),
          ...(input.categoryHierarchy !== undefined ? { categoryHierarchy: input.categoryHierarchy } : {}),
          ...(input.sourceKeyword !== undefined ? { sourceKeyword: input.sourceKeyword } : {}),
        },
      });
      const stored = await upsertWingTrackedProductSnapshots(tx, [{
        productId: input.productId,
        businessDate: currentBusinessDate(capturedAt),
        sourceKeyword: input.sourceKeyword ?? row.sourceKeyword,
        capturedAt,
        salePriceKrw: input.salePriceKrw,
        ratingCount: input.ratingCount,
        ratingAverage: input.ratingAverage,
        pvLast28Day: input.pvLast28Day,
        salesLast28d: input.salesLast28d,
        estimatedRevenue28d: input.estimatedRevenue28d,
        conversionRate28d: input.conversionRate28d,
      }], organizationId);
      if (stored.captured !== 1) {
        throw new ConflictException('WING_TRACKED_INITIAL_SNAPSHOT_NOT_WRITTEN');
      }
      return { ...toTrackerRow(row), lastCapturedAt: capturedAt };
    }, trackerMutationTransactionOptions());
  }

  async delete(id: string, organizationId: string): Promise<WingTrackedProductRow> {
    return this.prisma.$transaction(async (tx) => {
      await lockWingTrackedProductsSource(tx, organizationId);
      const existing = await tx.coupangWingTrackedProduct.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException('Wing tracked product not found');
      const deleted = await tx.coupangWingTrackedProduct.deleteMany({ where: { id, organizationId } });
      if (deleted.count !== 1) throw new ConflictException('WING_TRACKED_TARGET_CHANGED');
      return toTrackerRow(existing);
    }, trackerMutationTransactionOptions());
  }

  async findById(id: string, organizationId: string): Promise<WingTrackedProductRow | null> {
    const row = await this.prisma.coupangWingTrackedProduct.findFirst({ where: { id, organizationId } });
    return row ? toTrackerRow(row) : null;
  }

  async findHistory(
    id: string,
    organizationId: string,
    days: number,
  ): Promise<WingTrackedSnapshotRow[]> {
    const rows = await this.prisma.coupangWingTrackedProductDailySnapshot.findMany({
      where: { trackedProductId: id, organizationId, businessDate: { gte: historyCutoff(days) } },
      orderBy: { businessDate: 'asc' },
    });
    return rows.map(toSnapshotRow);
  }

  async findBulkHistory(organizationId: string, days: number): Promise<WingTrackedHistory[]> {
    const rows = await this.prisma.coupangWingTrackedProductDailySnapshot.findMany({
      where: { organizationId, businessDate: { gte: historyCutoff(days) } },
      orderBy: [{ trackedProductId: 'asc' }, { businessDate: 'asc' }],
      include: { trackedProduct: { select: { productName: true } } },
    });
    const histories = new Map<string, WingTrackedHistory>();
    for (const row of rows) {
      const existing = histories.get(row.trackedProductId);
      if (existing) {
        existing.points.push(toSnapshotRow(row));
        continue;
      }
      histories.set(row.trackedProductId, {
        trackedProductId: row.trackedProductId,
        productName: row.trackedProduct.productName,
        points: [toSnapshotRow(row)],
      });
    }
    return [...histories.values()];
  }

}

type PrismaTrackerRow = Prisma.CoupangWingTrackedProductGetPayload<Record<string, never>>;
type PrismaSnapshotRow = Prisma.CoupangWingTrackedProductDailySnapshotGetPayload<Record<string, never>>;

function toTrackerRow(row: PrismaTrackerRow): WingTrackedProductRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    itemId: row.itemId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
    imagePath: row.imagePath,
    brandName: row.brandName,
    categoryHierarchy: row.categoryHierarchy,
    sourceKeyword: row.sourceKeyword,
    enabled: row.enabled,
    lastCapturedAt: row.lastCapturedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSnapshotRow(row: PrismaSnapshotRow): WingTrackedSnapshotRow {
  return {
    trackedProductId: row.trackedProductId,
    businessDate: row.businessDate,
    salePriceKrw: row.salePriceKrw,
    ratingCount: row.ratingCount,
    ratingAverage: row.ratingAverage == null ? null : Number(row.ratingAverage),
    pvLast28Day: row.pvLast28Day,
    salesLast28d: row.salesLast28d,
    estimatedRevenue28d: row.estimatedRevenue28d,
    conversionRate28d: row.conversionRate28d == null ? null : Number(row.conversionRate28d),
    capturedAt: row.capturedAt,
  };
}

function historyCutoff(days: number): Date {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  return new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate()));
}

function trackerMutationTransactionOptions() {
  return {
    timeout: 30_000,
    maxWait: 10_000,
    isolationLevel: 'ReadCommitted' as const,
  };
}
