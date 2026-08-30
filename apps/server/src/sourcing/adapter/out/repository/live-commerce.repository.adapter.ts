import { Injectable } from '@nestjs/common';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  LiveCommerceBroadcastSnapshotRow,
  LiveCommerceProductSnapshotRow,
  LiveCommerceRepositoryPort,
  LiveCommerceSnapshotQuery,
} from '../../../application/port/out/repository/live-commerce.repository.port';

@Injectable()
export class LiveCommerceRepositoryAdapter implements LiveCommerceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

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
