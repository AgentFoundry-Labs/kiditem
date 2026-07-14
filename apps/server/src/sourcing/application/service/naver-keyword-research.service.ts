import { Inject, Injectable, Logger } from '@nestjs/common';
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

const POPULAR_HISTORY_LOOKBACK_DAYS = 30;

@Injectable()
export class NaverKeywordResearchService {
  private readonly logger = new Logger(NaverKeywordResearchService.name);

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
  ) {}

  getStatus(): NaverKeywordResearchStatus {
    return this.keywordResearch.getStatus();
  }

  getDatalabStatus(): NaverDatalabTrendStatus {
    return this.datalabTrend.getStatus();
  }

  searchRelatedKeywords(input: SearchNaverRelatedKeywordsInput): Promise<SearchNaverRelatedKeywordsResult> {
    return this.keywordResearch.searchRelatedKeywords(input);
  }

  compareSearchTrends(
    input: CompareNaverDatalabSearchTrendsInput,
  ): Promise<CompareNaverDatalabSearchTrendsResult> {
    return this.datalabTrend.compareSearchTrends(input);
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
  ): Promise<SearchNaverDatalabPopularKeywordsResult> {
    const result = await this.popularKeywords.searchPopularKeywords(input);

    try {
      const capturedAt = new Date();
      const businessDate = kstBusinessDate(capturedAt);
      const history = await this.trendRepo.findPopularKeywordHistory({
        organizationId,
        days: POPULAR_HISTORY_LOOKBACK_DAYS,
      });
      annotatePopularKeywordChange(result.boards, history, businessDate);

      const rows = buildPopularSnapshotRows(result.boards, organizationId, businessDate, capturedAt);
      if (rows.length > 0) {
        await this.trendRepo.replaceNaverPopularKeywordSnapshots(rows);
      }
    } catch (error) {
      this.logger.warn(
        `인기키워드 NEW 표시/일별 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return result;
  }

  searchAutocompleteKeywords(
    input: SearchNaverAutocompleteKeywordsInput,
  ): Promise<SearchNaverAutocompleteKeywordsResult> {
    return this.autocompleteKeywords.searchAutocompleteKeywords(input);
  }
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
