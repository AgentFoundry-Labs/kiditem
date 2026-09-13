import { Injectable } from '@nestjs/common';
import { businessDateKey, kstBusinessDate, kstInclusiveDaysStart } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
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
    const sourceFilter = query.source ? { source: query.source } : {};
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: query.organizationId,
        sourceKey: { in: sourceKeys },
        status: 'COMPLETE',
        OR: [
          { sourceWindowEndAt: { gte: start } },
          { liveCommerceBroadcastDailySnapshots: { some: { businessDate: { gte: start }, ...sourceFilter } } },
          { liveCommerceProductDailySnapshots: { some: { businessDate: { gte: start }, ...sourceFilter } } },
        ],
      },
      include: {
        liveCommerceBroadcastDailySnapshots: {
          where: { businessDate: { gte: start }, ...sourceFilter },
          orderBy: [{ businessDate: 'desc' }, { viewerCount: 'desc' }, { capturedAt: 'desc' }],
        },
        liveCommerceProductDailySnapshots: {
          where: { businessDate: { gte: start }, ...sourceFilter },
          select: { businessDate: true },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dates = completeRunDateKeys(attempt, [
        ...attempt.liveCommerceBroadcastDailySnapshots,
        ...attempt.liveCommerceProductDailySnapshots,
      ], start);
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
      ingestionRunId: row.ingestionRunId,
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
    const sourceFilter = query.source ? { source: query.source } : {};
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: query.organizationId,
        sourceKey: { in: sourceKeys },
        status: 'COMPLETE',
        OR: [
          { sourceWindowEndAt: { gte: start } },
          { liveCommerceBroadcastDailySnapshots: { some: { businessDate: { gte: start }, ...sourceFilter } } },
          { liveCommerceProductDailySnapshots: { some: { businessDate: { gte: start }, ...sourceFilter } } },
        ],
      },
      include: {
        liveCommerceProductDailySnapshots: {
          where: { businessDate: { gte: start }, ...sourceFilter },
          orderBy: [{ businessDate: 'desc' }, { rank: 'asc' }, { capturedAt: 'desc' }],
        },
        liveCommerceBroadcastDailySnapshots: {
          where: { businessDate: { gte: start }, ...sourceFilter },
          select: { businessDate: true },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dates = completeRunDateKeys(attempt, [
        ...attempt.liveCommerceProductDailySnapshots,
        ...attempt.liveCommerceBroadcastDailySnapshots,
      ], start);
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
      || (a.rank ?? 0) - (b.rank ?? 0) || b.capturedAt.getTime() - a.capturedAt.getTime()).map((row) => ({
      ingestionRunId: row.ingestionRunId,
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

const LIVE_COMMERCE_SOURCE_KEYS = ['taobao.live', '1688.live_commerce', 'douyin.live_commerce'];

function liveCommerceSourceKey(source: LiveCommerceSource): string {
  return source === 'taobao' ? 'taobao.live' : `${source}.live_commerce`;
}

function completeRunDateKeys(
  run: {
    attemptPlan: unknown;
    sourceWindowEndAt: Date | null;
  },
  rows: readonly { businessDate: Date }[],
  start: Date,
): string[] {
  const startKey = dateKey(kstBusinessDate(start));
  const dates = new Set<string>();
  for (const row of rows) {
    const value = dateKey(row.businessDate);
    if (value >= startKey) dates.add(value);
  }
  const plannedDate = planDateKey(run.attemptPlan);
  if (dates.size === 0 && plannedDate && plannedDate >= startKey) dates.add(plannedDate);
  if (dates.size === 0 && run.sourceWindowEndAt) {
    const capturedDate = dateKey(kstBusinessDate(run.sourceWindowEndAt));
    if (capturedDate >= startKey) dates.add(capturedDate);
  }
  return [...dates].sort();
}

function planDateKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.businessDate ?? record.queryDate;
  if (typeof candidate !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(candidate)) return candidate.slice(0, 10);
  if (/^\d{8}$/.test(candidate)) return `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6, 8)}`;
  return null;
}

function dateKey(value: Date): string {
  return businessDateKey(value);
}
