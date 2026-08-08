import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { kstBusinessDate } from '../../../common/kst';
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
  hashCollectionRequest,
  mapTrendTypedRecordsToAuthorizedOutput,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';

const POPULAR_HISTORY_LOOKBACK_DAYS = 30;

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
  ) {}

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
