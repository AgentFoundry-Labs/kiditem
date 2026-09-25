import { SourcingKeywordAnalysisSnapshotSchema } from '@kiditem/shared/sourcing';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { businessDateKey, kstInclusiveDaysStart, parseBusinessDate } from '../../../../common/kst';
import {
  readComplete1688OfferHistoryPublications,
  readCompleteNaverKeywordHistoryPublications,
  readCompleteNaverPopularKeywordHistoryPublications,
  readCompleteShortsHistoryPublications,
  readCompleteTiktokHistoryPublications,
  readCurrentPublications,
  readKeywordAnalysisFact,
} from './source-evidence.reader';
import { declaredCoverageDateKeys } from '../../../domain/source-evidence-coverage';
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
    const fact = await readKeywordAnalysisFact(this.prisma, {
      organizationId: input.organizationId,
      inputHash: input.inputHash,
      schemaVersion: 'naver-keyword-analysis/v1',
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    });
    const parsed = SourcingKeywordAnalysisSnapshotSchema.safeParse(fact?.document);
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
    const publications = await readCurrentPublications(this.prisma, {
      organizationId: input.organizationId,
      sourceKey: input.source === 'naver' ? 'naver.trend' : 'shortstrend.trend',
      scopeKey: 'default',
    });
    const [complete] = publications.sort((left, right) =>
      (right.windowEndAt?.getTime() ?? -Infinity)
      - (left.windowEndAt?.getTime() ?? -Infinity)
      || right.completedAt.getTime() - left.completedAt.getTime()
      || right.id.localeCompare(left.id));
    return complete?.targetKey ?? null;
  }

  async findNaverKeywordHistory(query: TrendHistoryQuery): Promise<NaverKeywordSnapshotRow[]> {
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await readCompleteNaverKeywordHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      start,
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = declaredCoverageDateKeys(attempt, start);
      const planKeywords = planStringList(attempt.plan, 'keywords');
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
    const attempts = await readCompleteNaverPopularKeywordHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      start,
    });
    const covered = new Set<string>();
    const coverage: Array<{ boardKey: string; businessDate: Date }> = [];
    const rows: NaverPopularKeywordSnapshotRow[] = [];
    for (const attempt of attempts) {
      const plan = asRecord(attempt.plan);
      const boardKeys = Array.isArray(plan?.boardKeys)
        ? plan.boardKeys.filter((value): value is string => typeof value === 'string')
        : [];
      const dateKeys = declaredCoverageDateKeys(attempt, start);
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
    const attempts = await readComplete1688OfferHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      start,
    });

    const selectedScopes = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = declaredCoverageDateKeys(attempt, start);
      const planKeywords = new Set(
        planStringList(attempt.plan, 'keywords').map(keywordIdentity),
      );
      const selectedRows = [] as typeof attempt.offerKeywordObservations;
      for (const dateKeyValue of dateKeys) {
        for (const keyword of planKeywords) {
          const scopeKey = `${attempt.scopeKey}:${attempt.targetKey}:${dateKeyValue}:${keyword}`;
          if (selectedScopes.has(scopeKey)) continue;
          selectedScopes.add(scopeKey);
          selectedRows.push(...attempt.offerKeywordObservations.filter((row) =>
            dateKey(row.businessDate) === dateKeyValue
            && keywordIdentity(row.sourceKeywordNormalized) === keyword));
        }
      }
      return selectedRows;
    });
    return rows.sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime()
      || compareNullableRank(a.rank, b.rank)).map((row) => ({
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
    return (await this.findShortsHistoryWithCoverage(query)).rows;
  }

  async findShortsHistoryWithCoverage(query: TrendHistoryQuery) {
    // Read coverage even when a complete attempt stored no video.
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await readCompleteShortsHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      start,
    });
    const selectedDates = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = declaredCoverageDateKeys(attempt, start);
      const selected = dateKeys.filter((dateKeyValue) => !selectedDates.has(dateKeyValue));
      selected.forEach((dateKeyValue) => selectedDates.add(dateKeyValue));
      return attempt.shortsTrendDailySnapshots.filter((row) => selected.includes(dateKey(row.businessDate)));
    });
    const coverage = [...selectedDates].sort().map((dateKeyValue) => ({ businessDate: dateFromKey(dateKeyValue) }));
    const shortsRows = latestTrendRows(rows, (row) => `${dateKey(row.businessDate)}:${row.videoKey}`)
      .sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime()
        || compareNullableRank(a.rank, b.rank))
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
    return { rows: shortsRows, coverage };
  }

  async findTiktokCcHistory(query: TrendHistoryQuery): Promise<TiktokCcSnapshotRow[]> {
    const start = kstInclusiveDaysStart(query.days);
    const attempts = await readCompleteTiktokHistoryPublications(this.prisma, {
      organizationId: query.organizationId,
      start,
    });
    const selectedDates = new Set<string>();
    const rows = attempts.flatMap((attempt) => {
      const dateKeys = declaredCoverageDateKeys(attempt, start);
      const selected = dateKeys.filter((dateKeyValue) => !selectedDates.has(dateKeyValue));
      selected.forEach((dateKeyValue) => selectedDates.add(dateKeyValue));
      return attempt.tiktokCreativeTrendDailySnapshots.filter((row) => selected.includes(dateKey(row.businessDate)));
    });
    return rows.sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime()
      || a.trendType.localeCompare(b.trendType)
      || compareNullableRank(a.rank, b.rank)).map((row) => ({
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

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function planStringList(value: Prisma.JsonValue | null, key: string): string[] {
  const plan = asRecord(value);
  const candidate = plan?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [];
}

function keywordIdentity(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
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

function compareNullableRank(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}
