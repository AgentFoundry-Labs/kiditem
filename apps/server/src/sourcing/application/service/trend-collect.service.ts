import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  SOURCING_1688_KEYWORD_SEARCH_PORT,
  type Sourcing1688KeywordSearchPort,
} from '../port/out/provider/1688-keyword-search.port';
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
  type NaverDatalabPopularKeywordPort,
  type NaverDatalabPopularKeywordBoardKey,
  type NaverDatalabTrendPort,
  type NaverKeywordResearchPort,
} from '../port/out/provider/naver-keyword-research.port';
import {
  SHORTSTREND_TREND_PORT,
  type ShortstrendTrendItem,
  type ShortstrendTrendPort,
} from '../port/out/provider/shortstrend-trend.port';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type NaverKeywordSnapshotUpsert,
  type NaverPopularKeywordSnapshotUpsert,
  type Sourcing1688HotProductSnapshotUpsert,
  type ShortsSnapshotUpsert,
  type TrendCollectionRepositoryPort,
  type TrendSeedRow,
  type UpdateTrendSeedInput,
  type UpsertTrendSeedInput,
} from '../port/out/repository/trend-collection.repository.port';
import {
  DEFAULT_STATIONERY_TOY_TREND_SEEDS,
  DOUYIN_TREND_TOY_STATIONERY_SEEDS,
} from '../../domain/stationery-toy-trend';

const TREND_SOURCE_ORDER = ['naver', '1688', 'shorts'] as const;
export type TrendCollectSource = (typeof TREND_SOURCE_ORDER)[number];

const DEFAULT_POPULAR_BOARD_KEYS: NaverDatalabPopularKeywordBoardKey[] = [
  'birth_kids',
  'toys_dolls',
  'stationery_office',
];

const NAVER_SEARCHAD_BATCH_SIZE = 5;
const NAVER_DATALAB_BATCH_SIZE = 50;
const ONE_1688_MAX_RESULTS_PER_SEED = 20;
const MAX_1688_OFFERS_PER_RUN = 200;
const MAX_EXTENSION_1688_TARGETS = 20;
const SHORTS_LIMIT = 50;
const SHORTS_COLLECTION_WINDOW_DAYS = 30;

export interface TrendSourceCollectResult {
  source: TrendCollectSource;
  ok: boolean;
  collected: number;
  error?: string;
}

export interface TrendCollectResult {
  businessDate: string;
  results: TrendSourceCollectResult[];
}

export interface Extension1688TrendBatchInput {
  runId: string;
  keywords: Array<{
    keyword: string;
    items: Array<{
      offerId: string;
      title?: string;
      priceCny?: number;
      monthlySales?: number;
      repurchaseRate?: string;
      tradeScore?: number;
      supplierName?: string;
      imageUrl?: string;
      sourceUrl?: string;
      rank?: number;
    }>;
  }>;
  errors?: Array<{ keyword: string; message: string }>;
}

export interface Extension1688TrendBatchResult {
  businessDate: string;
  collected: number;
  errors: Array<{ keyword: string; message: string }>;
}

export interface Extension1688TrendTarget {
  label: string;
  keyword: string;
}

@Injectable()
export class TrendCollectService {
  constructor(
    @Inject(SOURCING_NAVER_KEYWORD_RESEARCH_PORT)
    private readonly keywordResearch: NaverKeywordResearchPort,
    @Inject(SOURCING_NAVER_DATALAB_TREND_PORT)
    private readonly datalabTrend: NaverDatalabTrendPort,
    @Inject(SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT)
    private readonly popularKeywords: NaverDatalabPopularKeywordPort,
    @Inject(SOURCING_1688_KEYWORD_SEARCH_PORT)
    private readonly keywordSearch1688: Sourcing1688KeywordSearchPort,
    @Inject(SHORTSTREND_TREND_PORT)
    private readonly shortstrend: ShortstrendTrendPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly repository: TrendCollectionRepositoryPort,
  ) {}

  listSeeds(organizationId: string): Promise<TrendSeedRow[]> {
    return this.repository.listSeeds(organizationId);
  }

  upsertSeed(input: UpsertTrendSeedInput): Promise<TrendSeedRow> {
    return this.repository.upsertSeedByKeyword(input);
  }

  updateSeed(input: UpdateTrendSeedInput): Promise<TrendSeedRow> {
    return this.repository.updateSeed(input);
  }

  deleteSeed(input: { id: string; organizationId: string }): Promise<void> {
    return this.repository.deleteSeed(input);
  }

  async list1688Targets(organizationId: string): Promise<Extension1688TrendTarget[]> {
    const seeds = await this.repository.listSeeds(organizationId);
    return collectionSeedsFor(
      seeds.filter((seed) => seed.enabled),
      '1688',
    )
      .slice(0, MAX_EXTENSION_1688_TARGETS)
      .map((seed) => ({
        label: seed.keyword,
        keyword: seed.keywordCn?.trim() || seed.keyword,
      }));
  }

  async ingest1688ExtensionResults(
    organizationId: string,
    input: Extension1688TrendBatchInput,
  ): Promise<Extension1688TrendBatchResult> {
    const capturedAt = new Date();
    const businessDate = kstBusinessDate(capturedAt);
    const seenOfferIds = new Set<string>();
    const rows: Sourcing1688HotProductSnapshotUpsert[] = [];

    for (const keywordResult of input.keywords) {
      const sourceKeyword = keywordResult.keyword.trim();
      keywordResult.items.forEach((item, index) => {
        const offerId = item.offerId.trim();
        if (!offerId || seenOfferIds.has(offerId)) return;
        seenOfferIds.add(offerId);
        rows.push({
          organizationId,
          businessDate,
          offerId,
          sourceKeyword,
          rank: item.rank ?? index + 1,
          title: optionalText(item.title),
          priceCny: item.priceCny ?? null,
          monthlySales: toInt(item.monthlySales),
          repurchaseRate: optionalText(item.repurchaseRate),
          tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
          supplierName: optionalText(item.supplierName),
          imageUrl: optionalText(item.imageUrl),
          sourceUrl: optionalText(item.sourceUrl),
          capturedAt,
        });
      });
    }

    const collected = await this.repository.upsert1688HotProductSnapshots(rows);
    return {
      businessDate: toDateString(businessDate),
      collected,
      errors: (input.errors ?? []).map((error) => ({
        keyword: error.keyword.trim(),
        message: error.message.trim(),
      })),
    };
  }

  async collect(organizationId: string, sources?: TrendCollectSource[]): Promise<TrendCollectResult> {
    const capturedAt = new Date();
    const businessDate = kstBusinessDate(capturedAt);
    const requested = normalizeSources(sources);

    const seeds = await this.repository.listSeeds(organizationId);
    const enabledSeeds = seeds.filter((seed) => seed.enabled);

    const results: TrendSourceCollectResult[] = [];
    for (const source of requested) {
      if (source === 'naver') {
        results.push(
          await this.safe('naver', () =>
            this.collectNaver(organizationId, enabledSeeds, businessDate, capturedAt),
          ),
        );
      } else if (source === '1688') {
        results.push(
          await this.safe('1688', () =>
            this.collect1688(organizationId, enabledSeeds, businessDate, capturedAt),
          ),
        );
      } else if (source === 'shorts') {
        results.push(
          await this.safe('shorts', () =>
            this.collectShorts(organizationId, enabledSeeds, businessDate, capturedAt),
          ),
        );
      }
    }

    return { businessDate: toDateString(businessDate), results };
  }

  private async safe(
    source: TrendCollectSource,
    fn: () => Promise<TrendSourceCollectResult>,
  ): Promise<TrendSourceCollectResult> {
    try {
      return await fn();
    } catch (error) {
      return { source, ok: false, collected: 0, error: errorMessage(error) };
    }
  }

  private async collectNaver(
    organizationId: string,
    enabledSeeds: TrendSeedRow[],
    businessDate: Date,
    capturedAt: Date,
  ): Promise<TrendSourceCollectResult> {
    const errors: string[] = [];
    let collected = 0;

    try {
      const naverSeeds = enabledSeeds.filter((seed) => seed.sources.includes('naver'));
      const rows = await this.buildNaverKeywordRows(organizationId, naverSeeds, businessDate, capturedAt);
      collected += await this.repository.upsertNaverKeywordSnapshots(rows);
    } catch (error) {
      errors.push(`naver-keywords: ${errorMessage(error)}`);
    }

    try {
      const popularRows = await this.buildPopularBoardRows(organizationId, businessDate, capturedAt);
      collected += await this.repository.replaceNaverPopularKeywordSnapshots(popularRows);
    } catch (error) {
      errors.push(`naver-popular: ${errorMessage(error)}`);
    }

    return {
      source: 'naver',
      ok: errors.length === 0,
      collected,
      error: errors.length ? errors.join('; ') : undefined,
    };
  }

  private async buildNaverKeywordRows(
    organizationId: string,
    naverSeeds: TrendSeedRow[],
    businessDate: Date,
    capturedAt: Date,
  ): Promise<NaverKeywordSnapshotUpsert[]> {
    if (naverSeeds.length === 0) return [];

    const rows: NaverKeywordSnapshotUpsert[] = naverSeeds.map((seed) => ({
      organizationId,
      keyword: seed.keyword,
      businessDate,
      monthlyTotalSearchCount: null,
      monthlyPcSearchCount: null,
      monthlyMobileSearchCount: null,
      competitionIndex: null,
      averageAdRank: null,
      trendRatio: null,
      trendDelta: null,
      capturedAt,
    }));

    const byNormalizedKeyword = new Map<string, NaverKeywordSnapshotUpsert>();
    naverSeeds.forEach((seed, index) => {
      byNormalizedKeyword.set(normalizeMatch(seed.keyword), rows[index]);
    });

    for (const chunk of chunkArray(naverSeeds, NAVER_SEARCHAD_BATCH_SIZE)) {
      const result = await this.keywordResearch.searchRelatedKeywords({
        seedKeywords: chunk.map((seed) => seed.keyword),
        maxResults: 100,
      });
      for (const item of result.items ?? []) {
        const row = byNormalizedKeyword.get(normalizeMatch(item.keyword));
        if (!row) continue;
        row.monthlyTotalSearchCount = toInt(item.monthlyTotalSearchCount);
        row.monthlyPcSearchCount = toInt(item.monthlyPcSearchCount);
        row.monthlyMobileSearchCount = toInt(item.monthlyMobileSearchCount);
        row.competitionIndex = item.competitionIndex ?? null;
        row.averageAdRank = toInt(item.averageAdRank);
      }
    }

    // 데이터랩 트렌드는 검색광고 월검색량을 보강(enrich)하는 best-effort 단계다.
    // 데이터랩이 실패해도 이미 채워진 SearchAd 데이터는 버리지 않고 저장한다.
    try {
      for (const chunk of chunkArray(naverSeeds.map((seed) => seed.keyword), NAVER_DATALAB_BATCH_SIZE)) {
        const result = await this.datalabTrend.compareSearchTrends({ keywords: chunk });
        for (const item of result.items ?? []) {
          const row = byNormalizedKeyword.get(normalizeMatch(item.keyword));
          if (!row) continue;
          row.trendRatio = clampRatio(roundOrNull(item.latestRatio));
          row.trendDelta = roundOrNull(item.trendDelta);
        }
      }
    } catch {
      // 트렌드 보강 실패는 무시(검색량 스냅샷은 유지). 소스별 결과는 상위에서 집계.
    }

    return rows;
  }

  private async buildPopularBoardRows(
    organizationId: string,
    businessDate: Date,
    capturedAt: Date,
  ): Promise<NaverPopularKeywordSnapshotUpsert[]> {
    const result = await this.popularKeywords.searchPopularKeywords({
      boardKeys: DEFAULT_POPULAR_BOARD_KEYS,
    });

    const rows: NaverPopularKeywordSnapshotUpsert[] = [];
    const seen = new Set<string>();
    for (const board of result.boards ?? []) {
      if (board.error) continue;
      for (const entry of board.ranks ?? []) {
        const keyword = typeof entry.keyword === 'string' ? entry.keyword.trim() : '';
        if (!keyword) continue;
        const dedupeKey = `${board.key} ${keyword}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        rows.push({
          organizationId,
          boardKey: board.key,
          boardLabel: board.label ?? null,
          cid: board.cid == null ? null : String(board.cid),
          businessDate,
          rank: entry.rank,
          keyword,
          linkId: entry.linkId ?? null,
          capturedAt,
        });
      }
    }
    return rows;
  }

  private async collect1688(
    organizationId: string,
    enabledSeeds: TrendSeedRow[],
    businessDate: Date,
    capturedAt: Date,
  ): Promise<TrendSourceCollectResult> {
    const seeds = collectionSeedsFor(enabledSeeds, '1688');
    const rows: Sourcing1688HotProductSnapshotUpsert[] = [];
    const seenOfferIds = new Set<string>();
    const errors: string[] = [];

    for (const seed of seeds) {
      if (rows.length >= MAX_1688_OFFERS_PER_RUN) break;
      const keyword = seed.keywordCn?.trim() || seed.keyword;

      let items;
      try {
        const result = await this.keywordSearch1688.searchByKeyword({
          keyword,
          maxResults: ONE_1688_MAX_RESULTS_PER_SEED,
        });
        items = [...(result.items ?? [])]
          .filter((item) => item && item.offerId)
          .sort((a, b) => (b.monthlySales ?? 0) - (a.monthlySales ?? 0));
      } catch (error) {
        const message = errorMessage(error);
        errors.push(`${seed.keyword}: ${message}`);
        if (isBlocking1688CollectionError(message)) break;
        continue;
      }

      if (items.length === 0) {
        errors.push(`${seed.keyword}: 1688 검색 결과 0건`);
        continue;
      }

      items.forEach((item, index) => {
        if (rows.length >= MAX_1688_OFFERS_PER_RUN) return;
        const offerId = item.offerId as string;
        if (seenOfferIds.has(offerId)) return;
        seenOfferIds.add(offerId);
        rows.push({
          organizationId,
          businessDate,
          offerId,
          sourceKeyword: seed.keyword,
          rank: index + 1,
          title: item.title ?? null,
          priceCny: item.priceCny ?? null,
          monthlySales: toInt(item.monthlySales),
          repurchaseRate: item.repurchaseRate ?? null,
          tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
          supplierName: item.supplierName ?? null,
          imageUrl: item.imageUrl ?? null,
          sourceUrl: item.sourceUrl ?? null,
          capturedAt,
        });
      });
    }

    const collected = await this.repository.upsert1688HotProductSnapshots(rows);
    return {
      source: '1688',
      ok: errors.length === 0,
      collected,
      error: errors.length ? errors.join('; ') : undefined,
    };
  }

  private async collectShorts(
    organizationId: string,
    enabledSeeds: TrendSeedRow[],
    businessDate: Date,
    capturedAt: Date,
  ): Promise<TrendSourceCollectResult> {
    const seeds = collectionSeedsFor(enabledSeeds, 'shorts');
    const result = await this.shortstrend.fetchTrending({
      keywords: seeds.map((seed) => seed.keyword),
      limit: SHORTS_LIMIT,
      publishedWithinDays: SHORTS_COLLECTION_WINDOW_DAYS,
    });

    if (result.error) {
      return { source: 'shorts', ok: false, collected: 0, error: result.error };
    }

    const rows = buildShortsRows(organizationId, result.items ?? [], businessDate, capturedAt);
    const collected = await this.repository.upsertShortsSnapshots(rows);
    return { source: 'shorts', ok: true, collected };
  }
}

interface CollectionSeed {
  keyword: string;
  keywordCn: string | null;
}

function collectionSeedsFor(
  enabledSeeds: TrendSeedRow[],
  source: '1688' | 'shorts',
): CollectionSeed[] {
  const configured = enabledSeeds
    .filter((seed) => seed.sources.includes(source))
    .map((seed) => ({ keyword: seed.keyword, keywordCn: seed.keywordCn }));
  // 도우인 트렌드 큐레이션 키워드는 1688 핫셀링 수집에만 추가로 태운다(naver/shorts 영향 없음).
  const baseline = [
    ...DEFAULT_STATIONERY_TOY_TREND_SEEDS,
    ...(source === '1688' ? DOUYIN_TREND_TOY_STATIONERY_SEEDS : []),
  ].map((seed) => ({
    keyword: seed.keyword,
    keywordCn: seed.keywordCn,
  }));
  const seen = new Set<string>();
  const result: CollectionSeed[] = [];
  for (const seed of [...configured, ...baseline]) {
    const sourceKeyword = source === '1688' ? seed.keywordCn?.trim() || seed.keyword : seed.keyword;
    const key = normalizeMatch(sourceKeyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(seed);
  }
  return result;
}

function isBlocking1688CollectionError(message: string): boolean {
  return /로그인|슬라이더|검증|USER_VALIDATE|verification|검색 결과가 0건/i.test(message);
}

function buildShortsRows(
  organizationId: string,
  items: ShortstrendTrendItem[],
  businessDate: Date,
  capturedAt: Date,
): ShortsSnapshotUpsert[] {
  const rows: ShortsSnapshotUpsert[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const videoKey = typeof item.videoKey === 'string' ? item.videoKey.trim() : '';
    if (!videoKey || seen.has(videoKey)) continue;
    seen.add(videoKey);
    rows.push({
      organizationId,
      businessDate,
      videoKey,
      rank: toInt(item.rank),
      title: item.title ?? null,
      channelName: item.channelName ?? null,
      viewCount: toInt(item.viewCount),
      likeCount: toInt(item.likeCount),
      commentCount: toInt(item.commentCount),
      keyword: item.keyword ?? null,
      publishedAt: parseTimestamp(item.publishedAt),
      thumbnailUrl: item.thumbnailUrl ?? null,
      videoUrl: item.videoUrl ?? null,
      capturedAt,
    });
  }
  return rows;
}

function normalizeSources(sources?: TrendCollectSource[]): TrendCollectSource[] {
  if (!sources || sources.length === 0) return [...TREND_SOURCE_ORDER];
  const requested = new Set(sources);
  return TREND_SOURCE_ORDER.filter((source) => requested.has(source));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeMatch(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function toInt(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function roundOrNull(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function clampRatio(value: number | null): number | null {
  if (value == null) return null;
  return Math.max(0, Math.min(100, value));
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
