import type {
  NaverKeywordSparklinePoint,
  NaverKeywordTrendView,
  PopularKeywordBoardView,
} from './toy-trend-api';

export type ToyKeywordScope = 'all' | 'popular' | 'tracked';
export type ToyQuickFilter = 'new-entry' | 'rank-riser' | 'mobile-strong' | 'trend-up';
export type ToySortKey = 'rank' | 'searches' | 'mobile' | 'trend';
export type ToyClusterId =
  | 'new-entry'
  | 'rank-riser'
  | 'trend-up'
  | 'mobile-strong'
  | 'tracked'
  | 'popular';

export interface ToyKeywordFilters {
  scope: ToyKeywordScope;
  minSearches: number | null;
  query: string;
  quickFilters: ToyQuickFilter[];
  sortBy: ToySortKey;
}

export interface ToyKeywordSignal {
  id: string;
  keyword: string;
  boardRank: number | null;
  /** null은 신규 진입, number는 순위 상승 폭, undefined는 상승 신호 없음. */
  rankDelta: number | null | undefined;
  monthlyTotalSearchCount: number | null;
  monthlyPcSearchCount: number | null;
  monthlyMobileSearchCount: number | null;
  competitionIndex: string | null;
  averageAdRank: number | null;
  trendRatio: number | null;
  trendDelta: number | null;
  businessDate: string | null;
  sparkline: NaverKeywordSparklinePoint[];
  inPopularBoard: boolean;
  tracked: boolean;
}

export interface ToyKeywordCluster {
  id: ToyClusterId;
  label: string;
  caption: string;
  keywords: ToyKeywordSignal[];
  measuredMonthlySearchTotal: number;
  measuredKeywordCount: number;
}

const clusterMeta: Record<ToyClusterId, { label: string; caption: string }> = {
  'new-entry': { label: '신규 진입', caption: '이전 비교일에는 없던 완구 인기검색어' },
  'rank-riser': { label: '순위 상승', caption: '완구 인기검색어 순위가 오른 키워드' },
  'trend-up': { label: '검색지수 상승', caption: 'DataLab 검색지수가 이전 평균보다 상승' },
  'mobile-strong': { label: '모바일 강함', caption: 'SearchAd 모바일 검색 비중 80% 이상' },
  tracked: { label: '추적 시드', caption: '네이버 수집 시드로 저장된 키워드' },
  popular: { label: '완구 인기검색어', caption: '네이버 DataLab 완구/인형 최신 순위' },
};

export function mergeToyKeywordSignals(
  board: PopularKeywordBoardView | undefined,
  trends: NaverKeywordTrendView[],
): ToyKeywordSignal[] {
  const byKeyword = new Map<string, ToyKeywordSignal>();
  const rankDeltaByKeyword = new Map(
    (board?.risers ?? []).map((item) => [normalizeKeyword(item.keyword), item.rankDelta]),
  );

  for (const item of board?.latest ?? []) {
    const normalized = normalizeKeyword(item.keyword);
    byKeyword.set(normalized, {
      id: normalized,
      keyword: item.keyword,
      boardRank: item.rank,
      rankDelta: rankDeltaByKeyword.get(normalized),
      monthlyTotalSearchCount: null,
      monthlyPcSearchCount: null,
      monthlyMobileSearchCount: null,
      competitionIndex: null,
      averageAdRank: null,
      trendRatio: null,
      trendDelta: null,
      businessDate: null,
      sparkline: [],
      inPopularBoard: true,
      tracked: false,
    });
  }

  for (const trend of trends) {
    const normalized = normalizeKeyword(trend.keyword);
    const existing = byKeyword.get(normalized);
    byKeyword.set(normalized, {
      id: normalized,
      keyword: existing?.keyword ?? trend.keyword,
      boardRank: existing?.boardRank ?? null,
      rankDelta: existing?.rankDelta,
      monthlyTotalSearchCount: trend.latest.monthlyTotalSearchCount,
      monthlyPcSearchCount: trend.latest.monthlyPcSearchCount,
      monthlyMobileSearchCount: trend.latest.monthlyMobileSearchCount,
      competitionIndex: trend.latest.competitionIndex,
      averageAdRank: trend.latest.averageAdRank,
      trendRatio: trend.latest.trendRatio,
      trendDelta: trend.latest.trendDelta,
      businessDate: trend.latest.businessDate,
      sparkline: trend.sparkline,
      inPopularBoard: existing?.inPopularBoard ?? false,
      tracked: true,
    });
  }

  return [...byKeyword.values()];
}

export function mobileShare(keyword: ToyKeywordSignal): number | null {
  const total = keyword.monthlyTotalSearchCount;
  const mobile = keyword.monthlyMobileSearchCount;
  if (total === null || mobile === null || total <= 0) return null;
  return Math.round((mobile / total) * 100);
}

export function filterToyKeywords(
  keywords: ToyKeywordSignal[],
  filters: ToyKeywordFilters,
): ToyKeywordSignal[] {
  const normalizedQuery = normalizeKeyword(filters.query);
  const filtered = keywords.filter((keyword) => {
    if (filters.scope === 'popular' && !keyword.inPopularBoard) return false;
    if (filters.scope === 'tracked' && !keyword.tracked) return false;
    if (
      filters.minSearches !== null
      && (keyword.monthlyTotalSearchCount === null
        || keyword.monthlyTotalSearchCount < filters.minSearches)
    ) return false;
    if (normalizedQuery && !normalizeKeyword(keyword.keyword).includes(normalizedQuery)) return false;
    return filters.quickFilters.every((filter) => matchesQuickFilter(keyword, filter));
  });

  return [...filtered].sort((a, b) => compareToyKeywords(a, b, filters.sortBy));
}

export function clusterToyKeywords(keywords: ToyKeywordSignal[]): ToyKeywordCluster[] {
  const byCluster = new Map<ToyClusterId, ToyKeywordSignal[]>();
  for (const keyword of keywords) {
    const clusterId = resolveCluster(keyword);
    const rows = byCluster.get(clusterId) ?? [];
    rows.push(keyword);
    byCluster.set(clusterId, rows);
  }

  return (Object.keys(clusterMeta) as ToyClusterId[]).flatMap((id) => {
    const clusterKeywords = byCluster.get(id) ?? [];
    if (clusterKeywords.length === 0) return [];
    const measured = clusterKeywords.filter((keyword) => keyword.monthlyTotalSearchCount !== null);
    return [{
      id,
      ...clusterMeta[id],
      keywords: clusterKeywords,
      measuredMonthlySearchTotal: measured.reduce(
        (sum, keyword) => sum + (keyword.monthlyTotalSearchCount ?? 0),
        0,
      ),
      measuredKeywordCount: measured.length,
    }];
  });
}

export function buildToyKeywordCsv(keywords: ToyKeywordSignal[]): string {
  const header = [
    '키워드',
    '완구 인기순위',
    '순위 변화',
    '월 검색량',
    'PC 검색량',
    '모바일 검색량',
    '모바일 비중',
    '검색광고 경쟁',
    '평균 광고순위',
    'DataLab 검색지수',
    '검색지수 변화',
    '데이터 기준일',
    '데이터 출처',
  ];
  const rows = keywords.map((keyword) => [
    keyword.keyword,
    keyword.boardRank,
    keyword.rankDelta === null ? '신규' : keyword.rankDelta,
    keyword.monthlyTotalSearchCount,
    keyword.monthlyPcSearchCount,
    keyword.monthlyMobileSearchCount,
    mobileShare(keyword),
    keyword.competitionIndex,
    keyword.averageAdRank,
    keyword.trendRatio,
    keyword.trendDelta,
    keyword.businessDate,
    keywordSourceLabel(keyword),
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${value === null || value === undefined ? '' : String(value).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
}

export function keywordSourceLabel(keyword: ToyKeywordSignal): string {
  if (keyword.inPopularBoard && keyword.tracked) return 'DataLab 인기순위 + SearchAd/DataLab 시드';
  if (keyword.tracked) return 'SearchAd/DataLab 시드';
  return 'DataLab 인기순위';
}

function matchesQuickFilter(keyword: ToyKeywordSignal, filter: ToyQuickFilter): boolean {
  switch (filter) {
    case 'new-entry':
      return keyword.rankDelta === null;
    case 'rank-riser':
      return typeof keyword.rankDelta === 'number' && keyword.rankDelta > 0;
    case 'mobile-strong': {
      const share = mobileShare(keyword);
      return share !== null && share >= 80;
    }
    case 'trend-up':
      return keyword.trendDelta !== null && keyword.trendDelta > 0;
  }
}

function resolveCluster(keyword: ToyKeywordSignal): ToyClusterId {
  if (keyword.rankDelta === null) return 'new-entry';
  if (typeof keyword.rankDelta === 'number' && keyword.rankDelta > 0) return 'rank-riser';
  if (keyword.trendDelta !== null && keyword.trendDelta > 0) return 'trend-up';
  const share = mobileShare(keyword);
  if (share !== null && share >= 80) return 'mobile-strong';
  if (keyword.tracked) return 'tracked';
  return 'popular';
}

function compareToyKeywords(
  a: ToyKeywordSignal,
  b: ToyKeywordSignal,
  sortBy: ToySortKey,
): number {
  const fallback = compareNullableAscending(a.boardRank, b.boardRank)
    || a.keyword.localeCompare(b.keyword, 'ko-KR');
  switch (sortBy) {
    case 'rank':
      return fallback;
    case 'searches':
      return compareNullableDescending(a.monthlyTotalSearchCount, b.monthlyTotalSearchCount) || fallback;
    case 'mobile':
      return compareNullableDescending(a.monthlyMobileSearchCount, b.monthlyMobileSearchCount) || fallback;
    case 'trend':
      return compareNullableDescending(a.trendDelta, b.trendDelta) || fallback;
  }
}

function compareNullableAscending(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareNullableDescending(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replaceAll(/\s+/g, '').toLocaleLowerCase('ko-KR');
}
