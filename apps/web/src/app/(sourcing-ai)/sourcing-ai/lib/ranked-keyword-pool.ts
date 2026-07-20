import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import type {
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordBoardKey,
} from '../recommendations/lib/naver-keyword-api';

export const rankedKeywordPoolBoardKeys: NaverDatalabPopularKeywordBoardKey[] = [
  'toys_dolls',
  'toys_block',
  'toys_action',
  'toys_roleplay',
  'toys_puzzle',
  'fancy_sticker',
  'fancy_goods',
  'fancy_diary',
  'stationery_writing',
  'stationery_note',
];

const RANKED_KEYWORD_POOL_STORAGE_KEY = 'kiditem:sourcing-ai:keyword-analysis:ranked-keyword-pool:v1';
export const RANKED_KEYWORD_POOL_UPDATED_EVENT = 'kiditem:sourcing-ai:ranked-keyword-pool-updated';
const focusedBoardScoreBoost: Partial<Record<NaverDatalabPopularKeywordBoardKey, number>> = {
  toys_dolls: 10,
  toys_block: 10,
  toys_action: 10,
  toys_roleplay: 10,
  toys_puzzle: 10,
  fancy_sticker: 10,
  fancy_goods: 10,
  fancy_diary: 10,
  stationery_writing: 10,
  stationery_note: 10,
  stationery_office: 8,
  birth_kids: 5,
  kids_fashion: 4,
};

export interface RankedKeywordPoolFilters {
  timeUnit: string;
  gender: string;
  age: string;
  device: string;
  boardKey: string;
  rankLimit: string;
  focusMode: string;
}

export interface RankedKeywordPoolEntry {
  poolRank: number;
  keyword: string;
  sourceRank: number;
  score: number;
  boardKey: NaverDatalabPopularKeywordBoardKey;
  boardLabel: string;
  categoryPath: string;
  categories: string[];
}

export interface RankedKeywordPoolSnapshot {
  version: 1;
  updatedAt: number;
  filters: RankedKeywordPoolFilters;
  entries: RankedKeywordPoolEntry[];
}

export function buildRankedKeywordPoolSnapshot(input: {
  boards: NaverDatalabPopularKeywordBoard[];
  filters: RankedKeywordPoolFilters;
  limit?: number;
  updatedAt?: number;
}): RankedKeywordPoolSnapshot {
  return {
    version: 1,
    updatedAt: input.updatedAt ?? Date.now(),
    filters: input.filters,
    entries: extractRankedKeywordPoolEntries(input.boards, input.limit ?? 50),
  };
}

export function extractRankedKeywordPoolEntries(
  boards: NaverDatalabPopularKeywordBoard[],
  limit = 50,
): RankedKeywordPoolEntry[] {
  const deduped = new Map<string, Omit<RankedKeywordPoolEntry, 'poolRank'>>();

  for (const board of boards) {
    for (const rank of board.ranks) {
      const keyword = rank.keyword.trim();
      if (!keyword) continue;

      const score = Math.max(
        1,
        110 - rank.rank * 4 + (focusedBoardScoreBoost[board.key] ?? 0),
      );
      const key = compactKeyword(keyword);
      const current = deduped.get(key);
      const next = {
        keyword,
        sourceRank: rank.rank,
        score,
        boardKey: board.key,
        boardLabel: board.label,
        categoryPath: board.categoryPath,
        categories: rank.categories,
      };

      if (!current || next.score > current.score || (next.score === current.score && next.sourceRank < current.sourceRank)) {
        deduped.set(key, next);
      }
    }
  }

  return [...deduped.values()]
    .sort((a, b) => (
      b.score - a.score ||
      a.sourceRank - b.sourceRank ||
      a.keyword.localeCompare(b.keyword, 'ko')
    ))
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      poolRank: index + 1,
    }));
}

export function readRankedKeywordPool(): RankedKeywordPoolSnapshot | null {
  try {
    const raw = safeStorageGet('local', RANKED_KEYWORD_POOL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isRankedKeywordPoolSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRankedKeywordPool(snapshot: RankedKeywordPoolSnapshot) {
  if (typeof window === 'undefined') return;
  safeStorageSet('local', RANKED_KEYWORD_POOL_STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new Event(RANKED_KEYWORD_POOL_UPDATED_EVENT));
}

export function rankedKeywordPoolToText(snapshot: RankedKeywordPoolSnapshot, limit: number): string {
  return snapshot.entries
    .slice(0, limit)
    .map((entry) => entry.keyword)
    .join('\n');
}

function isRankedKeywordPoolSnapshot(value: unknown): value is RankedKeywordPoolSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RankedKeywordPoolSnapshot>;
  return snapshot.version === 1 && Array.isArray(snapshot.entries);
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}
