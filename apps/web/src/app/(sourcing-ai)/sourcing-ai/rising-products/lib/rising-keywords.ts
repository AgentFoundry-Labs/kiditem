import type {
  NaverKeywordTrendView,
  PopularKeywordBoardView,
} from '../../market/lib/trend-collection-api';

// 우측 트렌드 키워드 소스. 우선순위:
//   1) 네이버 검색광고 키워드 트렌드 = 구체 키워드 + 실 월검색량 + 급상승(trendDelta).  ← 뾰족함
//   2) 없으면 DataLab 인기보드(완구/문구 카테고리 대분류) risers→latest 폴백.
// 이 키워드를 추적에 추가하면 확장이 쿠팡 SERP 를 수집 → 급상승 상품 탐지기 후보가 넓어진다.

export type TrendKeywordKind = 'search' | 'rising' | 'popular';

export interface TrendKeyword {
  keyword: string;
  kind: TrendKeywordKind;
  /** 검색광고 급상승 지표(양수 = 상승). search 키워드에만 있음. */
  trendDelta: number | null;
  /** 월간 총 검색량(네이버). search 키워드에만 있음 — 뾰족함/수요의 근거. */
  monthlySearchVolume: number | null;
  /** DataLab 보드 신규(NEW) 진입. */
  isNew: boolean;
  /** DataLab 보드 순위 상승 계단 수. */
  rankDelta: number | null;
  /** DataLab 보드 당일 최고 순위. */
  bestRank: number | null;
  /** 등장한 보드 라벨(popular/rising 만). */
  boards: string[];
  tracked: boolean;
}

export function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function buildTrendKeywords(input: {
  naverKeywords: NaverKeywordTrendView[];
  boards: PopularKeywordBoardView[];
  tracked: Iterable<string>;
  limit?: number;
}): TrendKeyword[] {
  const limit = Math.max(0, input.limit ?? 24);
  const trackedSet = new Set([...input.tracked].map(normalizeKeyword));

  // 1) 구체 키워드(검색광고) 우선.
  const search = buildSearchKeywords(input.naverKeywords, trackedSet);
  if (search.length > 0) return search.slice(0, limit);

  // 2) 폴백: DataLab 인기보드.
  return aggregateBoardKeywords(input.boards, trackedSet, limit);
}

/** DataLab 인기보드만 집계(폴백/독립 사용). */
export function aggregateTrendKeywords(
  boards: PopularKeywordBoardView[],
  trackedKeywords: Iterable<string>,
  limit = 24,
): TrendKeyword[] {
  const trackedSet = new Set([...trackedKeywords].map(normalizeKeyword));
  return aggregateBoardKeywords(boards, trackedSet, Math.max(0, limit));
}

function buildSearchKeywords(
  views: NaverKeywordTrendView[],
  trackedSet: Set<string>,
): TrendKeyword[] {
  const byKeyword = new Map<string, TrendKeyword>();
  for (const view of views) {
    const keyword = view.keyword.trim();
    if (!keyword) continue;
    const normalized = normalizeKeyword(keyword);
    if (byKeyword.has(normalized)) continue;
    byKeyword.set(normalized, {
      keyword,
      kind: 'search',
      trendDelta: view.latest.trendDelta,
      monthlySearchVolume: view.latest.monthlyTotalSearchCount,
      isNew: false,
      rankDelta: null,
      bestRank: null,
      boards: [],
      tracked: trackedSet.has(normalized),
    });
  }
  return [...byKeyword.values()].sort(searchOrder);
}

/** 급상승(trendDelta>0) 먼저 → trendDelta 큰 순 → 월검색량 큰 순. */
function searchOrder(a: TrendKeyword, b: TrendKeyword): number {
  const risingA = (a.trendDelta ?? 0) > 0 ? 1 : 0;
  const risingB = (b.trendDelta ?? 0) > 0 ? 1 : 0;
  if (risingA !== risingB) return risingB - risingA;
  if (risingA === 1) {
    const delta = (b.trendDelta ?? 0) - (a.trendDelta ?? 0);
    if (delta !== 0) return delta;
  }
  return (b.monthlySearchVolume ?? 0) - (a.monthlySearchVolume ?? 0);
}

function aggregateBoardKeywords(
  boards: PopularKeywordBoardView[],
  trackedSet: Set<string>,
  limit: number,
): TrendKeyword[] {
  const byKeyword = new Map<string, TrendKeyword>();

  // Pass 1 — 급상승(risers).
  for (const board of boards) {
    const label = board.boardLabel ?? board.boardKey;
    for (const riser of board.risers) {
      const keyword = riser.keyword.trim();
      if (!keyword) continue;
      const normalized = normalizeKeyword(keyword);
      const isNew = riser.rankDelta == null;
      const existing = byKeyword.get(normalized);
      if (!existing) {
        byKeyword.set(normalized, {
          keyword,
          kind: 'rising',
          trendDelta: null,
          monthlySearchVolume: null,
          isNew,
          rankDelta: riser.rankDelta,
          bestRank: null,
          boards: [label],
          tracked: trackedSet.has(normalized),
        });
        continue;
      }
      addBoard(existing, label);
      existing.isNew = existing.isNew || isNew;
      existing.rankDelta = mergeDelta(existing.rankDelta, riser.rankDelta);
    }
  }

  // Pass 2 — 당일 인기(latest) 폴백/보강.
  for (const board of boards) {
    const label = board.boardLabel ?? board.boardKey;
    for (const item of board.latest) {
      const keyword = item.keyword.trim();
      if (!keyword) continue;
      const normalized = normalizeKeyword(keyword);
      const existing = byKeyword.get(normalized);
      if (existing) {
        addBoard(existing, label);
        existing.bestRank = minRank(existing.bestRank, item.rank);
        continue;
      }
      byKeyword.set(normalized, {
        keyword,
        kind: 'popular',
        trendDelta: null,
        monthlySearchVolume: null,
        isNew: false,
        rankDelta: null,
        bestRank: item.rank,
        boards: [label],
        tracked: trackedSet.has(normalized),
      });
    }
  }

  return [...byKeyword.values()].sort(boardOrder).slice(0, limit);
}

function addBoard(entry: TrendKeyword, label: string): void {
  if (label && !entry.boards.includes(label)) entry.boards.push(label);
}

function mergeDelta(a: number | null, b: number | null): number | null {
  if (a == null) return a;
  if (b == null) return b;
  return Math.max(a, b);
}

function minRank(a: number | null, b: number): number {
  return a == null ? b : Math.min(a, b);
}

/** 급상승 먼저(NEW → rankDelta 큰 순), 그다음 인기(순위 낮은 순), 동률은 보드 수. */
function boardOrder(a: TrendKeyword, b: TrendKeyword): number {
  if (a.kind !== b.kind) return a.kind === 'rising' ? -1 : 1;
  if (a.kind === 'rising') {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    const delta = (b.rankDelta ?? 0) - (a.rankDelta ?? 0);
    if (delta !== 0) return delta;
    return b.boards.length - a.boards.length;
  }
  const rankA = a.bestRank ?? Number.POSITIVE_INFINITY;
  const rankB = b.bestRank ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) return rankA - rankB;
  return b.boards.length - a.boards.length;
}
