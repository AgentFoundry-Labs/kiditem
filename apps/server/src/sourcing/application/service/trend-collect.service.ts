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
  type Sourcing1688OfferKeywordObservationInput,
  type ShortsSnapshotUpsert,
  type TiktokCcSnapshotUpsert,
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
  map1688HotProductsToAuthorizedOutput,
  mapTrendTypedRecordsToAuthorizedOutput,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';
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

export interface TiktokCcTrendBatchInput {
  runId: string;
  region: string;
  items: Array<{
    trendType: string;
    entityKey: string;
    label?: string;
    industry?: string;
    sourceKeyword?: string;
    rank?: number;
    postCount?: number;
    viewCount?: number;
    growthPct?: number;
    thumbnailUrl?: string;
    sourceUrl?: string;
  }>;
  errors?: Array<{ target: string; message: string }>;
}

export interface TiktokCcTrendBatchResult {
  businessDate: string;
  collected: number;
  errors: Array<{ target: string; message: string }>;
}

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
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
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
    const seenKeywordOffers = new Set<string>();
    const rows: Sourcing1688OfferKeywordObservationInput[] = [];

    for (const keywordResult of input.keywords) {
      const sourceKeyword = keywordResult.keyword.trim();
      keywordResult.items.forEach((item, index) => {
        const offerId = item.offerId.trim();
        if (!sourceKeyword || !offerId) return;
        const identity = `${normalizeCollectionTarget(sourceKeyword)}\u001f${offerId}`;
        if (seenKeywordOffers.has(identity)) return;
        seenKeywordOffers.add(identity);
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

    const execution = await this.collectionCoordinator.execute(
      collectionRequest({
        organizationId,
        sourceKey: '1688.hot_product',
        targetKey: `extension:${input.runId.trim()}`,
        idempotencyKey: `extension-1688:${input.runId.trim()}`,
        requestHash: hashCollectionRequest(input),
        collectorKey: 'extension-1688-trend',
        triggerKind: 'extension',
      }),
      async ({ permit, checkpoint }) => {
        await checkpoint();
        return map1688HotProductsToAuthorizedOutput({ permit, rows });
      },
    );
    return {
      businessDate: toDateString(businessDate),
      collected: collectedFromExecution(execution),
      errors: (input.errors ?? []).map((error) => ({
        keyword: error.keyword.trim(),
        message: error.message.trim(),
      })),
    };
  }

  // 틱톡 크리에이티브 센터는 봇/리전 차단이라 서버 fetch 대신 확장 스크랩으로만 적재한다.
  // 확장이 'tiktok-cc' 시드 키워드/카테고리 기준으로 스크랩할 대상 목록을 돌려준다.
  async listTiktokCcTargets(organizationId: string): Promise<TiktokCcTrendTarget[]> {
    const seeds = await this.repository.listSeeds(organizationId);
    return seeds
      .filter((seed) => seed.enabled && seed.sources.includes('tiktok-cc'))
      .slice(0, MAX_TIKTOK_CC_TARGETS)
      .map((seed) => ({ label: seed.keyword, keyword: seed.keyword }));
  }

  async ingestTiktokCcResults(
    organizationId: string,
    input: TiktokCcTrendBatchInput,
  ): Promise<TiktokCcTrendBatchResult> {
    const capturedAt = new Date();
    const businessDate = kstBusinessDate(capturedAt);
    const region = input.region.trim().toUpperCase();
    const seen = new Set<string>();
    const rows: TiktokCcSnapshotUpsert[] = [];

    input.items.forEach((item, index) => {
      const trendType = item.trendType.trim();
      const entityKey = item.entityKey.trim();
      if (!trendType || !entityKey) return;
      const dedupeKey = `${trendType}::${entityKey}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push({
        organizationId,
        businessDate,
        region,
        trendType,
        entityKey,
        rank: item.rank ?? index + 1,
        label: optionalText(item.label),
        industry: optionalText(item.industry),
        sourceKeyword: optionalText(item.sourceKeyword),
        postCount: toInt(item.postCount),
        viewCount: toInt(item.viewCount),
        growthPct: item.growthPct == null ? null : item.growthPct,
        thumbnailUrl: optionalText(item.thumbnailUrl),
        sourceUrl: optionalText(item.sourceUrl),
        capturedAt,
      });
    });

    const execution = await this.collectionCoordinator.execute(
      collectionRequest({
        organizationId,
        sourceKey: 'tiktok.creative',
        targetKey: `${region}:${input.runId.trim()}`,
        idempotencyKey: `extension-tiktok:${input.runId.trim()}`,
        requestHash: hashCollectionRequest(input),
        collectorKey: 'extension-tiktok-creative',
        triggerKind: 'extension',
      }),
      async ({ permit, checkpoint }) => {
        await checkpoint();
        return mapTrendTypedRecordsToAuthorizedOutput({
          permit,
          typedRecords: rows.map((row) => ({ kind: 'tiktok_creative' as const, row })),
          qualityReport: { source: 'extension', region },
        });
      },
    );
    return {
      businessDate: toDateString(businessDate),
      collected: collectedFromExecution(execution),
      errors: (input.errors ?? []).map((error) => ({
        target: error.target.trim(),
        message: error.message.trim(),
      })),
    };
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
    const businessDate = kstBusinessDate(capturedAt);
    const requested = normalizeSources(sources);

    const seeds = await this.repository.listSeeds(organizationId);
    const enabledSeeds = seeds.filter((seed) => seed.enabled);

    const results: TrendSourceCollectResult[] = [];
    for (const source of requested) {
      signal?.throwIfAborted();
      if (source === 'naver') {
        results.push(
          await this.safe('naver', () =>
            this.collectNaver(
              organizationId,
              enabledSeeds,
              businessDate,
              capturedAt,
              triggeredByUserId ?? null,
              collectionRunKey,
              signal,
              undefined,
            ),
            signal,
          ),
        );
      } else if (source === '1688') {
        results.push(browserOwned1688Result());
      } else if (source === 'shorts') {
        results.push(
          await this.safe('shorts', () =>
            this.collectShorts(
              organizationId,
              enabledSeeds,
              businessDate,
              capturedAt,
              triggeredByUserId ?? null,
              collectionRunKey,
              signal,
              undefined,
            ),
            signal,
          ),
        );
      }
    }

    const businessDateString = toDateString(businessDate);
    return { businessDate: businessDateString, results };
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
    const businessDate = kstBusinessDate(capturedAt);
    await controls.checkpoint?.({
      stage: 'collecting_source',
      progressCurrent: 0,
      progressTotal: 1,
    });
    controls.signal?.throwIfAborted();
    const seeds = await this.repository.listSeeds(organizationId);
    controls.signal?.throwIfAborted();
    const enabledSeeds = seeds.filter((seed) => seed.enabled);
    const result = await this.safe(
      source,
      () => source === 'naver'
        ? this.collectNaver(
            organizationId,
            enabledSeeds,
            businessDate,
            capturedAt,
            triggeredByUserId ?? null,
            collectionRunKey,
            controls.signal,
            controls.checkpoint,
          )
        : source === '1688'
          ? Promise.resolve(browserOwned1688Result())
          : this.collectShorts(
              organizationId,
              enabledSeeds,
              businessDate,
              capturedAt,
              triggeredByUserId ?? null,
              collectionRunKey,
              controls.signal,
              controls.checkpoint,
            ),
      controls.signal,
    );
    controls.signal?.throwIfAborted();
    await controls.checkpoint?.({
      stage: 'finalizing_source',
      progressCurrent: 1,
      progressTotal: 1,
    });
    controls.signal?.throwIfAborted();
    return { businessDate: toDateString(businessDate), ...result };
  }

  private async safe(
    source: TrendCollectSource,
    fn: () => Promise<TrendSourceCollectResult>,
    signal?: AbortSignal,
  ): Promise<TrendSourceCollectResult> {
    try {
      return await fn();
    } catch (error) {
      signal?.throwIfAborted();
      return { source, ok: false, collected: 0, error: errorMessage(error) };
    }
  }

  private async collectNaver(
    organizationId: string,
    enabledSeeds: TrendSeedRow[],
    businessDate: Date,
    capturedAt: Date,
    triggeredByUserId: string | null,
    collectionRunKey?: string,
    signal?: AbortSignal,
    operationCheckpoint?: TrendCollectionControls['checkpoint'],
  ): Promise<TrendSourceCollectResult> {
    const errors: string[] = [];
    const execution = await this.collectionCoordinator.execute(
      collectionRequest({
        organizationId,
        sourceKey: 'naver.trend',
        targetKey: toDateString(businessDate),
        idempotencyKey: collectionIdempotencyKey(
          collectionRunKey,
          'naver',
          businessDate,
          triggeredByUserId,
        ),
        requestHash: hashCollectionRequest({
          source: 'naver',
          seeds: enabledSeeds.map((seed) => seed.keyword),
          businessDate: toDateString(businessDate),
        }),
        collectorKey: 'trend-naver',
        triggerKind: triggeredByUserId ? 'manual' : 'schedule',
        triggeredByUserId,
      }),
      async ({ permit, checkpoint }) => {
        let popularRows: NaverPopularKeywordSnapshotUpsert[] = [];
        let keywordRows: NaverKeywordSnapshotUpsert[] = [];
        await checkpoint();
        signal?.throwIfAborted();
        try {
          await operationCheckpoint?.({
            stage: 'collecting_naver_popular',
            progressCurrent: 0,
            progressTotal: 1,
          });
          signal?.throwIfAborted();
          popularRows = await this.buildPopularBoardRows(
            organizationId,
            businessDate,
            capturedAt,
            signal,
          );
          signal?.throwIfAborted();
          await operationCheckpoint?.({
            stage: 'collecting_naver_popular',
            progressCurrent: 1,
            progressTotal: 1,
          });
        } catch (error) {
          signal?.throwIfAborted();
          errors.push(`naver-popular: ${errorMessage(error)}`);
        }

        await checkpoint();
        signal?.throwIfAborted();
        try {
          const seedKeywords = enabledSeeds
            .filter((seed) => seed.sources.includes('naver'))
            .map((seed) => seed.keyword);
          const popularKeywords = [...popularRows]
            .sort((a, b) => a.rank - b.rank)
            .map((row) => row.keyword);
          const keywords = dedupeKeywords([...seedKeywords, ...popularKeywords]).slice(
            0,
            NAVER_KEYWORD_VOLUME_LIMIT,
          );
          keywordRows = await this.buildNaverKeywordRows(
            organizationId,
            keywords,
            businessDate,
            capturedAt,
            signal,
            operationCheckpoint,
          );
        } catch (error) {
          signal?.throwIfAborted();
          errors.push(`naver-keywords: ${errorMessage(error)}`);
        }
        await checkpoint();
        signal?.throwIfAborted();
        return mapTrendTypedRecordsToAuthorizedOutput({
          permit,
          typedRecords: [
            ...popularRows.map((row) => ({ kind: 'naver_popular_keyword' as const, row })),
            ...keywordRows.map((row) => ({ kind: 'naver_keyword' as const, row })),
          ],
          rejectedCount: errors.length,
          qualityReport: { source: 'naver', partialErrors: errors.length },
        });
      },
    );

    return {
      source: 'naver',
      ok: errors.length === 0,
      collected: collectedFromExecution(execution),
      error: errors.length ? errors.join('; ') : undefined,
    };
  }

  private async buildNaverKeywordRows(
    organizationId: string,
    keywords: string[],
    businessDate: Date,
    capturedAt: Date,
    signal?: AbortSignal,
    operationCheckpoint?: TrendCollectionControls['checkpoint'],
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
        await operationCheckpoint?.({
          stage: 'collecting_naver_searchad',
          progressCurrent: index,
          progressTotal: searchAdChunks.length,
        });
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
    await operationCheckpoint?.({
      stage: 'collecting_naver_searchad',
      progressCurrent: searchAdChunks.length,
      progressTotal: searchAdChunks.length,
    });
    signal?.throwIfAborted();

    // 데이터랩 트렌드는 검색광고 월검색량을 보강(enrich)하는 best-effort 단계다.
    // 데이터랩이 실패해도 이미 채워진 SearchAd 데이터는 버리지 않고 저장한다.
    try {
      const datalabChunks = chunkArray(keywords, NAVER_DATALAB_BATCH_SIZE);
      const datalabResults = await mapWithConcurrency(
        datalabChunks,
        2,
        async (chunk, index) => {
          signal?.throwIfAborted();
          await operationCheckpoint?.({
            stage: 'collecting_naver_datalab',
            progressCurrent: index,
            progressTotal: datalabChunks.length,
          });
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
      await operationCheckpoint?.({
        stage: 'collecting_naver_datalab',
        progressCurrent: datalabChunks.length,
        progressTotal: datalabChunks.length,
      });
      signal?.throwIfAborted();
    } catch {
      signal?.throwIfAborted();
      // 트렌드 보강 실패는 무시(검색량 스냅샷은 유지). 소스별 결과는 상위에서 집계.
    }

    return rows;
  }

  private async buildPopularBoardRows(
    organizationId: string,
    businessDate: Date,
    capturedAt: Date,
    signal?: AbortSignal,
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

  private async collectShorts(
    organizationId: string,
    enabledSeeds: TrendSeedRow[],
    businessDate: Date,
    capturedAt: Date,
    triggeredByUserId: string | null,
    collectionRunKey?: string,
    signal?: AbortSignal,
    operationCheckpoint?: TrendCollectionControls['checkpoint'],
  ): Promise<TrendSourceCollectResult> {
    const seeds = collectionSeedsFor(enabledSeeds, 'shorts');
    let sourceError: string | undefined;
    const execution = await this.collectionCoordinator.execute(
      collectionRequest({
        organizationId,
        sourceKey: 'shortstrend.trend',
        targetKey: toDateString(businessDate),
        idempotencyKey: collectionIdempotencyKey(
          collectionRunKey,
          'shorts',
          businessDate,
          triggeredByUserId,
        ),
        requestHash: hashCollectionRequest({
          source: 'shorts',
          keywords: seeds.map((seed) => seed.keyword),
          businessDate: toDateString(businessDate),
        }),
        collectorKey: 'trend-shortstrend',
        triggerKind: triggeredByUserId ? 'manual' : 'schedule',
        triggeredByUserId,
      }),
      async ({ permit, checkpoint }) => {
        await checkpoint();
        signal?.throwIfAborted();
        await operationCheckpoint?.({
          stage: 'collecting_shorts',
          progressCurrent: 0,
          progressTotal: 1,
        });
        signal?.throwIfAborted();
        const result = await this.shortstrend.fetchTrending({
          keywords: seeds.map((seed) => seed.keyword),
          limit: SHORTS_LIMIT,
          publishedWithinDays: SHORTS_COLLECTION_WINDOW_DAYS,
          signal,
        });
        signal?.throwIfAborted();
        await operationCheckpoint?.({
          stage: 'collecting_shorts',
          progressCurrent: 1,
          progressTotal: 1,
        });
        if (result.error) {
          sourceError = result.error;
          return mapTrendTypedRecordsToAuthorizedOutput({
            permit,
            typedRecords: [],
            rejectedCount: 1,
            qualityReport: { source: 'shorts', error: sourceError },
          });
        }
        await checkpoint();
        signal?.throwIfAborted();
        const rows = buildShortsRows(organizationId, result.items ?? [], businessDate, capturedAt);
        return mapTrendTypedRecordsToAuthorizedOutput({
          permit,
          typedRecords: rows.map((row) => ({ kind: 'shorts' as const, row })),
          qualityReport: { source: 'shorts' },
        });
      },
    );
    if (sourceError) return { source: 'shorts', ok: false, collected: 0, error: sourceError };
    return { source: 'shorts', ok: true, collected: collectedFromExecution(execution) };
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

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function collectionRequest(input: {
  organizationId: string;
  sourceKey: string;
  targetKey: string;
  idempotencyKey: string;
  requestHash: string;
  collectorKey: string;
  triggerKind: 'manual' | 'schedule' | 'extension' | 'bootstrap' | 'retry';
  triggeredByUserId?: string | null;
}) {
  return {
    organizationId: input.organizationId,
    sourceKey: input.sourceKey,
    scopeKey: 'default',
    targetKey: normalizeCollectionTarget(input.targetKey),
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    collectorKey: input.collectorKey,
    collectorVersion: '2026-08-08',
    triggerKind: input.triggerKind,
    triggeredByUserId: input.triggeredByUserId ?? null,
    leaseDurationMs: 120_000,
  };
}

function collectionIdempotencyKey(
  collectionRunKey: string | undefined,
  source: TrendCollectSource,
  businessDate: Date,
  triggeredByUserId: string | null,
): string {
  const prefix = collectionRunKey?.trim() || `trend:${triggeredByUserId ?? 'schedule'}:${toDateString(businessDate)}`;
  return `${prefix}:${source}`;
}

function collectedFromExecution(execution: {
  kind: 'existing' | 'committed';
  acceptedCount?: number;
}): number {
  return execution.kind === 'committed' ? execution.acceptedCount ?? 0 : 0;
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
