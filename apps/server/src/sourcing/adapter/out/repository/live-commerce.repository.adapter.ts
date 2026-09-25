import { Injectable } from '@nestjs/common';
import { businessDateKey, kstInclusiveDaysStart } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
import { readCompleteLiveCommerceHistoryPublications } from './source-evidence.reader';
import { declaredCoverageDateKeys } from '../../../domain/source-evidence-coverage';
import type {
  LiveCommerceBroadcastSnapshotRow,
  LiveCommerceProductSnapshotRow,
  LiveCommerceRepositoryPort,
  LiveCommerceSnapshotQuery,
  LiveCommerceSource,
} from '../../../application/port/out/repository/live-commerce.repository.port';

@Injectable()
export class LiveCommerceRepositoryAdapter implements LiveCommerceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findBroadcastSnapshots(query: LiveCommerceSnapshotQuery): Promise<LiveCommerceBroadcastSnapshotRow[]> {
    const start = kstInclusiveDaysStart(query.days);
    const sourceKeys = query.source ? [liveCommerceSourceKey(query.source)] : LIVE_COMMERCE_SOURCE_KEYS;
    const attempts = await readCompleteLiveCommerceHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      sourceKeys,
      start,
      source: query.source,
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dates = declaredCoverageDateKeys(attempt, start);
      const selectedRows = [] as typeof attempt.liveCommerceBroadcastDailySnapshots;
      for (const date of dates) {
        const scope = `${attempt.sourceKey}\u0000${attempt.scopeKey}\u0000${attempt.targetKey}\u0000${date}`;
        if (selectedScopes.has(scope)) continue;
        selectedScopes.add(scope);
        selectedRows.push(...attempt.liveCommerceBroadcastDailySnapshots.filter((row) => dateKey(row.businessDate) === date));
      }
      return selectedRows;
    });
    return rows.sort((a, b) => b.businessDate.getTime() - a.businessDate.getTime()
      || (b.viewerCount ?? 0) - (a.viewerCount ?? 0) || b.capturedAt.getTime() - a.capturedAt.getTime()).map((row) => ({
      operationId: row.operationId,
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
    const start = kstInclusiveDaysStart(query.days);
    const sourceKeys = query.source ? [liveCommerceSourceKey(query.source)] : LIVE_COMMERCE_SOURCE_KEYS;
    const attempts = await readCompleteLiveCommerceHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      sourceKeys,
      start,
      source: query.source,
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dates = declaredCoverageDateKeys(attempt, start);
      const selectedRows = [] as typeof attempt.liveCommerceProductDailySnapshots;
      for (const date of dates) {
        const scope = `${attempt.sourceKey}\u0000${attempt.scopeKey}\u0000${attempt.targetKey}\u0000${date}`;
        if (selectedScopes.has(scope)) continue;
        selectedScopes.add(scope);
        selectedRows.push(...attempt.liveCommerceProductDailySnapshots.filter((row) => dateKey(row.businessDate) === date));
      }
      return selectedRows;
    });
    return rows.sort((a, b) => b.businessDate.getTime() - a.businessDate.getTime()
      || compareNullableRank(a.rank, b.rank)
      || b.capturedAt.getTime() - a.capturedAt.getTime()).map((row) => ({
      operationId: row.operationId,
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

function compareNullableRank(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

const LIVE_COMMERCE_SOURCE_KEYS = ['taobao.live', '1688.live_commerce', 'douyin.live_commerce'];

function liveCommerceSourceKey(source: LiveCommerceSource): string {
  return source === 'taobao' ? 'taobao.live' : `${source}.live_commerce`;
}

function dateKey(value: Date): string {
  return businessDateKey(value);
}
