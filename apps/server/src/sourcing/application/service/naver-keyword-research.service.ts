import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  SourcingKeywordAnalysisInputSchema,
  SourcingKeywordAnalysisSnapshotSchema,
  type SourcingKeywordAnalysisInput,
  type SourcingKeywordAnalysisSnapshot,
} from '@kiditem/shared/sourcing';
import { randomUUID } from 'node:crypto';
import { kstBusinessDate } from '../../../common/kst';
import type { ActiveOperationAttemptTransaction } from '../../../operations/application/port/active-browser-attempt-transaction';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type NaverPopularKeywordSnapshotRow,
  type NaverPopularKeywordSnapshotUpsert,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
  type CompareNaverDatalabSearchTrendsInput,
  type CompareNaverDatalabSearchTrendsResult,
  type NaverAutocompleteKeywordPort,
  type NaverDatalabPopularKeywordBoard,
  type NaverDatalabPopularKeywordPort,
  type NaverDatalabTrendPort,
  type NaverDatalabTrendStatus,
  type NaverKeywordResearchPort,
  type NaverKeywordResearchStatus,
  type SearchNaverAutocompleteKeywordsInput,
  type SearchNaverAutocompleteKeywordsResult,
  type SearchNaverDatalabPopularKeywordsInput,
  type SearchNaverDatalabPopularKeywordsResult,
  type SearchNaverRelatedKeywordsInput,
  type SearchNaverRelatedKeywordsResult,
} from '../port/out/provider/naver-keyword-research.port';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  hashCollectionRequest,
  mapTrendTypedRecordsToAuthorizedOutput,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';

const POPULAR_HISTORY_LOOKBACK_DAYS = 30;
const KEYWORD_ANALYSIS_PROJECTION_VERSION = 'naver-keyword-analysis/v1';
const KEYWORD_ANALYSIS_SNAPSHOT_LOOKBACK_DAYS = 30;
const MAX_ANALYSIS_SEEDS = 12;
const MAX_ANALYSIS_AUTOCOMPLETE_SEEDS = 5;
const MAX_ANALYSIS_TREND_KEYWORDS = 40;

type KeywordAnalysisInput = SourcingKeywordAnalysisInput;
export type NaverKeywordAnalysisSnapshotPayload = SourcingKeywordAnalysisSnapshot;

export interface NaverKeywordAnalysisCollectionControls {
  signal: AbortSignal;
  checkpoint: () => Promise<void>;
  withinActiveOperationAttemptFence: <T>(
    callback: (transaction: ActiveOperationAttemptTransaction) => Promise<T>,
  ) => Promise<T>;
}

@Injectable()
export class NaverKeywordResearchService {
  constructor(
    @Inject(SOURCING_NAVER_KEYWORD_RESEARCH_PORT)
    private readonly keywordResearch: NaverKeywordResearchPort,
    @Inject(SOURCING_NAVER_DATALAB_TREND_PORT)
    private readonly datalabTrend: NaverDatalabTrendPort,
    @Inject(SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT)
    private readonly popularKeywords: NaverDatalabPopularKeywordPort,
    @Inject(SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT)
    private readonly autocompleteKeywords: NaverAutocompleteKeywordPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trendRepo: TrendCollectionRepositoryPort,
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  /**
   * The exact owner operation for Naver keyword analysis. Provider work is
   * cancel-aware and its sole persisted projection is committed under the
   * active OperationRun attempt transaction supplied by the handler.
   */
  async collectAnalysis(input: {
    organizationId: string;
    input: Record<string, unknown>;
  } & NaverKeywordAnalysisCollectionControls): Promise<{
    snapshot: SourcingWorkspaceSnapshotRow;
    payload: NaverKeywordAnalysisSnapshotPayload;
  }> {
    const normalized = SourcingKeywordAnalysisInputSchema.parse(input.input);
    await checkpointKeywordAnalysis(input);

    const result = await this.collectAnalysisProviders(normalized, input);

    await checkpointKeywordAnalysis(input);
    const capturedAt = new Date();
    const payload = SourcingKeywordAnalysisSnapshotSchema.parse({
      version: KEYWORD_ANALYSIS_PROJECTION_VERSION,
      generatedAt: capturedAt.toISOString(),
      input: normalized,
      result,
    });
    const snapshot = await input.withinActiveOperationAttemptFence((transaction) =>
      this.snapshots.upsertInAttempt(transaction, {
        organizationId: input.organizationId,
        scope: 'keyword_analysis',
        businessDate: kstBusinessDate(capturedAt),
        projectionVersion: KEYWORD_ANALYSIS_PROJECTION_VERSION,
        inputHash: hashCollectionRequest(normalized),
        payload,
      }),
    );
    return { snapshot, payload };
  }

  /** Read-only lookup of the last exact, owner-persisted operation result. */
  async getAnalysisSnapshot(
    organizationId: string,
    rawInput: Record<string, unknown>,
    now = new Date(),
  ): Promise<NaverKeywordAnalysisSnapshotPayload | null> {
    const input = SourcingKeywordAnalysisInputSchema.parse(rawInput);
    const toBusinessDate = kstBusinessDate(now);
    const fromBusinessDate = new Date(
      toBusinessDate.getTime() - (KEYWORD_ANALYSIS_SNAPSHOT_LOOKBACK_DAYS - 1) * 86_400_000,
    );
    const [snapshot] = await this.snapshots.listRecent({
      organizationId,
      scope: 'keyword_analysis',
      fromBusinessDate,
      toBusinessDate,
      limit: 1,
      projectionVersion: KEYWORD_ANALYSIS_PROJECTION_VERSION,
      inputHash: hashCollectionRequest(input),
    });
    return snapshot ? SourcingKeywordAnalysisSnapshotSchema.parse(snapshot.payload) : null;
  }

  getStatus(): NaverKeywordResearchStatus {
    return this.keywordResearch.getStatus();
  }

  getDatalabStatus(): NaverDatalabTrendStatus {
    return this.datalabTrend.getStatus();
  }

  searchRelatedKeywords(
    organizationId: string,
    input: SearchNaverRelatedKeywordsInput,
    idempotencyKey?: string,
  ): Promise<SearchNaverRelatedKeywordsResult> {
    return this.readThroughAuthorizedRun({
      organizationId,
      sourceKey: 'naver.searchad_keyword',
      request: input,
      idempotencyKey,
      collectorKey: 'direct-naver-related-keywords',
      provider: () => this.keywordResearch.searchRelatedKeywords(input),
    });
  }

  compareSearchTrends(
    organizationId: string,
    input: CompareNaverDatalabSearchTrendsInput,
    idempotencyKey?: string,
  ): Promise<CompareNaverDatalabSearchTrendsResult> {
    return this.readThroughAuthorizedRun({
      organizationId,
      sourceKey: 'naver.datalab_trend',
      request: input,
      idempotencyKey,
      collectorKey: 'direct-naver-search-trends',
      provider: () => this.datalabTrend.compareSearchTrends(input),
    });
  }

  /**
   * 인기 키워드 보드를 조회하면서, 매 조회마다 오늘 순위를
   * `NaverPopularKeywordDailySnapshot` 에 저장하고 직전 저장일 순위와 비교해
   * 각 키워드에 `isNew`/`rankDelta` 를 부여한다(어제 대비 신규/급상승 표시용).
   * 저장/비교 실패는 조회 자체를 막지 않는다(그래도 순위는 반환).
   */
  async searchPopularKeywords(
    input: SearchNaverDatalabPopularKeywordsInput,
    organizationId: string,
    idempotencyKey?: string,
  ): Promise<SearchNaverDatalabPopularKeywordsResult> {
    let result: SearchNaverDatalabPopularKeywordsResult | null = null;
    await this.collectionCoordinator.execute(
      collectionRequest({
        organizationId,
        sourceKey: 'naver.datalab_popular',
        request: input,
        idempotencyKey,
        collectorKey: 'direct-naver-popular-keywords',
      }),
      async ({ permit, checkpoint }) => {
        await checkpoint();
        const providerResult = await this.popularKeywords.searchPopularKeywords(input);
        result = providerResult;
        const capturedAt = new Date();
        const businessDate = kstBusinessDate(capturedAt);
        let typedRecords: ReturnType<typeof buildPopularSnapshotRows> = [];
        let projectionError: string | null = null;
        try {
          const history = await this.trendRepo.findPopularKeywordHistory({
            organizationId,
            days: POPULAR_HISTORY_LOOKBACK_DAYS,
          });
          annotatePopularKeywordChange(providerResult.boards, history, businessDate);
          typedRecords = buildPopularSnapshotRows(
            providerResult.boards,
            organizationId,
            businessDate,
            capturedAt,
          );
        } catch (error) {
          projectionError = error instanceof Error ? error.message : String(error);
        }
        await checkpoint();
        return mapTrendTypedRecordsToAuthorizedOutput({
          permit,
          typedRecords: typedRecords.map((row) => ({ kind: 'naver_popular_keyword' as const, row })),
          qualityReport: {
            source: 'naver-popular',
            boardCount: providerResult.boards.length,
            projectionError,
          },
        });
      },
    );
    if (!result) throw new BadRequestException('An idempotent popular-keyword query is already in progress.');
    return result;
  }

  searchAutocompleteKeywords(
    organizationId: string,
    input: SearchNaverAutocompleteKeywordsInput,
    idempotencyKey?: string,
  ): Promise<SearchNaverAutocompleteKeywordsResult> {
    return this.readThroughAuthorizedRun({
      organizationId,
      sourceKey: 'naver.autocomplete',
      request: input,
      idempotencyKey,
      collectorKey: 'direct-naver-autocomplete',
      provider: () => this.autocompleteKeywords.searchAutocompleteKeywords(input),
    });
  }

  private async collectAnalysisProviders(
    input: KeywordAnalysisInput,
    controls: Pick<NaverKeywordAnalysisCollectionControls, 'signal' | 'checkpoint'>,
  ): Promise<NaverKeywordAnalysisSnapshotPayload['result']> {
    let popular: SearchNaverDatalabPopularKeywordsResult | null = null;
    let related: SearchNaverRelatedKeywordsResult | null = null;
    let autocomplete: SearchNaverAutocompleteKeywordsResult[] = [];
    let trends: CompareNaverDatalabSearchTrendsResult | null = null;

    if (input.action === 'popular' || input.action === 'trend_agent') {
      popular = await this.popularKeywords.searchPopularKeywords({
        timeUnit: input.timeUnit,
        gender: input.gender === 'all' ? undefined : input.gender,
        device: input.device === 'all' ? undefined : input.device,
        ages: input.age === 'all' ? undefined : [input.age],
        limit: input.rankLimit,
        signal: controls.signal,
      });
      await checkpointKeywordAnalysis(controls);
    }

    const relatedSeed = input.action === 'related'
      ? [input.keyword as string]
      : input.action === 'trend_agent'
        ? collectAnalysisSeeds(popular?.boards ?? [], input)
        : [];
    if (relatedSeed.length > 0) {
      related = await this.keywordResearch.searchRelatedKeywords({
        seedKeywords: relatedSeed,
        maxResults: 100,
        signal: controls.signal,
      });
      await checkpointKeywordAnalysis(controls);
      autocomplete = await Promise.all(
        relatedSeed.slice(0, MAX_ANALYSIS_AUTOCOMPLETE_SEEDS).map((keyword) =>
          this.autocompleteKeywords.searchAutocompleteKeywords({
            keyword,
            maxResults: 30,
            signal: controls.signal,
          }),
        ),
      );
      await checkpointKeywordAnalysis(controls);
    }

    const trendKeywords = input.action === 'compare'
      ? input.keywords ?? []
      : input.action === 'related'
        ? (related?.items ?? []).map((item) => item.keyword).slice(0, MAX_ANALYSIS_TREND_KEYWORDS)
        : input.action === 'trend_agent'
          ? uniqueKeywords([
            ...relatedSeed,
            ...(related?.items ?? []).map((item) => item.keyword),
            ...autocomplete.flatMap((item) => item.items.map((candidate) => candidate.keyword)),
          ]).slice(0, MAX_ANALYSIS_TREND_KEYWORDS)
          : [];
    if (trendKeywords.length > 0) {
      trends = await this.datalabTrend.compareSearchTrends({
        keywords: trendKeywords,
        timeUnit: input.timeUnit,
        gender: input.gender === 'all' ? undefined : input.gender,
        device: input.device === 'all' ? undefined : input.device,
        ages: toSearchTrendAges(input.age),
        signal: controls.signal,
      });
      await checkpointKeywordAnalysis(controls);
    }

    return { popular, related, autocomplete, trends };
  }

  private async readThroughAuthorizedRun<T>(input: {
    organizationId: string;
    sourceKey: string;
    request: unknown;
    idempotencyKey?: string;
    collectorKey: string;
    provider: () => Promise<T>;
  }): Promise<T> {
    let result: T | null = null;
    await this.collectionCoordinator.execute(
      collectionRequest(input),
      async ({ checkpoint }) => {
        await checkpoint();
        result = await input.provider();
        await checkpoint();
        return {
          observations: [],
          typedRecords: [],
          discoveredCount: 0,
          rejectedCount: 0,
          qualityReport: { source: input.sourceKey, mode: 'read' },
        };
      },
    );
    if (result === null) {
      throw new BadRequestException('An idempotent research query is already in progress.');
    }
    return result;
  }
}

function collectionRequest(input: {
  organizationId: string;
  sourceKey: string;
  request: unknown;
  idempotencyKey?: string;
  collectorKey: string;
}) {
  const requestHash = hashCollectionRequest(input.request);
  return {
    organizationId: input.organizationId,
    sourceKey: input.sourceKey,
    scopeKey: 'default',
    targetKey: `request:${requestHash}`,
    idempotencyKey: input.idempotencyKey?.trim() || `${input.collectorKey}:${randomUUID()}`,
    requestHash,
    collectorKey: input.collectorKey,
    collectorVersion: '2026-08-08',
    triggerKind: 'manual' as const,
    triggeredByUserId: null,
    leaseDurationMs: 120_000,
  };
}

function normalizePopularKeyword(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/** 직전(오늘 이전 최신) 저장일의 보드별 keyword→rank 맵을 만들어 각 rank 에 NEW/변동을 채운다. */
function annotatePopularKeywordChange(
  boards: NaverDatalabPopularKeywordBoard[],
  history: NaverPopularKeywordSnapshotRow[],
  todayBusinessDate: Date,
): void {
  const todayTime = todayBusinessDate.getTime();

  // pass 1: 보드별 "오늘 이전" 최신 businessDate
  const priorDateByBoard = new Map<string, number>();
  for (const row of history) {
    const time = new Date(row.businessDate).getTime();
    if (time >= todayTime) continue;
    const current = priorDateByBoard.get(row.boardKey);
    if (current === undefined || time > current) priorDateByBoard.set(row.boardKey, time);
  }

  // pass 2: 그 날짜의 keyword→rank
  const priorRankByBoard = new Map<string, Map<string, number>>();
  for (const row of history) {
    if (priorDateByBoard.get(row.boardKey) !== new Date(row.businessDate).getTime()) continue;
    let map = priorRankByBoard.get(row.boardKey);
    if (!map) {
      map = new Map();
      priorRankByBoard.set(row.boardKey, map);
    }
    map.set(normalizePopularKeyword(row.keyword), row.rank);
  }

  for (const board of boards) {
    const prior = priorRankByBoard.get(board.key);
    for (const rank of board.ranks) {
      if (!prior) {
        // 직전 데이터 없음 → 판단 불가(신규로 오인 금지)
        rank.isNew = false;
        rank.previousRank = null;
        rank.rankDelta = null;
        continue;
      }
      const previousRank = prior.get(normalizePopularKeyword(rank.keyword));
      if (previousRank === undefined) {
        rank.isNew = true;
        rank.previousRank = null;
        rank.rankDelta = null;
      } else {
        rank.isNew = false;
        rank.previousRank = previousRank;
        rank.rankDelta = previousRank - rank.rank;
      }
    }
  }
}

function buildPopularSnapshotRows(
  boards: NaverDatalabPopularKeywordBoard[],
  organizationId: string,
  businessDate: Date,
  capturedAt: Date,
): NaverPopularKeywordSnapshotUpsert[] {
  const rows: NaverPopularKeywordSnapshotUpsert[] = [];
  const seen = new Set<string>();
  for (const board of boards) {
    if (board.error) continue;
    for (const rank of board.ranks) {
      const keyword = rank.keyword.trim();
      if (!keyword) continue;
      const dedupeKey = `${board.key}:${normalizePopularKeyword(keyword)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push({
        organizationId,
        boardKey: board.key,
        boardLabel: board.label,
        cid: board.cid == null ? null : String(board.cid),
        businessDate,
        rank: rank.rank,
        keyword,
        linkId: rank.linkId,
        capturedAt,
      });
    }
  }
  return rows;
}

async function checkpointKeywordAnalysis(
  controls: Pick<NaverKeywordAnalysisCollectionControls, 'signal' | 'checkpoint'>,
): Promise<void> {
  controls.signal.throwIfAborted();
  await controls.checkpoint();
  controls.signal.throwIfAborted();
}

function collectAnalysisSeeds(
  boards: NaverDatalabPopularKeywordBoard[],
  input: KeywordAnalysisInput,
): string[] {
  const candidates = boards
    .filter((board) => input.selectedBoardKey === 'all' || board.key === input.selectedBoardKey)
    .filter((board) => matchesKeywordAnalysisFocus(board.key, input.focusMode))
    .flatMap((board) => board.ranks
      .filter((rank) => rank.rank <= input.rankLimit)
      .map((rank) => rank.keyword));
  return uniqueKeywords(candidates).slice(0, MAX_ANALYSIS_SEEDS);
}

function matchesKeywordAnalysisFocus(
  boardKey: string,
  focusMode: KeywordAnalysisInput['focusMode'],
): boolean {
  if (focusMode === 'all') return true;
  if (focusMode === 'toy_stationery') {
    return /toy|fancy|stationery/.test(boardKey);
  }
  return /birth|kids|toy|fancy|stationery/.test(boardKey);
}

function uniqueKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of keywords) {
    const keyword = value.trim();
    const key = keyword.replace(/\s+/g, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

function toSearchTrendAges(age: string): string[] | undefined {
  const mapped: Record<string, string[]> = {
    '10': ['2'],
    '20': ['3', '4'],
    '30': ['5', '6'],
    '40': ['7', '8'],
    '50': ['9', '10'],
    '60': ['11'],
  };
  return mapped[age];
}
