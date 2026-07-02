import type {
  NaverDatalabDevice,
  NaverDatalabGender,
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordBoardKey,
  NaverDatalabPopularKeywordRank,
  NaverDatalabTimeUnit,
} from '../../recommendations/lib/naver-keyword-api';
import { rankedKeywordPoolBoardKeys } from '../../lib/ranked-keyword-pool';

export const boardKeys: NaverDatalabPopularKeywordBoardKey[] = [...rankedKeywordPoolBoardKeys];

export const timeUnitOptions: Array<{ value: NaverDatalabTimeUnit; label: string }> = [
  { value: 'date', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
];

export const genderOptions: Array<{ value: 'all' | NaverDatalabGender; label: string }> = [
  { value: 'all', label: '성별 전체' },
  { value: 'f', label: '여성' },
  { value: 'm', label: '남성' },
];

export const ageOptions = [
  { value: 'all', label: '연령 전체' },
  { value: '10', label: '10대' },
  { value: '20', label: '20대' },
  { value: '30', label: '30대' },
  { value: '40', label: '40대' },
  { value: '50', label: '50대' },
  { value: '60', label: '60대+' },
];

export const deviceOptions: Array<{ value: 'all' | NaverDatalabDevice; label: string }> = [
  { value: 'all', label: '기기 전체' },
  { value: 'mo', label: '모바일' },
  { value: 'pc', label: 'PC' },
];

export type BoardFilterKey = 'all' | NaverDatalabPopularKeywordBoardKey;
export type FocusMode = 'all' | 'toy_stationery' | 'kids';

export interface KeywordRankRow {
  board: NaverDatalabPopularKeywordBoard;
  rank: NaverDatalabPopularKeywordRank;
}

export interface BoardSummary {
  readyBoards: number;
  totalKeywords: number;
  focusedKeywords: number;
  failedBoards: number;
  topKeyword: string | null;
}

export interface RelatedKeywordGroups {
  tokens: Array<{ keyword: string; meta: string }>;
  hotKeywords: Array<{ keyword: string; meta: string }>;
  autocomplete: Array<{ keyword: string; meta: string }>;
}

export const boardFilterOptions: Array<{ value: BoardFilterKey; label: string; caption: string }> = [
  { value: 'all', label: '전체 보드', caption: '모든 인기 키워드' },
  { value: 'all_categories', label: '필터 없음', caption: '기본 TOP' },
  { value: 'birth_kids', label: '출산/육아', caption: '상위 카테고리' },
  { value: 'toys_dolls', label: '완구/인형', caption: '소싱 핵심' },
  { value: 'stationery_office', label: '문구/사무', caption: '소싱 핵심' },
  { value: 'kids_fashion', label: '유아동의류', caption: '계절 반응' },
];

export const rankLimitOptions = [
  { value: '10', label: 'TOP 10' },
  { value: '20', label: 'TOP 20' },
];

export const focusOptions: Array<{ value: FocusMode; label: string; caption: string }> = [
  { value: 'all', label: '전체', caption: '모든 보드 보기' },
  { value: 'toy_stationery', label: '완구·문구', caption: '현재 소싱 초점' },
  { value: 'kids', label: '키즈 전체', caption: '출산/육아 포함' },
];

const toyStationeryBoards = new Set<NaverDatalabPopularKeywordBoardKey>(['toys_dolls', 'stationery_office']);
const kidsBoards = new Set<NaverDatalabPopularKeywordBoardKey>(['birth_kids', 'toys_dolls', 'kids_fashion']);

export function timeUnitLabel(value: NaverDatalabTimeUnit): string {
  return timeUnitOptions.find((option) => option.value === value)?.label ?? value;
}

export function filterLabel(gender: 'all' | NaverDatalabGender, age: string): string {
  const genderLabel = genderOptions.find((option) => option.value === gender)?.label ?? '전체';
  const ageLabel = ageOptions.find((option) => option.value === age)?.label ?? '전체';
  return `${genderLabel} · ${ageLabel}`;
}

export function summarizeBoards(boards: NaverDatalabPopularKeywordBoard[]): BoardSummary {
  const readyBoards = boards.filter((board) => board.ranks.length > 0).length;
  const totalKeywords = boards.reduce((sum, board) => sum + board.ranks.length, 0);
  const focusedKeywords = boards
    .filter((board) => toyStationeryBoards.has(board.key))
    .reduce((sum, board) => sum + board.ranks.length, 0);
  const failedBoards = boards.filter((board) => board.error).length;
  const topKeyword = boards.find((board) => board.ranks.length > 0)?.ranks[0]?.keyword ?? null;

  return {
    readyBoards,
    totalKeywords,
    focusedKeywords,
    failedBoards,
    topKeyword,
  };
}

export function matchesFocusMode(boardKey: NaverDatalabPopularKeywordBoardKey, focusMode: FocusMode): boolean {
  if (focusMode === 'toy_stationery') return toyStationeryBoards.has(boardKey);
  if (focusMode === 'kids') return kidsBoards.has(boardKey);
  return true;
}

export function buildRelatedGroups(rows: KeywordRankRow[]): RelatedKeywordGroups {
  const tokenCounts = new Map<string, number>();
  const seenKeywords = new Set<string>();
  const hotKeywords: RelatedKeywordGroups['hotKeywords'] = [];
  const autocomplete: RelatedKeywordGroups['autocomplete'] = [];

  for (const { board, rank } of rows) {
    if (!seenKeywords.has(rank.keyword)) {
      seenKeywords.add(rank.keyword);
      hotKeywords.push({ keyword: rank.keyword, meta: `${board.label} ${rank.rank}위` });
    }

    for (const token of tokenizeKeyword(rank.keyword)) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
  }

  for (const keyword of [...seenKeywords].slice(0, 8)) {
    autocomplete.push(
      { keyword: `${keyword} 추천`, meta: '확장' },
      { keyword: `${keyword} 세트`, meta: '확장' },
    );
  }

  return {
    tokens: [...tokenCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
      .slice(0, 12)
      .map(([keyword, count]) => ({ keyword, meta: `${count}회` })),
    hotKeywords: hotKeywords.slice(0, 12),
    autocomplete: autocomplete.slice(0, 12),
  };
}

export function keywordOpportunityScore(boardKey: NaverDatalabPopularKeywordBoardKey, rank: number): number {
  const base = Math.max(45, 100 - rank * 4);
  const focusBoost = toyStationeryBoards.has(boardKey) ? 8 : kidsBoards.has(boardKey) ? 5 : 0;
  return Math.min(99, base + focusBoost);
}

export function keywordBadges(boardKey: NaverDatalabPopularKeywordBoardKey, rank: number): string[] {
  const badges = ['DataLab'];
  if (rank <= 3) badges.push('상위권');
  if (toyStationeryBoards.has(boardKey)) badges.push('완구·문구');
  if (kidsBoards.has(boardKey)) badges.push('키즈');
  badges.push('Wing 검증');
  return badges.slice(0, 4);
}

export function toSearchTrendAges(age: string): string[] | undefined {
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

function tokenizeKeyword(keyword: string): string[] {
  const tokens = keyword
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (tokens.length > 0) return tokens;
  return keyword.length >= 2 ? [keyword] : [];
}
