import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
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
import {
  hashCollectionRequest,
  mapTrendTypedRecordsToAuthorizedOutput,
} from './sourcing-collection-mappers';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptRepositoryPort,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import type {
  TrendCollectionControls,
  TrendCollectionPort,
} from '../port/in/trend-collection.port';

const TREND_SOURCE_ORDER = ['naver', '1688', 'shorts'] as const;
export type TrendCollectSource = (typeof TREND_SOURCE_ORDER)[number];

const DEFAULT_POPULAR_BOARD_KEYS: NaverDatalabPopularKeywordBoardKey[] = [
  'birth_kids',
  'toys_dolls',
  'stationery_office',
];

const NAVER_SEARCHAD_BATCH_SIZE = 5;
const NAVER_DATALAB_BATCH_SIZE = 50;
// 검색광고 월검색량을 조회할 키워드 상한(시드 + 인기보드 상위 키워드). 배치 5개 기준 콜 수 제어용.
const NAVER_KEYWORD_VOLUME_LIMIT = 60;
const MAX_EXTENSION_1688_TARGETS = 20;
const MAX_TIKTOK_CC_TARGETS = 20;
const SHORTS_LIMIT = 50;
const SHORTS_COLLECTION_WINDOW_DAYS = 30;

export interface TrendSourceCollectResult {
  source: TrendCollectSource;
  ok: boolean;
  collected: number;
  error?: string;
  attemptId?: string;
  state?: 'RUNNING' | 'COMPLETE' | 'FAILED';
  actualCutoffAt?: string | null;
}

export interface TrendCollectResult {
  businessDate: string;
  results: TrendSourceCollectResult[];
}

export interface Extension1688TrendTarget {
  label: string;
  keyword: string;
}

/** Raw legacy seeds; the TikTok owner freezes extension-equivalent normalization. */
export interface TiktokCcTrendTarget {
  label: string;
  keyword: string;
}

@Injectable()
export class TrendCollectService implements TrendCollectionPort {
  constructor(
    @Inject(SOURCING_NAVER_KEYWORD_RESEARCH_PORT)
    private readonly keywordResearch: NaverKeywordResearchPort,
    @Inject(SOURCING_NAVER_DATALAB_TREND_PORT)
    private readonly datalabTrend: NaverDatalabTrendPort,
    @Inject(SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT)
    private readonly popularKeywords: NaverDatalabPopularKeywordPort,
    @Inject(SHORTSTREND_TREND_PORT)
    private readonly shortstrend: ShortstrendTrendPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly repository: TrendCollectionRepositoryPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
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

  async listTiktokCcTargets(organizationId: string): Promise<TiktokCcTrendTarget[]> {
    const seeds = await this.repository.listSeeds(organizationId);
    return seeds
      .filter((seed) => seed.enabled && seed.sources.includes('tiktok-cc'))
      .slice(0, MAX_TIKTOK_CC_TARGETS)
      .map((seed) => ({ label: seed.keyword, keyword: seed.keyword }));
  }

  async status(organizationId: string, source: 'naver' | 'shorts') {
    const seeds = (await this.repository.listSeeds(organizationId)).filter((seed) => seed.enabled);
    const { capturedAt: _capturedAt, ...coverage } = trendPlan(source, seeds, new Date());
    const checksum = hashCollectionRequest(coverage);
    const query = { organizationId, sourceKey: coverage.source, scopeKey: 'default',
      targetKey: checksum, currentPlanChecksum: checksum };
    const current = await this.attempts.readSourceStatus(query);
    if (current.latestComplete) return current;
    const previousTarget = await this.repository.findLatestCompleteTrendScope({ organizationId, source });
    if (!previousTarget) return current;
    const previous = await this.attempts.readSourceStatus({ ...query, targetKey: previousTarget });
    if (!previous.latestComplete) return current;
    return { ...(current.latestAttempt ? current : previous), ready: false,
      latestComplete: previous.latestComplete, actualCutoffAt: previous.actualCutoffAt };
  }

  async collect(
    organizationId: string,
    sources?: TrendCollectSource[],
    triggeredByUserId?: string | null,
    collectionRunKey?: string,
    signal?: AbortSignal,
  ): Promise<TrendCollectResult> {
    signal?.throwIfAborted();
    const capturedAt = new Date();
    const seeds = (await this.repository.listSeeds(organizationId)).filter((seed) => seed.enabled);
    const results = [];
    for (const source of normalizeSources(sources)) {
      try {
        results.push(await this.executeSource(organizationId, source, seeds, capturedAt, triggeredByUserId, collectionRunKey, signal));
      } catch (error) {
        signal?.throwIfAborted();
        results.push({ businessDate: toDateString(kstBusinessDate(capturedAt)), source, ok: false,
          collected: 0, error: errorMessage(error) });
      }
    }
    return { businessDate: results[0]?.businessDate ?? toDateString(kstBusinessDate(new Date())),
      results: results.map(({ businessDate: _businessDate, ...result }) => result) };
  }

  async collectSource(
    organizationId: string,
    source: TrendCollectSource,
    triggeredByUserId?: string | null,
    collectionRunKey?: string,
    controls: TrendCollectionControls = {},
  ): Promise<TrendSourceCollectResult & { businessDate: string }> {
    controls.signal?.throwIfAborted();
    const capturedAt = new Date();
    const seeds = (await this.repository.listSeeds(organizationId)).filter((seed) => seed.enabled);
    return this.executeSource(organizationId, source, seeds, capturedAt, triggeredByUserId, collectionRunKey, controls.signal);
  }

  private async executeSource(organizationId: string, source: TrendCollectSource, seeds: TrendSeedRow[],
    capturedAt: Date, triggeredByUserId?: string | null, collectionRunKey?: string, signal?: AbortSignal,
  ): Promise<TrendSourceCollectResult & { businessDate: string }> {
    signal?.throwIfAborted();
    const businessDate = toDateString(kstBusinessDate(capturedAt));
    if (source === '1688') return { businessDate, ...browserOwned1688Result() };
    const plan = trendPlan(source, seeds, capturedAt);
    const { capturedAt: _capturedAt, ...coverage } = plan;
    const planChecksum = hashCollectionRequest(coverage);
    const failureAlert = trendFailureAlert(plan.source);
    const { attempt, created } = await this.attempts.beginAttempt({
      organizationId, sourceKey: plan.source, scopeKey: 'default', targetKey: planChecksum,
      idempotencyKey: requireIdempotencyKey(collectionRunKey ?? ''),
      requestFingerprint: hashCollectionRequest({ source }), plan, planChecksum,
      requestedByUserId: triggeredByUserId ?? null, collectorKey: 'trend-' + source,
      collectorVersion: 'trend-source/v1', expiresInMs: 15 * 60_000, triggerKind: 'manual', failureAlert,
    });
    if (!created) return trendResult(source, attempt);
    try {
      const frozen = attempt.plan as typeof plan;
      const observedAt = new Date(frozen.capturedAt);
      const day = new Date(frozen.businessDate);
      const permit = toPermit(attempt, organizationId);
      const output = source === 'naver'
        ? await this.collectNaver(organizationId, frozen.keywords, day, observedAt, permit, signal)
        : await this.collectShorts(organizationId, frozen.keywords, day, observedAt, permit, signal);
      signal?.throwIfAborted();
      const complete = await this.attempts.completeAttempt({ organizationId, attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken, planChecksum: attempt.planChecksum,
        contentChecksum: hashCollectionRequest(output), output,
        sourceWindowStartAt: day, sourceWindowEndAt: observedAt });
      return trendResult(source, complete);
    } catch (error) {
      const failed = await this.attempts.failAttempt({ organizationId, attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken, code: signal?.aborted ? 'SOURCE_COLLECTION_CANCELLED' : 'SOURCE_COLLECTION_FAILED',
        message: errorMessage(error) });
      signal?.throwIfAborted();
      return trendResult(source, failed);
    }
  }

  private async collectNaver(
    organizationId: string, seedKeywords: string[], businessDate: Date, capturedAt: Date,
    permit: import('../port/out/repository/sourcing-collection.repository.port').SourcingCollectionPermit,
    signal?: AbortSignal,
  ) {
    const errors: string[] = [];
    let popularRows: NaverPopularKeywordSnapshotUpsert[] = [];
    let keywordRows: NaverKeywordSnapshotUpsert[] = [];
    try {
      popularRows = await this.buildPopularBoardRows(organizationId, businessDate, capturedAt, signal, errors);
    } catch (error) {
      signal?.throwIfAborted();
      errors.push('naver-popular: ' + errorMessage(error));
    }
    try {
      const popularKeywords = [...popularRows].sort((a, b) => a.rank - b.rank).map((row) => row.keyword);
      const keywords = dedupeKeywords([...seedKeywords, ...popularKeywords]).slice(0, NAVER_KEYWORD_VOLUME_LIMIT);
      keywordRows = await this.buildNaverKeywordRows(organizationId, keywords, businessDate, capturedAt, signal);
    } catch (error) {
      signal?.throwIfAborted();
      errors.push('naver-keywords: ' + errorMessage(error));
    }
    if (errors.length) throw new Error(errors.join('; '));
    return mapTrendTypedRecordsToAuthorizedOutput({ permit,
      typedRecords: [...popularRows.map((row) => ({ kind: 'naver_popular_keyword' as const, row })),
        ...keywordRows.map((row) => ({ kind: 'naver_keyword' as const, row }))],
      qualityReport: { source: 'naver', completeSnapshot: true },
    });
  }

  private async buildNaverKeywordRows(
    organizationId: string,
    keywords: string[],
    businessDate: Date,
    capturedAt: Date,
    signal?: AbortSignal,
  ): Promise<NaverKeywordSnapshotUpsert[]> {
    if (keywords.length === 0) return [];

    const rows: NaverKeywordSnapshotUpsert[] = keywords.map((keyword) => ({
      organizationId,
      keyword,
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
    keywords.forEach((keyword, index) => {
      byNormalizedKeyword.set(normalizeMatch(keyword), rows[index]);
    });

    const searchAdChunks = chunkArray(keywords, NAVER_SEARCHAD_BATCH_SIZE);
    const searchAdResults = await mapWithConcurrency(
      searchAdChunks,
      2,
      async (chunk, index) => {
        signal?.throwIfAborted();
        signal?.throwIfAborted();
        const result = await this.keywordResearch.searchRelatedKeywords({
          seedKeywords: chunk,
          maxResults: 100,
          signal,
        });
        signal?.throwIfAborted();
        return result;
      },
      signal,
    );
    for (const result of searchAdResults) {
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
    signal?.throwIfAborted();

    {
      const datalabChunks = chunkArray(keywords, NAVER_DATALAB_BATCH_SIZE);
      const datalabResults = await mapWithConcurrency(
        datalabChunks,
        2,
        async (chunk, index) => {
          signal?.throwIfAborted();
          signal?.throwIfAborted();
          const result = await this.datalabTrend.compareSearchTrends({
            keywords: chunk,
            signal,
          });
          signal?.throwIfAborted();
          return result;
        },
        signal,
      );
      for (const result of datalabResults) {
        for (const item of result.items ?? []) {
          const row = byNormalizedKeyword.get(normalizeMatch(item.keyword));
          if (!row) continue;
          row.trendRatio = clampRatio(roundOrNull(item.latestRatio));
          row.trendDelta = roundOrNull(item.trendDelta);
        }
      }
      signal?.throwIfAborted();
    }

    return rows;
  }

  private async buildPopularBoardRows(
    organizationId: string,
    businessDate: Date,
    capturedAt: Date,
    signal?: AbortSignal,
    errors: string[] = [],
  ): Promise<NaverPopularKeywordSnapshotUpsert[]> {
    signal?.throwIfAborted();
    const result = await this.popularKeywords.searchPopularKeywords({
      boardKeys: DEFAULT_POPULAR_BOARD_KEYS,
      signal,
    });
    signal?.throwIfAborted();

    const rows: NaverPopularKeywordSnapshotUpsert[] = [];
    const seen = new Set<string>();
    for (const board of result.boards ?? []) {
      if (board.error) { errors.push('naver-popular: ' + board.error); continue; }
      for (const entry of board.ranks ?? []) {
        const keyword = typeof entry.keyword === 'string' ? entry.keyword.trim() : '';
        if (!keyword) continue;
        const dedupeKey = `${board.key}\u0000${keyword}`;
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

  private async collectShorts(
    organizationId: string, keywords: string[], businessDate: Date, capturedAt: Date,
    permit: import('../port/out/repository/sourcing-collection.repository.port').SourcingCollectionPermit,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const result = await this.shortstrend.fetchTrending({ keywords, limit: SHORTS_LIMIT,
      publishedWithinDays: SHORTS_COLLECTION_WINDOW_DAYS, signal });
    signal?.throwIfAborted();
    if (result.error) throw new Error(result.error);
    const rows = buildShortsRows(organizationId, result.items ?? [], businessDate, capturedAt);
    return mapTrendTypedRecordsToAuthorizedOutput({ permit,
      typedRecords: rows.map((row) => ({ kind: 'shorts' as const, row })),
      qualityReport: { source: 'shorts', completeSnapshot: true },
    });
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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      signal?.throwIfAborted();
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
      signal?.throwIfAborted();
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, Math.floor(concurrency)), items.length) },
      () => worker(),
    ),
  );
  return results;
}

function normalizeMatch(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = normalizeMatch(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
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

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function browserOwned1688Result(): TrendSourceCollectResult {
  return {
    source: '1688',
    ok: false,
    collected: 0,
    error: '1688_browser_operation_required',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trendFailureAlert(sourceKey: string) {
  return { sourceType: sourceKey, dedupeKey: 'source:' + sourceKey,
    title: sourceKey === 'naver.trend' ? '네이버 트렌드 수집 실패' : '쇼츠 트렌드 수집 실패',
    href: '/sourcing-ai/market' };
}

function trendResult(source: TrendCollectSource, attempt: SourcingBrowserSourceAttempt) {
  return { source, businessDate: String(attempt.plan.businessDate), attemptId: attempt.attemptId,
    state: attempt.state, ok: attempt.state === 'COMPLETE', collected: attempt.acceptedCount,
    actualCutoffAt: attempt.state === 'COMPLETE' ? String(attempt.plan.capturedAt) : null,
    ...(attempt.errorMessage ? { error: attempt.errorMessage } : {}),
  };
}

function trendPlan(source: 'naver' | 'shorts', seeds: TrendSeedRow[], capturedAt: Date) {
  const businessDate = toDateString(kstBusinessDate(capturedAt));
  return { source: source === 'naver' ? 'naver.trend' : 'shortstrend.trend',
      businessDate, capturedAt: capturedAt.toISOString(),
      keywords: source === 'naver' ? seeds.filter((seed) => seed.sources.includes('naver')).map((seed) => seed.keyword)
        : collectionSeedsFor(seeds, 'shorts').map((seed) => seed.keyword),
      ...(source === 'naver' ? { boardKeys: DEFAULT_POPULAR_BOARD_KEYS }
        : { limit: SHORTS_LIMIT, publishedWithinDays: SHORTS_COLLECTION_WINDOW_DAYS }),
    };
}
