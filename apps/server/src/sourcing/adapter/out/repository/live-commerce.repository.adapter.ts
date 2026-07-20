import { Injectable } from '@nestjs/common';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  LiveCommerceBroadcastSnapshotRow,
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotRow,
  LiveCommerceProductSnapshotUpsert,
  LiveCommerceRepositoryPort,
  LiveCommerceSnapshotQuery,
} from '../../../application/port/out/repository/live-commerce.repository.port';

const INT4_MAX = 2_147_483_647;

@Injectable()
export class LiveCommerceRepositoryAdapter implements LiveCommerceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async upsertBroadcastSnapshots(rows: LiveCommerceBroadcastSnapshotUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    await this.prisma.$transaction(rows.map((row) => {
      const viewerCount = clampInt4(row.viewerCount);
      const likeCount = clampInt4(row.likeCount);
      return this.prisma.liveCommerceBroadcastDailySnapshot.upsert({
        where: {
          organizationId_businessDate_source_broadcastId: {
            organizationId: row.organizationId,
            businessDate: row.businessDate,
            source: row.source,
            broadcastId: row.broadcastId,
          },
        },
        create: { ...row, viewerCount, likeCount },
        update: {
          title: row.title,
          broadcasterId: row.broadcasterId,
          broadcasterName: row.broadcasterName,
          status: row.status,
          viewerCount,
          likeCount,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          coverImageUrl: row.coverImageUrl,
          sourceUrl: row.sourceUrl,
          capturedAt: row.capturedAt,
        },
      });
    }));
    return rows.length;
  }

  async upsertProductSnapshots(rows: LiveCommerceProductSnapshotUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    await this.prisma.$transaction(rows.map((row) => {
      const salesCount = clampInt4(row.salesCount);
      return this.prisma.liveCommerceProductDailySnapshot.upsert({
        where: {
          organizationId_businessDate_source_broadcastId_productId: {
            organizationId: row.organizationId,
            businessDate: row.businessDate,
            source: row.source,
            broadcastId: row.broadcastId,
            productId: row.productId,
          },
        },
        create: { ...row, salesCount },
        update: {
          rank: row.rank,
          title: row.title,
          priceCny: row.priceCny,
          salesCount,
          imageUrl: row.imageUrl,
          sourceUrl: row.sourceUrl,
          capturedAt: row.capturedAt,
        },
      });
    }));
    return rows.length;
  }

  async findBroadcastSnapshots(query: LiveCommerceSnapshotQuery): Promise<LiveCommerceBroadcastSnapshotRow[]> {
    const rows = await this.prisma.liveCommerceBroadcastDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
        ...(query.source ? { source: query.source } : {}),
      },
      orderBy: [{ businessDate: 'desc' }, { viewerCount: 'desc' }, { capturedAt: 'desc' }],
    });
    return rows.map((row) => ({
      businessDate: row.businessDate,
      source: row.source as LiveCommerceBroadcastSnapshotRow['source'],
      broadcastId: row.broadcastId,
      title: row.title,
      broadcasterId: row.broadcasterId,
      broadcasterName: row.broadcasterName,
      status: row.status,
      viewerCount: row.viewerCount,
      likeCount: row.likeCount,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      coverImageUrl: row.coverImageUrl,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
    }));
  }

  async findProductSnapshots(query: LiveCommerceSnapshotQuery): Promise<LiveCommerceProductSnapshotRow[]> {
    const rows = await this.prisma.liveCommerceProductDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
        ...(query.source ? { source: query.source } : {}),
      },
      orderBy: [{ businessDate: 'desc' }, { rank: 'asc' }, { capturedAt: 'desc' }],
    });
    return rows.map((row) => ({
      businessDate: row.businessDate,
      source: row.source as LiveCommerceProductSnapshotRow['source'],
      broadcastId: row.broadcastId,
      productId: row.productId,
      rank: row.rank,
      title: row.title,
      priceCny: row.priceCny == null ? null : Number(row.priceCny),
      salesCount: row.salesCount,
      imageUrl: row.imageUrl,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
    }));
  }
}

function clampInt4(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(Math.max(0, Math.trunc(value)), INT4_MAX);
}
