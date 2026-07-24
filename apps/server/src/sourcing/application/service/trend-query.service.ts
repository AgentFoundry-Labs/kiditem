import { Inject, Injectable } from '@nestjs/common';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type NaverKeywordSnapshotRow,
  type NaverPopularKeywordSnapshotRow,
  type Sourcing1688HotProductSnapshotRow,
  type ShortsSnapshotRow,
  type TiktokCcSnapshotRow,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';
import {
  DEFAULT_STATIONERY_TOY_TREND_SEEDS,
  isStationeryToyTrend,
} from '../../domain/stationery-toy-trend';

export interface NaverKeywordSparklinePoint {
  businessDate: string;
  trendRatio: number | null;
  monthlyTotalSearchCount: number | null;
}

export interface NaverKeywordTrendView {
  keyword: string;
  latest: {
    businessDate: string;
    monthlyTotalSearchCount: number | null;
    monthlyPcSearchCount: number | null;
    monthlyMobileSearchCount: number | null;
    competitionIndex: string | null;
    averageAdRank: number | null;
    trendRatio: number | null;
    trendDelta: number | null;
  };
  sparkline: NaverKeywordSparklinePoint[];
}

export interface PopularKeywordRiser {
  keyword: string;
  rankDelta: number | null;
}

export interface PopularKeywordBoardView {
  boardKey: string;
  boardLabel: string | null;
  latest: Array<{ rank: number; keyword: string }>;
  risers: PopularKeywordRiser[];
}

export interface Hot1688OfferView {
  offerId: string;
  sourceKeyword: string;
  rank: number | null;
  title: string | null;
  priceCny: number | null;
  monthlySales: number | null;
  repurchaseRate: string | null;
  tradeScore: string | null;
  supplierName: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  newlyRanked: boolean;
}

export interface ShortsTrendView {
  videoKey: string;
  rank: number | null;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  keyword: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  snapshotCount: number;
  viewDelta: number | null;
  dailyViewGrowth: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface TiktokCcTrendItemView {
  trendType: string;
  entityKey: string;
  rank: number | null;
  label: string | null;
  industry: string | null;
  sourceKeyword: string | null;
  postCount: number | null;
  viewCount: number | null;
  growthPct: number | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  newlyRanked: boolean;
}

export interface TiktokCcRegionView {
  region: string;
  items: TiktokCcTrendItemView[];
}

interface ShortsPeriodAggregate {
  latest: ShortsSnapshotRow;
  snapshotCount: number;
  viewDelta: number | null;
  dailyViewGrowth: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  bestRank: number;
  relevanceFields: Array<string | null>;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_VELOCITY_WINDOW_DAYS = 1 / 24;

@Injectable()
export class TrendQueryService {
  constructor(
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly repository: TrendCollectionRepositoryPort,
  ) {}

  async getNaverKeywords(
    organizationId: string,
    days: number,
  ): Promise<{ days: number; keywords: NaverKeywordTrendView[] }> {
    const rows = await this.repository.findNaverKeywordHistory({ organizationId, days });
    const byKeyword = groupBy(rows, (row) => row.keyword);

    const keywords: NaverKeywordTrendView[] = [];
    for (const [keyword, keywordRows] of byKeyword) {
      const sorted = [...keywordRows].sort(byBusinessDateAsc);
      const latestRow = sorted[sorted.length - 1];
      keywords.push({
        keyword,
        latest: {
          businessDate: toDateString(latestRow.businessDate),
          monthlyTotalSearchCount: latestRow.monthlyTotalSearchCount,
          monthlyPcSearchCount: latestRow.monthlyPcSearchCount,
          monthlyMobileSearchCount: latestRow.monthlyMobileSearchCount,
          competitionIndex: latestRow.competitionIndex,
          averageAdRank: latestRow.averageAdRank,
          trendRatio: latestRow.trendRatio,
          trendDelta: latestRow.trendDelta,
        },
        sparkline: sorted.map((row) => ({
          businessDate: toDateString(row.businessDate),
          trendRatio: row.trendRatio,
          monthlyTotalSearchCount: row.monthlyTotalSearchCount,
        })),
      });
    }

    keywords.sort(
      (a, b) => (b.latest.monthlyTotalSearchCount ?? 0) - (a.latest.monthlyTotalSearchCount ?? 0),
    );
    return { days, keywords };
  }

  async getPopularKeywords(
    organizationId: string,
    days: number,
  ): Promise<{ days: number; boards: PopularKeywordBoardView[] }> {
    const rows = await this.repository.findPopularKeywordHistory({ organizationId, days });
    const byBoard = groupBy(rows, (row) => row.boardKey);

    const boards: PopularKeywordBoardView[] = [];
    for (const [boardKey, boardRows] of byBoard) {
      const latestDate = maxBusinessDateMs(boardRows);
      const oldestDate = minBusinessDateMs(boardRows);

      const latestRows = boardRows
        .filter((row) => row.businessDate.getTime() === latestDate)
        .sort((a, b) => a.rank - b.rank);
      const oldestRankByKeyword = new Map<string, number>();
      for (const row of boardRows) {
        if (row.businessDate.getTime() === oldestDate) oldestRankByKeyword.set(row.keyword, row.rank);
      }

      const boardLabel = boardRows.find((row) => row.boardLabel)?.boardLabel ?? null;
      const risers: PopularKeywordRiser[] = [];
      const isSingleDay = latestDate === oldestDate;
      for (const row of latestRows) {
        if (isSingleDay) break;
        const oldestRank = oldestRankByKeyword.get(row.keyword);
        if (oldestRank === undefined) {
          risers.push({ keyword: row.keyword, rankDelta: null });
        } else if (oldestRank - row.rank > 0) {
          risers.push({ keyword: row.keyword, rankDelta: oldestRank - row.rank });
        }
      }
      risers.sort(riserOrder);

      boards.push({
        boardKey,
        boardLabel,
        latest: latestRows.map((row) => ({ rank: row.rank, keyword: row.keyword })),
        risers,
      });
    }

    return { days, boards };
  }

  async get1688Hot(
    organizationId: string,
    days: number,
  ): Promise<{ days: number; businessDate: string | null; capturedAt: string | null; offers: Hot1688OfferView[] }> {
    const rows = await this.repository.find1688HotHistory({ organizationId, days });
    if (rows.length === 0) return { days, businessDate: null, capturedAt: null, offers: [] };

    const latestDate = maxBusinessDateMs(rows);
    const latestRows = rowsFromLatestCapture(
      rows.filter((row) => row.businessDate.getTime() === latestDate),
    );
    const capturedAt = latestCapturedAt(latestRows);
    const priorOfferIds = new Set<string>();
    for (const row of rows) {
      if (row.businessDate.getTime() < latestDate) priorOfferIds.add(row.offerId);
    }

    const offers = latestRows
      .sort((a, b) => (b.monthlySales ?? 0) - (a.monthlySales ?? 0))
      .map((row) => ({
        offerId: row.offerId,
        sourceKeyword: row.sourceKeyword,
        rank: row.rank,
        title: row.title,
        priceCny: row.priceCny,
        monthlySales: row.monthlySales,
        repurchaseRate: row.repurchaseRate,
        tradeScore: row.tradeScore,
        supplierName: row.supplierName,
        imageUrl: row.imageUrl,
        sourceUrl: row.sourceUrl,
        newlyRanked: !priorOfferIds.has(row.offerId),
      }));

    return { days, businessDate: toDateStringFromMs(latestDate), capturedAt, offers };
  }

  async getShorts(
    organizationId: string,
    days: number,
  ): Promise<{ days: number; businessDate: string | null; capturedAt: string | null; items: ShortsTrendView[] }> {
    const [rows, seeds] = await Promise.all([
      this.repository.findShortsHistory({ organizationId, days }),
      this.repository.listSeeds(organizationId),
    ]);
    if (rows.length === 0) return { days, businessDate: null, capturedAt: null, items: [] };

    const latestDate = maxBusinessDateMs(rows);
    const capturedAt = latestCapturedAt(rows);
    const latestCapturedAtMs = Math.max(...rows.map((row) => row.capturedAt.getTime()));
    const publishedCutoffMs = latestCapturedAtMs - Math.max(days, 1) * ONE_DAY_MS;
    const seedKeywords = [
      ...seeds
        .filter((seed) => seed.enabled && seed.sources.includes('shorts'))
        .map((seed) => seed.keyword),
      ...DEFAULT_STATIONERY_TOY_TREND_SEEDS.map((seed) => seed.keyword),
    ];
    const aggregates = Array.from(groupBy(rows, (row) => row.videoKey).values())
      .map((videoRows) => aggregateShortsPeriod(videoRows, days))
      .filter((aggregate) => (
        aggregate.latest.publishedAt === null
        || aggregate.latest.publishedAt.getTime() >= publishedCutoffMs
      ))
      .filter((aggregate) => isStationeryToyTrend(
        aggregate.relevanceFields,
        seedKeywords,
      ))
      .sort(byShortsGrowthDesc);
    const items = aggregates.map((aggregate, index) => {
      const row = aggregate.latest;
      return {
        videoKey: row.videoKey,
        rank: index + 1,
        title: row.title,
        channelName: row.channelName,
        viewCount: row.viewCount,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        keyword: row.keyword,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        thumbnailUrl: row.thumbnailUrl,
        videoUrl: row.videoUrl,
        snapshotCount: aggregate.snapshotCount,
        viewDelta: aggregate.viewDelta,
        dailyViewGrowth: aggregate.dailyViewGrowth,
        firstSeenAt: aggregate.firstSeenAt.toISOString(),
        lastSeenAt: aggregate.lastSeenAt.toISOString(),
      };
    });

    return { days, businessDate: toDateStringFromMs(latestDate), capturedAt, items };
  }

  async getTiktokCc(
    organizationId: string,
    days: number,
  ): Promise<{ days: number; businessDate: string | null; capturedAt: string | null; regions: TiktokCcRegionView[] }> {
    const rows = await this.repository.findTiktokCcHistory({ organizationId, days });
    if (rows.length === 0) return { days, businessDate: null, capturedAt: null, regions: [] };

    const latestDate = maxBusinessDateMs(rows);
    const latestRows = rows.filter((row) => row.businessDate.getTime() === latestDate);
    const capturedAt = latestCapturedAt(latestRows);
    const priorKeys = new Set<string>();
    for (const row of rows) {
      if (row.businessDate.getTime() < latestDate) {
        priorKeys.add(tiktokCcKey(row));
      }
    }

    const regions: TiktokCcRegionView[] = [];
    for (const [region, regionRows] of groupBy(latestRows, (row) => row.region)) {
      const items = [...regionRows]
        .sort((a, b) => {
          if (a.trendType !== b.trendType) return a.trendType.localeCompare(b.trendType);
          return (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY);
        })
        .map((row) => ({
          trendType: row.trendType,
          entityKey: row.entityKey,
          rank: row.rank,
          label: row.label,
          industry: row.industry,
          sourceKeyword: row.sourceKeyword,
          postCount: row.postCount,
          viewCount: row.viewCount,
          growthPct: row.growthPct,
          thumbnailUrl: row.thumbnailUrl,
          sourceUrl: row.sourceUrl,
          newlyRanked: !priorKeys.has(tiktokCcKey(row)),
        }));
      regions.push({ region, items });
    }
    regions.sort((a, b) => a.region.localeCompare(b.region));

    return { days, businessDate: toDateStringFromMs(latestDate), capturedAt, regions };
  }
}

function tiktokCcKey(row: TiktokCcSnapshotRow): string {
  return `${row.region}::${row.trendType}::${row.entityKey}`;
}

function aggregateShortsPeriod(rows: ShortsSnapshotRow[], days: number): ShortsPeriodAggregate {
  const sorted = [...rows].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const latest = sorted[sorted.length - 1];
  const firstSeenAt = sorted[0].capturedAt;
  const lastSeenAt = latest.capturedAt;
  const viewRows = sorted.filter((row) => row.viewCount !== null);
  const viewDelta = viewRows.length >= 2
    ? Math.max(0, (viewRows[viewRows.length - 1].viewCount ?? 0) - (viewRows[0].viewCount ?? 0))
    : null;

  return {
    latest,
    snapshotCount: sorted.length,
    viewDelta,
    dailyViewGrowth: calculateDailyViewGrowth({
      viewDelta,
      firstSeenAt,
      lastSeenAt,
      latestViewCount: latest.viewCount,
      publishedAt: latest.publishedAt,
      days,
    }),
    firstSeenAt,
    lastSeenAt,
    bestRank: sorted.reduce(
      (best, row) => Math.min(best, row.rank ?? Number.POSITIVE_INFINITY),
      Number.POSITIVE_INFINITY,
    ),
    relevanceFields: sorted.flatMap((row) => [row.title, row.keyword]),
  };
}

function calculateDailyViewGrowth(input: {
  viewDelta: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  latestViewCount: number | null;
  publishedAt: Date | null;
  days: number;
}): number | null {
  if (input.viewDelta !== null) {
    const observedDays = Math.max(
      (input.lastSeenAt.getTime() - input.firstSeenAt.getTime()) / ONE_DAY_MS,
      MIN_VELOCITY_WINDOW_DAYS,
    );
    return Math.round(input.viewDelta / observedDays);
  }
  if (input.latestViewCount === null) return null;

  const ageDays = input.publishedAt
    ? (input.lastSeenAt.getTime() - input.publishedAt.getTime()) / ONE_DAY_MS
    : input.days;
  const normalizedAgeDays = Math.min(
    Math.max(ageDays, MIN_VELOCITY_WINDOW_DAYS),
    Math.max(input.days, MIN_VELOCITY_WINDOW_DAYS),
  );
  return Math.round(input.latestViewCount / normalizedAgeDays);
}

function byShortsGrowthDesc(a: ShortsPeriodAggregate, b: ShortsPeriodAggregate): number {
  const growthDelta = (b.dailyViewGrowth ?? -1) - (a.dailyViewGrowth ?? -1);
  if (growthDelta !== 0) return growthDelta;

  const viewDelta = (b.viewDelta ?? -1) - (a.viewDelta ?? -1);
  if (viewDelta !== 0) return viewDelta;

  const totalViewDelta = (b.latest.viewCount ?? -1) - (a.latest.viewCount ?? -1);
  if (totalViewDelta !== 0) return totalViewDelta;

  const rankDelta = a.bestRank - b.bestRank;
  if (rankDelta !== 0) return rankDelta;
  return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
}

function latestCapturedAt(rows: Array<{ capturedAt: Date }>): string | null {
  if (rows.length === 0) return null;
  return new Date(Math.max(...rows.map((row) => row.capturedAt.getTime()))).toISOString();
}

function rowsFromLatestCapture<T extends { capturedAt: Date }>(rows: T[]): T[] {
  if (rows.length === 0) return [];
  const latestCapturedAtMs = Math.max(...rows.map((row) => row.capturedAt.getTime()));
  return rows.filter((row) => row.capturedAt.getTime() === latestCapturedAtMs);
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function maxBusinessDateMs(
  rows: Array<{ businessDate: Date }>,
): number {
  return rows.reduce((max, row) => Math.max(max, row.businessDate.getTime()), Number.NEGATIVE_INFINITY);
}

function minBusinessDateMs(
  rows: Array<{ businessDate: Date }>,
): number {
  return rows.reduce((min, row) => Math.min(min, row.businessDate.getTime()), Number.POSITIVE_INFINITY);
}

function byBusinessDateAsc(a: { businessDate: Date }, b: { businessDate: Date }): number {
  return a.businessDate.getTime() - b.businessDate.getTime();
}

function riserOrder(a: PopularKeywordRiser, b: PopularKeywordRiser): number {
  const deltaA = a.rankDelta ?? Number.POSITIVE_INFINITY;
  const deltaB = b.rankDelta ?? Number.POSITIVE_INFINITY;
  return deltaB - deltaA;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDateStringFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
