import { SourcingKeywordAnalysisSnapshotSchema } from '@kiditem/shared/sourcing';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { businessDateKey, kstBusinessDate, kstInclusiveDaysStart, parseBusinessDate } from '../../../../common/kst';
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
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: query.organizationId,
        sourceKey: 'naver.trend',
        scopeKey: 'default',
        status: 'COMPLETE',
        OR: [
          { sourceWindowStartAt: { gte: start } },
          { naverKeywordDailySnapshots: { some: { businessDate: { gte: start } } } },
          { naverPopularKeywordDailySnapshots: { some: { businessDate: { gte: start } } } },
        ],
      },
      include: {
        naverKeywordDailySnapshots: {
          where: { businessDate: { gte: start } },
          orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = completeRunDateKeys(attempt, attempt.naverKeywordDailySnapshots, start);
      const planKeywords = planStringList(attempt.attemptPlan, 'keywords');
      const selectedRows = [] as typeof attempt.naverKeywordDailySnapshots;
      for (const dateKeyValue of dateKeys) {
        const rowKeywords = new Set(attempt.naverKeywordDailySnapshots
          .filter((row) => dateKey(row.businessDate) === dateKeyValue)
          .map((row) => row.keyword));
        const scopeKeywords = [...new Set([...planKeywords, ...rowKeywords])];
        // A valid empty Naver plan has no keyword scope to replace. This is
        // intentionally different from an empty Shorts snapshot or an empty
        // popular-keyword board, whose scopes are explicit in their plans.
        for (const keyword of scopeKeywords) {
          const scope = `${dateKeyValue}:${keyword}`;
          if (selectedScopes.has(scope)) continue;
          selectedScopes.add(scope);
          selectedRows.push(...attempt.naverKeywordDailySnapshots.filter((row) =>
            dateKey(row.businessDate) === dateKeyValue && row.keyword === keyword));
        }
      }
      return selectedRows;
    });
    return latestTrendRows(rows, (row) => `${dateKey(row.businessDate)}:${row.keyword}`)
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
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: { organizationId: query.organizationId, sourceKey: 'naver.trend', scopeKey: 'default',
        status: 'COMPLETE',
        OR: [
          { sourceWindowStartAt: { gte: start } },
          { naverPopularKeywordDailySnapshots: { some: { businessDate: { gte: start } } } },
        ] },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
      select: {
        attemptPlan: true,
        sourceWindowStartAt: true,
        sourceWindowEndAt: true,
        naverPopularKeywordDailySnapshots: {
          where: { businessDate: { gte: start } },
        },
      },
    });
    const covered = new Set<string>();
    const coverage: Array<{ boardKey: string; businessDate: Date }> = [];
    const rows: NaverPopularKeywordSnapshotRow[] = [];
    for (const attempt of attempts) {
      const plan = asRecord(attempt.attemptPlan);
      const boardKeys = Array.isArray(plan?.boardKeys)
        ? plan.boardKeys.filter((value): value is string => typeof value === 'string')
        : [...new Set(attempt.naverPopularKeywordDailySnapshots.map((row) => row.boardKey))];
      const dateKeys = completeRunDateKeys(attempt, attempt.naverPopularKeywordDailySnapshots, start);
      for (const dateKeyValue of dateKeys) {
        for (const boardKey of boardKeys) {
          if (typeof boardKey !== 'string') continue;
          const coverageKey = dateKeyValue + ':' + boardKey;
          if (covered.has(coverageKey)) continue;
          covered.add(coverageKey);
          coverage.push({ boardKey, businessDate: dateFromKey(dateKeyValue) });
          rows.push(...attempt.naverPopularKeywordDailySnapshots
            .filter((row) => row.boardKey === boardKey && dateKey(row.businessDate) === dateKeyValue)
            .map((row) => ({
              boardKey: row.boardKey, boardLabel: row.boardLabel, cid: row.cid, businessDate: row.businessDate,
              rank: row.rank, keyword: row.keyword, linkId: row.linkId,
            })));
        }
      }
    }
    return { coverage, rows: rows.sort((a, b) => a.boardKey.localeCompare(b.boardKey)
      || a.businessDate.getTime() - b.businessDate.getTime() || a.rank - b.rank) };
  }

  async find1688HotHistory(query: TrendHistoryQuery): Promise<Sourcing1688HotProductSnapshotRow[]> {
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: query.organizationId,
        sourceKey: '1688.hot_product',
        status: 'COMPLETE',
        OR: [
          { sourceWindowEndAt: { gte: start } },
          { offerKeywordObservations: { some: { businessDate: { gte: start } } } },
        ],
      },
      include: {
        offerKeywordObservations: {
          where: { businessDate: { gte: start } },
          orderBy: [{ businessDate: 'asc' }, { rank: 'asc' }],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = completeRunDateKeys(attempt, attempt.offerKeywordObservations, start);
      const selectedRows = [] as typeof attempt.offerKeywordObservations;
      for (const dateKeyValue of dateKeys) {
        const scopeKey = `${attempt.scopeKey}:${attempt.targetKey}:${dateKeyValue}`;
        if (selectedScopes.has(scopeKey)) continue;
        selectedScopes.add(scopeKey);
        selectedRows.push(...attempt.offerKeywordObservations.filter((row) => dateKey(row.businessDate) === dateKeyValue));
      }
      return selectedRows;
    });
    return rows.sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime() || (a.rank ?? 0) - (b.rank ?? 0)).map((row) => ({
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
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: query.organizationId,
        sourceKey: 'shortstrend.trend',
        scopeKey: 'default',
        status: 'COMPLETE',
        OR: [
          { sourceWindowStartAt: { gte: start } },
          { shortsTrendDailySnapshots: { some: { businessDate: { gte: start } } } },
        ],
      },
      include: {
        shortsTrendDailySnapshots: {
          where: { businessDate: { gte: start } },
          orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });
    const selectedDates = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = completeRunDateKeys(attempt, attempt.shortsTrendDailySnapshots, start);
      const selected = dateKeys.filter((dateKeyValue) => !selectedDates.has(dateKeyValue));
      selected.forEach((dateKeyValue) => selectedDates.add(dateKeyValue));
      return attempt.shortsTrendDailySnapshots.filter((row) => selected.includes(dateKey(row.businessDate)));
    });
    return latestTrendRows(rows, (row) => `${dateKey(row.businessDate)}:${row.videoKey}`)
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
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: query.organizationId,
        sourceKey: 'tiktok.creative',
        scopeKey: 'default',
        targetKey: 'all',
        status: 'COMPLETE',
        OR: [
          { sourceWindowEndAt: { gte: start } },
          { tiktokCreativeTrendDailySnapshots: { some: { businessDate: { gte: start } } } },
        ],
      },
      include: {
        tiktokCreativeTrendDailySnapshots: {
          where: { businessDate: { gte: start } },
          orderBy: [{ businessDate: 'asc' }, { trendType: 'asc' }, { rank: 'asc' }],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });
    const selectedDates = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = completeRunDateKeys(attempt, attempt.tiktokCreativeTrendDailySnapshots, start);
      const selected = dateKeys.filter((dateKeyValue) => !selectedDates.has(dateKeyValue));
      selected.forEach((dateKeyValue) => selectedDates.add(dateKeyValue));
      return attempt.tiktokCreativeTrendDailySnapshots.filter((row) => selected.includes(dateKey(row.businessDate)));
    });
    return rows.sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime()
      || a.trendType.localeCompare(b.trendType) || (a.rank ?? 0) - (b.rank ?? 0)).map((row) => ({
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

type CompleteRunDateMetadata = {
  attemptPlan: Prisma.JsonValue | null;
  sourceWindowStartAt: Date | null;
  sourceWindowEndAt: Date | null;
};

function completeRunDateKeys(
  run: CompleteRunDateMetadata,
  rows: readonly { businessDate: Date }[],
  start: Date,
): string[] {
  const startKey = dateKey(kstBusinessDate(start));
  const dates = new Set<string>();
  for (const row of rows) {
    const value = dateKey(row.businessDate);
    if (value >= startKey) dates.add(value);
  }

  const sourceWindowStart = run.sourceWindowStartAt && dateKey(kstBusinessDate(run.sourceWindowStartAt));
  if (sourceWindowStart && sourceWindowStart >= startKey) dates.add(sourceWindowStart);

  if (dates.size === 0) {
    const plannedDate = planDateKey(run.attemptPlan);
    if (plannedDate && plannedDate >= startKey) dates.add(plannedDate);
  }
  if (dates.size === 0 && run.sourceWindowEndAt) {
    const capturedDate = dateKey(kstBusinessDate(run.sourceWindowEndAt));
    if (capturedDate >= startKey) dates.add(capturedDate);
  }
  return [...dates].sort();
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function planDateKey(value: Prisma.JsonValue | null): string | null {
  const plan = asRecord(value);
  if (!plan) return null;
  const candidate = plan.businessDate ?? plan.queryDate;
  if (typeof candidate !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(candidate)) return candidate.slice(0, 10);
  if (/^\d{8}$/.test(candidate)) return `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6, 8)}`;
  return null;
}

function planStringList(value: Prisma.JsonValue | null, key: string): string[] {
  const plan = asRecord(value);
  const candidate = plan?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [];
}

function dateKey(value: Date): string {
  return businessDateKey(value);
}

function dateFromKey(value: string): Date {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new Error(`Invalid business date: ${value}`);
  return parsed;
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
