import { isStationeryToyKeyword } from './stationery-toy-keyword';
import type { TrendOpportunity } from './market-intelligence';
import type { NaverKeywordTrendView } from './trend-collection-api';

const MAX_TREND_CANDIDATES = 50;

interface SearchTrendItem {
  keyword: string;
  latestRatio: number;
  previousAverageRatio: number;
  trendDelta: number;
  trendRate: number | null;
  data: Array<{ period: string; ratio: number }>;
}

interface SearchTrendResponse {
  source: 'naver-datalab-search-trend';
  generatedAt: string;
  items: SearchTrendItem[];
}

interface RelatedKeywordItem {
  keyword: string;
  monthlyTotalSearchCount: number | null;
  competitionIndex: string | null;
}

interface RelatedKeywordResponse {
  source: 'naver-searchad-keywordstool';
  generatedAt: string;
  items: RelatedKeywordItem[];
}

export interface LiveNaverMarketResult {
  source: 'naver-persisted-snapshot' | 'naver-live';
  generatedAt: string;
  opportunities: TrendOpportunity[];
  warnings: string[];
}

/**
 * `trendNaverKeywords` 캐시는 원시 스냅샷을 담는다. 기회 목록이 필요한 화면은 이 함수를
 * React Query `select` 로 넘겨 파생한다(모듈 수준이라 참조가 안정적이다).
 */
export function selectPersistedNaverMarket(snapshot: { keywords: NaverKeywordTrendView[] }): LiveNaverMarketResult {
  return buildPersistedNaverMarketResult(snapshot.keywords);
}

/**
 * 화면은 이미 저장된 네이버 일별 스냅샷(`fetchNaverKeywordTrends`)만 읽고, 이 함수로 기회 목록을 파생한다.
 * 원천 수집은 명시적 수집 CTA 에서만 시작한다.
 */
export function buildPersistedNaverMarketResult(
  keywords: NaverKeywordTrendView[],
): LiveNaverMarketResult {
  const candidates = keywords
    .filter((item) => isStationeryToyKeyword(item.keyword))
    .slice(0, MAX_TREND_CANDIDATES);
  const maxVolume = Math.max(
    ...candidates.map((item) => item.latest.monthlyTotalSearchCount ?? 0),
    1,
  );
  const opportunities = candidates
    .map((candidate) => {
      const monthlySearches = candidate.latest.monthlyTotalSearchCount;
      const momentum = round(clamp(candidate.latest.trendDelta ?? 0, -99.9, 999.9), 1);
      const volumeScore = Math.round(
        (Math.log1p(monthlySearches ?? 0) / Math.log1p(maxVolume)) * 100,
      );
      const trendScore = clamp(candidate.latest.trendRatio ?? 25, 0, 100);
      const score = Math.round(volumeScore * 0.4 + trendScore * 0.6);
      const competition = normalizeCompetition(candidate.latest.competitionIndex);
      const rightsCheckRequired = looksLikeLicensedKeyword(candidate.keyword);
      return {
        id: `naver-snapshot-${compactKeyword(candidate.keyword)}`,
        keyword: candidate.keyword,
        category: classifyCategory(candidate.keyword),
        trendRank: 0,
        previousTrendRank: null,
        score,
        decision: rightsCheckRequired
          ? 'licensed' as const
          : score >= 72 && competition !== '높음' ? 'focus' as const : 'test' as const,
        monthlySearches,
        shoppingRank: null,
        momentum,
        competition,
        sources: ['NAVER' as const],
        evidence: `저장된 네이버 검색량 ${monthlySearches?.toLocaleString('ko-KR') ?? '집계 중'} · 검색지수 ${candidate.latest.trendRatio ?? '집계 중'} · 경쟁 ${competition}`,
        nextAction: rightsCheckRequired
          ? '상표·캐릭터 정식 유통 증빙이 확인되는 상품만 검토하고 무단 IP 상품은 제외하세요.'
          : competition === '높음'
            ? '경쟁 상품의 가격·리뷰 장벽을 먼저 확인하고 구매 의도가 더 구체적인 하위 키워드로 좁히세요.'
            : '쿠팡 검색결과와 1688 공급가를 이어서 확인한 뒤 30~100개 단위로 검증하세요.',
        points: candidate.sparkline.slice(-7).map((point) => ({
          date: point.businessDate.slice(5),
          search: point.trendRatio ?? 0,
          commerce: volumeScore,
          social: 0,
        })),
      } satisfies TrendOpportunity;
    })
    .sort((left, right) => right.score - left.score || right.momentum - left.momentum)
    .slice(0, 20)
    .map((opportunity, index) => ({
      ...opportunity,
      trendRank: index + 1,
      points: opportunity.points.length > 0
        ? opportunity.points
        : [{ date: '저장 없음', search: 0, commerce: 0, social: 0 }],
    }));
  const latestBusinessDate = candidates
    .map((item) => item.latest.businessDate)
    .sort()
    .at(-1);

  return {
    source: 'naver-persisted-snapshot',
    generatedAt: latestBusinessDate ? `${latestBusinessDate}T00:00:00.000Z` : '',
    opportunities,
    warnings: [],
  };
}

export function buildLiveNaverMarketResult(input: {
  related: RelatedKeywordResponse;
  trends: SearchTrendResponse | null;
  warnings?: string[];
}): LiveNaverMarketResult {
  const candidates = normalizeRelatedCandidates(input.related.items).slice(0, MAX_TREND_CANDIDATES);
  const trendByKeyword = new Map(
    (input.trends?.items ?? []).map((item) => [compactKeyword(item.keyword), item]),
  );
  const maxVolume = Math.max(...candidates.map((item) => item.monthlyTotalSearchCount ?? 0), 1);

  const opportunities = candidates
    .map((candidate) => {
      const trend = trendByKeyword.get(compactKeyword(candidate.keyword));
      const momentum = trend?.trendRate == null
        ? 0
        : round(clamp(trend.trendRate * 100, -99.9, 999.9), 1);
      const volumeScore = Math.round(
        (Math.log1p(candidate.monthlyTotalSearchCount ?? 0) / Math.log1p(maxVolume)) * 100,
      );
      const trendScore = trend ? clamp(50 + momentum / 2, 0, 100) : 25;
      const score = Math.round(volumeScore * 0.4 + trendScore * 0.6);
      const competition = normalizeCompetition(candidate.competitionIndex);
      const rightsCheckRequired = looksLikeLicensedKeyword(candidate.keyword);
      const points = (trend?.data ?? []).slice(-7).map((point) => ({
        date: point.period.slice(5),
        search: round(point.ratio, 1),
        commerce: volumeScore,
        social: 0,
      }));

      return {
        id: `live-naver-${compactKeyword(candidate.keyword)}`,
        keyword: candidate.keyword,
        category: classifyCategory(candidate.keyword),
        trendRank: 0,
        previousTrendRank: null,
        score,
        decision: rightsCheckRequired
          ? 'licensed' as const
          : score >= 72 && competition !== '높음' ? 'focus' as const : 'test' as const,
        monthlySearches: candidate.monthlyTotalSearchCount,
        shoppingRank: null,
        momentum,
        competition,
        sources: ['NAVER' as const],
        evidence: `네이버 검색광고 월간 검색 ${candidate.monthlyTotalSearchCount?.toLocaleString('ko-KR') ?? '집계 중'}${
          trend
            ? ` · 최근 검색지수 ${formatRatio(trend.latestRatio)} (이전 평균 ${formatRatio(trend.previousAverageRatio)})`
            : ''
        } · 경쟁 ${competition}`,
        nextAction: rightsCheckRequired
          ? '상표·캐릭터 정식 유통 증빙이 확인되는 상품만 검토하고 무단 IP 상품은 제외하세요.'
          : competition === '높음'
          ? '경쟁 상품의 가격·리뷰 장벽을 먼저 확인하고 구매 의도가 더 구체적인 하위 키워드로 좁히세요.'
          : '쿠팡 검색결과와 1688 공급가를 이어서 확인한 뒤 30~100개 단위로 검증하세요.',
        points: points.length > 0
          ? points
          : [{ date: '현재', search: 0, commerce: volumeScore, social: 0 }],
      } satisfies TrendOpportunity;
    })
    .sort((a, b) => b.score - a.score || b.momentum - a.momentum || (b.monthlySearches ?? 0) - (a.monthlySearches ?? 0))
    .slice(0, 20)
    .map((opportunity, index) => ({ ...opportunity, trendRank: index + 1 }));

  return {
    source: 'naver-live',
    generatedAt: input.trends?.generatedAt ?? input.related.generatedAt,
    opportunities,
    warnings: input.warnings ?? [],
  };
}

function normalizeRelatedCandidates(items: RelatedKeywordItem[]): RelatedKeywordItem[] {
  const byKeyword = new Map<string, RelatedKeywordItem>();
  for (const item of items) {
    const keyword = item.keyword.trim();
    const key = compactKeyword(keyword);
    if (
      !key
      || keyword.length < 2
      || item.monthlyTotalSearchCount == null
      || !isStationeryToyKeyword(keyword)
    ) continue;
    const existing = byKeyword.get(key);
    if (!existing || (item.monthlyTotalSearchCount ?? 0) > (existing.monthlyTotalSearchCount ?? 0)) {
      byKeyword.set(key, { ...item, keyword });
    }
  }
  return [...byKeyword.values()].sort(
    (a, b) => (b.monthlyTotalSearchCount ?? 0) - (a.monthlyTotalSearchCount ?? 0),
  );
}

function classifyCategory(keyword: string): 'toy' | 'stationery' {
  return /문구|스티커|키링|키홀더|필통|연필|펜|노트|다이어리|메모|지우개|가위|테이프|비즈|공예|만들기|색칠/.test(keyword)
    ? 'stationery'
    : 'toy';
}

function looksLikeLicensedKeyword(keyword: string): boolean {
  return /포켓몬|산리오|티니핑|터닝메카드|헬로카봇|뽀로로|타요|브레드이발소|시크릿쥬쥬|또봇|레고|디즈니|마블|짱구|쿠로미|마이멜로디/i.test(keyword);
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function normalizeCompetition(value: string | null | undefined): '낮음' | '중간' | '높음' {
  if (!value) return '중간';
  const normalized = value.trim().toLocaleLowerCase('ko-KR');
  if (normalized === '높음' || normalized === 'high') return '높음';
  if (normalized === '낮음' || normalized === 'low') return '낮음';
  return '중간';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatRatio(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
