import {
  compareNaverDatalabSearchTrends,
  searchNaverAutocompleteKeywords,
  searchNaverDatalabPopularKeywords,
  searchNaverRelatedKeywords,
  type NaverDatalabDevice,
  type NaverDatalabGender,
  type NaverDatalabKeywordTrend,
  type NaverDatalabPopularKeywordBoard,
  type NaverDatalabPopularKeywordBoardKey,
  type NaverDatalabTimeUnit,
  type NaverRelatedKeyword,
} from '../../recommendations/lib/naver-keyword-api';
import {
  boardKeys,
  keywordOpportunityScore,
  matchesFocusMode,
  toSearchTrendAges,
  type BoardFilterKey,
  type FocusMode,
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

interface TrendKeywordAgentInput {
  timeUnit: NaverDatalabTimeUnit;
  gender: 'all' | NaverDatalabGender;
  age: string;
  device: 'all' | NaverDatalabDevice;
  selectedBoardKey: BoardFilterKey;
  rankLimit: string;
  focusMode: FocusMode;
  cachedBoards?: NaverDatalabPopularKeywordBoard[];
  finalLimit?: number;
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
const MAX_RELATED_SEEDS = 10;
const MAX_TREND_CANDIDATES = 40;

export async function runTrendKeywordAgent(input: TrendKeywordAgentInput): Promise<TrendKeywordAgentResult> {
  const notices: string[] = [];
  const boards = await loadPopularBoards(input, notices);
  const candidateMap = new Map<string, CandidateDraft>();

  const rankCap = Number(input.rankLimit);
  const filteredBoards = boards
    .filter((board) => input.selectedBoardKey === 'all' || board.key === input.selectedBoardKey)
    .filter((board) => matchesFocusMode(board.key, input.focusMode));

  for (const board of filteredBoards) {
    for (const rank of board.ranks.filter((item) => item.rank <= rankCap)) {
      addCandidate(candidateMap, rank.keyword, {
        sourceLabel: 'DataLab 순위',
        baseScore: keywordOpportunityScore(board.key, rank.rank) * 0.38,
        boardLabel: board.label,
        boardRank: rank.rank,
        reason: `${board.label} ${rank.rank}위`,
      });
    }
  }

  const seedKeywords = [...candidateMap.values()]
    .toSorted((a, b) => b.baseScore - a.baseScore || a.keyword.localeCompare(b.keyword, 'ko'))
    .map((candidate) => candidate.keyword)
    .slice(0, MAX_SEED_KEYWORDS);

  if (seedKeywords.length === 0) {
    notices.push('DataLab 인기 보드에서 쓸 수 있는 시드 키워드가 없었습니다.');
    return {
      generatedAt: new Date().toISOString(),
      candidates: [],
      seedCount: 0,
      expandedCount: 0,
      notices,
    };
  }

  await expandWithSearchAd(candidateMap, seedKeywords.slice(0, MAX_RELATED_SEEDS), notices);
  await expandWithAutocomplete(candidateMap, seedKeywords.slice(0, 5), notices);
  await attachTrendSignals(candidateMap, input, notices);

  const candidates = [...candidateMap.values()]
    .map(finalizeCandidate)
    .filter((candidate) => candidate.keyword.length >= 2)
    .toSorted((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword, 'ko'))
    .slice(0, input.finalLimit ?? 30);

  return {
    generatedAt: new Date().toISOString(),
    candidates,
    seedCount: seedKeywords.length,
    expandedCount: candidateMap.size,
    notices,
  };
}

async function loadPopularBoards(input: TrendKeywordAgentInput, notices: string[]) {
  try {
    const response = await searchNaverDatalabPopularKeywords({
      boardKeys,
      timeUnit: input.timeUnit,
      gender: input.gender === 'all' ? undefined : input.gender,
      device: input.device === 'all' ? undefined : input.device,
      ages: input.age === 'all' ? undefined : [input.age],
      limit: 20,
    });
    const failedCount = response.boards.filter((board) => board.error).length;
    if (failedCount > 0) notices.push(`DataLab 인기 보드 ${failedCount}개는 호출 제한으로 제외했습니다.`);
    return response.boards;
  } catch (error) {
    if (input.cachedBoards?.length) {
      notices.push('DataLab 인기 보드 새로고침에 실패해서 현재 화면의 보드로 계산했습니다.');
      return input.cachedBoards;
    }
    throw error;
  }
}

async function expandWithSearchAd(candidateMap: Map<string, CandidateDraft>, seeds: string[], notices: string[]) {
  const relatedItems: NaverRelatedKeyword[] = [];
  for (const seedBatch of chunk(seeds, 5)) {
    try {
      const response = await searchNaverRelatedKeywords({
        seedKeywords: seedBatch,
        maxResults: 100,
      });
      relatedItems.push(...response.items);
    } catch (error) {
      notices.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const item of relatedItems) {
    addCandidate(candidateMap, item.keyword, {
      sourceLabel: 'SearchAd',
      baseScore: searchVolumeScore(item.monthlyTotalSearchCount),
      monthlyTotalSearchCount: item.monthlyTotalSearchCount,
      reason: item.monthlyTotalSearchCount == null ? 'SearchAd 연관어' : `월 검색량 ${item.monthlyTotalSearchCount.toLocaleString('ko-KR')}`,
    });
  }
}

async function expandWithAutocomplete(candidateMap: Map<string, CandidateDraft>, seeds: string[], notices: string[]) {
  const responses = await Promise.allSettled(
    seeds.map((keyword) => searchNaverAutocompleteKeywords({ keyword, maxResults: 12 })),
  );

  for (const response of responses) {
    if (response.status === 'rejected') {
      notices.push(response.reason instanceof Error ? response.reason.message : String(response.reason));
      continue;
    }
    for (const item of response.value.items) {
      addCandidate(candidateMap, item.keyword, {
        sourceLabel: '자동완성',
        baseScore: Math.max(2, 9 - item.rank * 0.6),
        reason: `자동완성 ${item.rank}위`,
      });
    }
  }
}

async function attachTrendSignals(candidateMap: Map<string, CandidateDraft>, input: TrendKeywordAgentInput, notices: string[]) {
  const trendCandidates = [...candidateMap.values()]
    .toSorted((a, b) => {
      const monthlyDiff = (b.monthlyTotalSearchCount ?? 0) - (a.monthlyTotalSearchCount ?? 0);
      return b.baseScore - a.baseScore || monthlyDiff || a.keyword.localeCompare(b.keyword, 'ko');
    })
    .map((candidate) => candidate.keyword)
    .slice(0, MAX_TREND_CANDIDATES);

  if (trendCandidates.length === 0) return;

  try {
    const response = await compareNaverDatalabSearchTrends({
      keywords: trendCandidates,
      timeUnit: input.timeUnit,
      gender: input.gender === 'all' ? undefined : input.gender,
      device: input.device === 'all' ? undefined : input.device,
      ages: toSearchTrendAges(input.age),
    });
    for (const trend of response.items) {
      const candidate = candidateMap.get(compactKeyword(trend.keyword));
      if (!candidate) continue;
      candidate.trend = trend;
      candidate.sourceLabels.add('DataLab 추세');
      if (trend.trendDelta > 0) candidate.reasons.add(`최근 지수 +${formatRatio(trend.trendDelta)}`);
      else candidate.reasons.add(`최근 지수 ${formatRatio(trend.latestRatio)}`);
    }
  } catch (error) {
    notices.push(error instanceof Error ? error.message : String(error));
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
) {
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

function searchVolumeScore(value: number | null) {
  if (value == null || value <= 0) return 2;
  return Math.min(24, Math.log10(value + 1) * 4.5);
}

function compactKeyword(keyword: string) {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

function maxNullable(a: number | null, b: number | null | undefined) {
  if (b == null) return a;
  if (a == null) return b;
  return Math.max(a, b);
}

function formatRatio(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
