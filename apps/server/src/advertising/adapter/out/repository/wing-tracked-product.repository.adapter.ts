// Coupang Wing 카탈로그 상품 추적 persistence adapter.
//
// Tracker mutations use `(id, organizationId)` predicate + tenant-scoped
// re-read so a cross-tenant id never leaks (keyword-rank adapter pattern).
// Snapshots are idempotent on `(trackedProductId, businessDate)` with
// latest-capture-wins overwrite; ingest matches trackers by
// `(organizationId, productId)` and skips unmatched inputs.

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UpsertWingSnapshotByProductIdInput,
  UpsertWingTrackedProductInput,
  WingTrackedProductRepositoryPort,
  WingTrackedProductRow,
  WingTrackedProductWithLatest,
  WingTrackedSnapshotRow,
} from '../../../application/port/out/repository/wing-tracked-product.repository.port';

@Injectable()
export class WingTrackedProductRepositoryAdapter
  implements WingTrackedProductRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<WingTrackedProductWithLatest[]> {
    const rows = await this.prisma.coupangWingTrackedProduct.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        snapshots: { orderBy: { businessDate: 'desc' }, take: 1 },
      },
    });
    return rows.map((row) => ({
      ...toTrackerRow(row),
      latestSnapshot: row.snapshots[0] ? toSnapshotRow(row.snapshots[0]) : null,
    }));
  }

  async upsertByProductId(
    input: UpsertWingTrackedProductInput,
    organizationId: string,
  ): Promise<WingTrackedProductRow> {
    const row = await this.prisma.coupangWingTrackedProduct.upsert({
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
        ...(input.categoryHierarchy !== undefined
          ? { categoryHierarchy: input.categoryHierarchy }
          : {}),
        ...(input.sourceKeyword !== undefined ? { sourceKeyword: input.sourceKeyword } : {}),
      },
    });
    return toTrackerRow(row);
  }

  async delete(id: string, organizationId: string): Promise<WingTrackedProductRow> {
    const existing = await this.findByIdOrThrow(id, organizationId);
    await this.prisma.coupangWingTrackedProduct.deleteMany({
      where: { id, organizationId },
    });
    return existing;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<WingTrackedProductRow | null> {
    const row = await this.prisma.coupangWingTrackedProduct.findFirst({
      where: { id, organizationId },
    });
    return row ? toTrackerRow(row) : null;
  }

  async upsertSnapshotsByProductId(
    rows: UpsertWingSnapshotByProductIdInput[],
    organizationId: string,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const trackers = await this.prisma.coupangWingTrackedProduct.findMany({
      where: { organizationId, productId: { in: productIds } },
      select: { id: true, productId: true },
    });
    const trackerByProductId = new Map(trackers.map((t) => [t.productId, t.id]));
    if (trackerByProductId.size === 0) return 0;

    const touchedTrackerIds = new Set<string>();
    let processed = 0;
    for (const row of rows) {
      const trackedProductId = trackerByProductId.get(row.productId);
      if (!trackedProductId) continue;
      await this.prisma.coupangWingTrackedProductDailySnapshot.upsert({
        where: {
          trackedProductId_businessDate: {
            trackedProductId,
            businessDate: row.businessDate,
          },
        },
        create: {
          organizationId,
          trackedProductId,
          businessDate: row.businessDate,
          ...snapshotWriteValues(row),
          sourceKeyword: row.sourceKeyword,
          capturedAt: row.capturedAt,
        },
        update: {
          ...snapshotWriteValues(row),
          sourceKeyword: row.sourceKeyword,
          capturedAt: row.capturedAt,
        },
      });
      touchedTrackerIds.add(trackedProductId);
      processed += 1;
    }

    if (touchedTrackerIds.size > 0) {
      const capturedAt = rows[0].capturedAt;
      await this.prisma.coupangWingTrackedProduct.updateMany({
        where: { id: { in: [...touchedTrackerIds] }, organizationId },
        data: { lastCapturedAt: capturedAt },
      });
    }
    return processed;
  }

  async findHistory(
    id: string,
    organizationId: string,
    days: number,
  ): Promise<WingTrackedSnapshotRow[]> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
    const rows = await this.prisma.coupangWingTrackedProductDailySnapshot.findMany({
      where: {
        trackedProductId: id,
        organizationId,
        businessDate: { gte: startOfUtcDay(cutoff) },
      },
      orderBy: { businessDate: 'asc' },
    });
    return rows.map(toSnapshotRow);
  }

  private async findByIdOrThrow(
    id: string,
    organizationId: string,
  ): Promise<WingTrackedProductRow> {
    const row = await this.findById(id, organizationId);
    if (!row) throw new NotFoundException('Wing tracked product not found');
    return row;
  }
}

type PrismaTrackerRow = Prisma.CoupangWingTrackedProductGetPayload<Record<string, never>>;
type PrismaSnapshotRow = Prisma.CoupangWingTrackedProductDailySnapshotGetPayload<
  Record<string, never>
>;

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
    ratingAverage: toNumber(row.ratingAverage),
    pvLast28Day: row.pvLast28Day,
    salesLast28d: row.salesLast28d,
    estimatedRevenue28d: row.estimatedRevenue28d,
    conversionRate28d: toNumber(row.conversionRate28d),
    capturedAt: row.capturedAt,
  };
}

function snapshotWriteValues(row: UpsertWingSnapshotByProductIdInput) {
  // Int 컬럼은 정수만 허용하므로 반올림(프론트가 float 를 보내도 방어).
  // ratingAverage/conversionRate28d 는 Decimal 이라 그대로 둔다.
  return {
    salePriceKrw: roundOrNull(row.salePriceKrw),
    ratingCount: roundOrNull(row.ratingCount),
    ratingAverage: row.ratingAverage,
    pvLast28Day: roundOrNull(row.pvLast28Day),
    salesLast28d: roundOrNull(row.salesLast28d),
    estimatedRevenue28d: roundOrNull(row.estimatedRevenue28d),
    conversionRate28d: row.conversionRate28d,
  };
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

function toNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
