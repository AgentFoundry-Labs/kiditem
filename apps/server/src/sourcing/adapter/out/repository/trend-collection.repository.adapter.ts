import { SourcingKeywordAnalysisSnapshotSchema } from '@kiditem/shared/sourcing';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import type { Prisma } from '@prisma/client';
import type {
  NaverKeywordSnapshotRow,
  NaverPopularKeywordSnapshotRow,
  Sourcing1688HotProductSnapshotRow,
  ShortsSnapshotRow,
  TiktokCcSnapshotRow,
  TrendCollectionRepositoryPort,
  TrendHistoryQuery,
  TrendSeedRow,
  UpdateTrendSeedInput,
  UpsertTrendSeedInput,
} from '../../../application/port/out/repository/trend-collection.repository.port';

const DEFAULT_TREND_SEED_SOURCES = ['naver', 'shorts', '1688'];

@Injectable()
export class TrendCollectionRepositoryAdapter implements TrendCollectionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findKeywordAnalysisSnapshot(input: { organizationId: string; inputHash: string; attemptId?: string }) {
    const observation = await this.prisma.sourcingEvidenceObservation.findFirst({
      where: { organizationId: input.organizationId, sourceKey: 'naver.keyword_analysis',
        evidenceFamily: 'keyword_analysis', conceptKey: input.inputHash, schemaVersion: 'naver-keyword-analysis/v1',
        ingestionRun: { organizationId: input.organizationId, sourceKey: 'naver.keyword_analysis',
          scopeKey: 'default', targetKey: input.inputHash, status: 'COMPLETE',
          ...(input.attemptId ? { id: input.attemptId } : { isCurrentComplete: true }) } },
      select: { payload: true },
    });
    const parsed = SourcingKeywordAnalysisSnapshotSchema.safeParse(observation?.payload);
    return parsed.success ? parsed.data : null;
  }

  async listSeeds(organizationId: string): Promise<TrendSeedRow[]> {
    const rows = await this.prisma.trendSeedKeyword.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSeedRow);
  }

  async upsertSeedByKeyword(input: UpsertTrendSeedInput): Promise<TrendSeedRow> {
    const update: Prisma.TrendSeedKeywordUpdateInput = {};
    if (input.keywordCn !== undefined) update.keywordCn = input.keywordCn;
    if (input.sources !== undefined) update.sources = input.sources;

    const row = await this.prisma.trendSeedKeyword.upsert({
      where: {
        organizationId_keyword: {
          organizationId: input.organizationId,
          keyword: input.keyword,
        },
      },
      create: {
        organizationId: input.organizationId,
        keyword: input.keyword,
        keywordCn: input.keywordCn ?? null,
        sources: input.sources ?? DEFAULT_TREND_SEED_SOURCES,
      },
      update,
    });
    return toSeedRow(row);
  }

  async updateSeed(input: UpdateTrendSeedInput): Promise<TrendSeedRow> {
    const data: Prisma.TrendSeedKeywordUpdateManyMutationInput = {};
    if (input.keyword !== undefined) data.keyword = input.keyword;
    if (input.keywordCn !== undefined) data.keywordCn = input.keywordCn;
    if (input.sources !== undefined) data.sources = input.sources;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    const updated = await this.prisma.trendSeedKeyword.updateMany({
      where: { id: input.id, organizationId: input.organizationId },
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException('트렌드 시드 키워드를 찾을 수 없습니다.');
    }

    const row = await this.prisma.trendSeedKeyword.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (!row) {
      throw new NotFoundException('트렌드 시드 키워드를 찾을 수 없습니다.');
    }
    return toSeedRow(row);
  }

  async deleteSeed(input: { id: string; organizationId: string }): Promise<void> {
    const deleted = await this.prisma.trendSeedKeyword.deleteMany({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('트렌드 시드 키워드를 찾을 수 없습니다.');
    }
  }

  async findLatestCompleteTrendScope(input: { organizationId: string; source: 'naver' | 'shorts' }): Promise<string | null> {
    const complete = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: { organizationId: input.organizationId, sourceKey: input.source === 'naver' ? 'naver.trend' : 'shortstrend.trend',
        scopeKey: 'default', status: 'COMPLETE', isCurrentComplete: true },
      orderBy: [{ sourceWindowEndAt: 'desc' }, { startedAt: 'asc' }, { id: 'asc' }],
      select: { targetKey: true },
    });
    return complete?.targetKey ?? null;
  }

  async findNaverKeywordHistory(query: TrendHistoryQuery): Promise<NaverKeywordSnapshotRow[]> {
    const rows = await this.prisma.naverKeywordDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
        ingestionRun: { sourceKey: 'naver.trend', scopeKey: 'default', status: 'COMPLETE', isCurrentComplete: true },
      },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return latestTrendRows(rows, (row) => `${row.businessDate.toISOString()}:${row.keyword}`)
      .sort((a, b) => a.keyword.localeCompare(b.keyword) || a.businessDate.getTime() - b.businessDate.getTime())
      .map((row) => ({
      keyword: row.keyword,
      businessDate: row.businessDate,
      monthlyTotalSearchCount: row.monthlyTotalSearchCount,
      monthlyPcSearchCount: row.monthlyPcSearchCount,
      monthlyMobileSearchCount: row.monthlyMobileSearchCount,
      competitionIndex: row.competitionIndex,
      averageAdRank: row.averageAdRank,
      trendRatio: row.trendRatio,
      trendDelta: row.trendDelta,
      capturedAt: row.capturedAt,
    }));
  }

  async findPopularKeywordHistory(query: TrendHistoryQuery) {
    // Read coverage even when the complete attempt produced no board rows.
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: { organizationId: query.organizationId, sourceKey: 'naver.trend', scopeKey: 'default',
        status: 'COMPLETE', isCurrentComplete: true,
        sourceWindowStartAt: { gte: kstInclusiveDaysStart(query.days) } },
      orderBy: [{ sourceWindowEndAt: 'desc' }, { startedAt: 'asc' }, { id: 'asc' }],
      select: { attemptPlan: true, naverPopularKeywordDailySnapshots: true },
    });
    const covered = new Set<string>();
    const coverage: Array<{ boardKey: string; businessDate: Date }> = [];
    const rows: NaverPopularKeywordSnapshotRow[] = [];
    for (const attempt of attempts) {
      const plan = attempt.attemptPlan;
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)
        || typeof plan.businessDate !== 'string' || !Array.isArray(plan.boardKeys)) continue;
      for (const boardKey of plan.boardKeys) {
        if (typeof boardKey !== 'string') continue;
        const coverageKey = plan.businessDate + ':' + boardKey;
        if (covered.has(coverageKey)) continue;
        covered.add(coverageKey);
        coverage.push({ boardKey, businessDate: new Date(plan.businessDate) });
        rows.push(...attempt.naverPopularKeywordDailySnapshots.filter((row) => row.boardKey === boardKey).map((row) => ({
          boardKey: row.boardKey, boardLabel: row.boardLabel, cid: row.cid, businessDate: row.businessDate,
          rank: row.rank, keyword: row.keyword, linkId: row.linkId,
        })));
      }
    }
    return { coverage, rows: rows.sort((a, b) => a.boardKey.localeCompare(b.boardKey)
      || a.businessDate.getTime() - b.businessDate.getTime() || a.rank - b.rank) };
  }

  async find1688HotHistory(query: TrendHistoryQuery): Promise<Sourcing1688HotProductSnapshotRow[]> {
    const rows = await this.prisma.sourcing1688OfferKeywordObservation.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
        ingestionRun: {
          sourceKey: '1688.hot_product',
          status: 'COMPLETE',
          isCurrentComplete: true,
        },
      },
      orderBy: [{ businessDate: 'asc' }, { rank: 'asc' }],
    });
    return rows.map((row) => ({
      businessDate: row.businessDate,
      capturedAt: row.capturedAt,
      offerId: row.externalOfferId,
      sourceKeyword: row.sourceKeywordNormalized,
      rank: row.rank,
      title: row.title,
      priceCny: row.priceCny == null ? null : Number(row.priceCny),
      monthlySales: row.monthlySales,
      repurchaseRate: stringFromRawOffer(row.rawOffer, 'repurchaseRate'),
      tradeScore: stringFromRawOffer(row.rawOffer, 'tradeScore'),
      supplierName: row.supplierName,
      imageUrl: row.imageUrl,
      sourceUrl: row.sourceUrl,
    }));
  }

  async findShortsHistory(query: TrendHistoryQuery): Promise<ShortsSnapshotRow[]> {
    const rows = await this.prisma.shortsTrendDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
        ingestionRun: { sourceKey: 'shortstrend.trend', scopeKey: 'default', status: 'COMPLETE', isCurrentComplete: true },
      },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return latestTrendRows(rows, (row) => `${row.businessDate.toISOString()}:${row.videoKey}`)
      .sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime() || (a.rank ?? 0) - (b.rank ?? 0))
      .map((row) => ({
      businessDate: row.businessDate,
      capturedAt: row.capturedAt,
      videoKey: row.videoKey,
      rank: row.rank,
      title: row.title,
      channelName: row.channelName,
      viewCount: row.viewCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      keyword: row.keyword,
      publishedAt: row.publishedAt,
      thumbnailUrl: row.thumbnailUrl,
      videoUrl: row.videoUrl,
    }));
  }

  async findTiktokCcHistory(query: TrendHistoryQuery): Promise<TiktokCcSnapshotRow[]> {
    const rows = await this.prisma.tiktokCreativeTrendDailySnapshot.findMany({
      where: {
        organizationId: query.organizationId,
        businessDate: { gte: kstInclusiveDaysStart(query.days) },
        ingestionRun: {
          sourceKey: 'tiktok.creative',
          scopeKey: 'default',
          targetKey: 'all',
          status: 'COMPLETE',
          isCurrentComplete: true,
        },
      },
      orderBy: [{ businessDate: 'asc' }, { trendType: 'asc' }, { rank: 'asc' }],
    });
    return rows.map((row) => ({
      businessDate: row.businessDate,
      capturedAt: row.capturedAt,
      region: row.region,
      trendType: row.trendType,
      entityKey: row.entityKey,
      rank: row.rank,
      label: row.label,
      industry: row.industry,
      sourceKeyword: row.sourceKeyword,
      postCount: row.postCount,
      viewCount: row.viewCount == null ? null : Number(row.viewCount),
      growthPct: row.growthPct == null ? null : Number(row.growthPct),
      thumbnailUrl: row.thumbnailUrl,
      sourceUrl: row.sourceUrl,
    }));
  }
}

function stringFromRawOffer(rawOffer: unknown, key: string): string | null {
  if (!rawOffer || typeof rawOffer !== 'object' || Array.isArray(rawOffer)) return null;
  const value = (rawOffer as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

function toSeedRow(row: {
  id: string;
  organizationId: string;
  keyword: string;
  keywordCn: string | null;
  sources: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TrendSeedRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    keyword: row.keyword,
    keywordCn: row.keywordCn,
    sources: row.sources,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function latestTrendRows<T>(rows: T[], identity: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = identity(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
