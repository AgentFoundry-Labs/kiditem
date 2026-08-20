import type {
  KeywordAnalysisSnapshot,
  NaverDatalabKeywordTrend,
  NaverDatalabPopularKeywordBoard,
  NaverRelatedKeyword,
} from '../../lib/keyword-analysis-snapshot-api';
import {
  keywordOpportunityScore,
  matchesFocusMode,
} from '../components/keyword-analysis-helpers';

export type TrendKeywordAgentGrade = '강함' | '검증' | '관찰';

export interface TrendKeywordAgentCandidate {
  keyword: string;
  score: number;
  grade: TrendKeywordAgentGrade;
  sourceLabels: string[];
  reasons: string[];
  monthlyTotalSearchCount: number | null;
  latestRatio: number | null;
  trendDelta: number | null;
  trendRate: number | null;
  boardLabel: string | null;
  boardRank: number | null;
}

export interface TrendKeywordAgentResult {
  generatedAt: string;
  candidates: TrendKeywordAgentCandidate[];
  seedCount: number;
  expandedCount: number;
  notices: string[];
}

interface CandidateDraft {
  keyword: string;
  sourceLabels: Set<string>;
  baseScore: number;
  monthlyTotalSearchCount: number | null;
  trend: NaverDatalabKeywordTrend | null;
  boardLabel: string | null;
  boardRank: number | null;
  reasons: Set<string>;
}

const MAX_SEED_KEYWORDS = 12;

/**
 * Pure presentation projection. Provider work and durable writes have already
 * completed in the exact operation handler that produced this snapshot.
 */
export function deriveTrendKeywordAgent(snapshot: KeywordAnalysisSnapshot): TrendKeywordAgentResult {
  const notices: string[] = [];
  const input = snapshot.input;
  const boards = snapshot.result.popular?.boards ?? [];
  const candidateMap = new Map<string, CandidateDraft>();
  const filteredBoards = boards
    .filter((board) => input.selectedBoardKey === 'all' || board.key === input.selectedBoardKey)
    .filter((board) => matchesFocusMode(board.key, input.focusMode));

  addPopularCandidates(candidateMap, filteredBoards, input.rankLimit);
  const seedKeywords = [...candidateMap.values()]
    .toSorted((left, right) => right.baseScore - left.baseScore || left.keyword.localeCompare(right.keyword, 'ko'))
    .map((candidate) => candidate.keyword)
    .slice(0, MAX_SEED_KEYWORDS);

  if (seedKeywords.length === 0) {
    notices.push('저장된 DataLab 인기 보드에서 쓸 수 있는 시드 키워드가 없었습니다.');
  }
  addRelatedCandidates(candidateMap, snapshot.result.related?.items ?? []);
  addAutocompleteCandidates(candidateMap, snapshot);
  addTrendCandidates(candidateMap, snapshot.result.trends?.items ?? []);

  const candidates = [...candidateMap.values()]
    .map(finalizeCandidate)
    .filter((candidate) => candidate.keyword.length >= 2)
    .toSorted((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword, 'ko'))
    .slice(0, input.finalLimit);

  return {
    generatedAt: snapshot.generatedAt,
    candidates,
    seedCount: seedKeywords.length,
    expandedCount: candidateMap.size,
    notices,
  };
}

function addPopularCandidates(
  candidateMap: Map<string, CandidateDraft>,
  boards: NaverDatalabPopularKeywordBoard[],
  rankLimit: number,
): void {
  for (const board of boards) {
    for (const rank of board.ranks.filter((item) => item.rank <= rankLimit)) {
      addCandidate(candidateMap, rank.keyword, {
        sourceLabel: 'DataLab 순위',
        baseScore: keywordOpportunityScore(board.key, rank.rank) * 0.38,
        boardLabel: board.label,
        boardRank: rank.rank,
        reason: `${board.label} ${rank.rank}위`,
      });
    }
  }
}

function addRelatedCandidates(
  candidateMap: Map<string, CandidateDraft>,
  items: NaverRelatedKeyword[],
): void {
  for (const item of items) {
    addCandidate(candidateMap, item.keyword, {
      sourceLabel: 'SearchAd',
      baseScore: searchVolumeScore(item.monthlyTotalSearchCount),
      monthlyTotalSearchCount: item.monthlyTotalSearchCount,
      reason: item.monthlyTotalSearchCount == null
        ? 'SearchAd 연관어'
        : `월 검색량 ${item.monthlyTotalSearchCount.toLocaleString('ko-KR')}`,
    });
  }
}

function addAutocompleteCandidates(
  candidateMap: Map<string, CandidateDraft>,
  snapshot: KeywordAnalysisSnapshot,
): void {
  for (const response of snapshot.result.autocomplete) {
    for (const item of response.items) {
      addCandidate(candidateMap, item.keyword, {
        sourceLabel: '자동완성',
        baseScore: Math.max(2, 9 - item.rank * 0.6),
        reason: `자동완성 ${item.rank}위`,
      });
    }
  }
}

function addTrendCandidates(
  candidateMap: Map<string, CandidateDraft>,
  trends: NaverDatalabKeywordTrend[],
): void {
  for (const trend of trends) {
    const candidate = candidateMap.get(compactKeyword(trend.keyword));
    if (!candidate) continue;
    candidate.trend = trend;
    candidate.sourceLabels.add('DataLab 추세');
    candidate.reasons.add(
      trend.trendDelta > 0
        ? `최근 지수 +${formatRatio(trend.trendDelta)}`
        : `최근 지수 ${formatRatio(trend.latestRatio)}`,
    );
  }
}

function addCandidate(
  candidateMap: Map<string, CandidateDraft>,
  keyword: string,
  input: {
    sourceLabel: string;
    baseScore: number;
    monthlyTotalSearchCount?: number | null;
    boardLabel?: string | null;
    boardRank?: number | null;
    reason?: string;
  },
): void {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword || normalizedKeyword.length < 2) return;
  const key = compactKeyword(normalizedKeyword);
  const current = candidateMap.get(key) ?? {
    keyword: normalizedKeyword,
    sourceLabels: new Set<string>(),
    baseScore: 0,
    monthlyTotalSearchCount: null,
    trend: null,
    boardLabel: null,
    boardRank: null,
    reasons: new Set<string>(),
  };
  current.sourceLabels.add(input.sourceLabel);
  current.baseScore += input.baseScore;
  current.monthlyTotalSearchCount = maxNullable(current.monthlyTotalSearchCount, input.monthlyTotalSearchCount);
  current.boardLabel = current.boardLabel ?? input.boardLabel ?? null;
  current.boardRank = current.boardRank ?? input.boardRank ?? null;
  if (input.reason) current.reasons.add(input.reason);
  candidateMap.set(key, current);
}

function finalizeCandidate(candidate: CandidateDraft): TrendKeywordAgentCandidate {
  const trend = candidate.trend;
  const trendScore = trend
    ? Math.min(26, Math.max(0, trend.trendDelta) * 0.55 + Math.max(0, trend.trendRate ?? 0) * 8 + trend.latestRatio * 0.08)
    : 0;
  const multiSourceScore = Math.min(12, candidate.sourceLabels.size * 3);
  const score = Math.max(0, Math.min(100, Math.round(candidate.baseScore + trendScore + multiSourceScore)));
  const reasons = [...candidate.reasons].slice(0, 4);
  if (candidate.sourceLabels.size >= 3) reasons.push('여러 출처에서 반복 등장');
  return {
    keyword: candidate.keyword,
    score,
    grade: score >= 78 ? '강함' : score >= 62 ? '검증' : '관찰',
    sourceLabels: [...candidate.sourceLabels],
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    monthlyTotalSearchCount: candidate.monthlyTotalSearchCount,
    latestRatio: trend?.latestRatio ?? null,
    trendDelta: trend?.trendDelta ?? null,
    trendRate: trend?.trendRate ?? null,
    boardLabel: candidate.boardLabel,
    boardRank: candidate.boardRank,
  };
}

function searchVolumeScore(value: number | null): number {
  if (value == null || value <= 0) return 2;
  return Math.min(24, Math.log10(value + 1) * 4.5);
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

function maxNullable(a: number | null, b: number | null | undefined): number | null {
  if (b == null) return a;
  if (a == null) return b;
  return Math.max(a, b);
}

function formatRatio(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
